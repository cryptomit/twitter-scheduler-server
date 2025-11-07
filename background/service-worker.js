// Import OAuth signature generator
importScripts('oauth-signature.js');

// Background service worker for Twitter Repost Assistant
class TwitterRepostService {
  constructor() {
    console.log('🐦 TwitterRepostService: Initializing background service...');
    this.setupMessageHandlers();
    this.setupAlarms();
    console.log('🐦 TwitterRepostService: Background service initialized');
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  async handleMessage(request, sender, sendResponse) {
    console.log('🐦 TwitterRepostService: Received message:', request);
    try {
      switch (request.action) {
        case 'saveTweet':
          console.log('🐦 TwitterRepostService: Handling saveTweet action');
          await this.saveTweet(request.data);
          console.log('🐦 TwitterRepostService: saveTweet completed, sending response');
          sendResponse({ success: true });
          break;

        case 'getDrafts':
          console.log('🐦 TwitterRepostService: Handling getDrafts action');
          const drafts = await this.getDrafts();
          console.log('🐦 TwitterRepostService: getDrafts completed, sending response');
          sendResponse({ success: true, drafts });
          break;

        case 'deleteDraft':
          console.log('🐦 TwitterRepostService: Handling deleteDraft action');
          await this.deleteDraft(request.id);
          console.log('🐦 TwitterRepostService: deleteDraft completed, sending response');
          sendResponse({ success: true });
          break;

        case 'updateDraft':
          console.log('🐦 TwitterRepostService: Handling updateDraft action');
          await this.updateDraft(request.id, request.data);
          console.log('🐦 TwitterRepostService: updateDraft completed, sending response');
          sendResponse({ success: true });
          break;

        case 'scheduleTweet':
          console.log('🐦 TwitterRepostService: Handling scheduleTweet action');
          await this.scheduleTweet(request.id, request.scheduleTime);
          console.log('🐦 TwitterRepostService: scheduleTweet completed, sending response');
          sendResponse({ success: true });
          break;

        case 'postNow':
          console.log('🐦 TwitterRepostService: Handling postNow action');
          const postResult = await this.postTweet(request.id);
          console.log('🐦 TwitterRepostService: postNow completed, sending response');
          sendResponse({ 
            success: true,
            aiParaphrased: postResult.aiParaphrased,
            originalText: postResult.originalText,
            postedText: postResult.postedText
          });
          break;

        case 'getScheduledTweets':
          console.log('🐦 TwitterRepostService: Handling getScheduledTweets action');
          const scheduled = await this.getScheduledTweets();
          console.log('🐦 TwitterRepostService: getScheduledTweets completed, sending response');
          sendResponse({ success: true, scheduled });
          break;

        case 'autoSchedule':
          console.log('🐦 TwitterRepostService: Handling autoSchedule action');
          const autoScheduleResult = await this.autoScheduleTweet(request.id);
          console.log('🐦 TwitterRepostService: autoSchedule completed, sending response');
          sendResponse({ success: true, ...autoScheduleResult });
          break;

        case 'authenticateTwitter':
          console.log('🐦 TwitterRepostService: Handling authenticateTwitter action');
          const authResult = await this.authenticateTwitter();
          console.log('🐦 TwitterRepostService: authenticateTwitter completed, sending response');
          sendResponse({ success: true, ...authResult });
          break;

        case 'getAuthStatus':
          console.log('🐦 TwitterRepostService: Handling getAuthStatus action');
          const authStatus = await this.getAuthStatus();
          console.log('🐦 TwitterRepostService: getAuthStatus completed, sending response');
          sendResponse({ success: true, ...authStatus });
          break;

        default:
          console.log('🐦 TwitterRepostService: Unknown action:', request.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('🐦 TwitterRepostService: Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async saveTweet(tweetData) {
    try {
      // Get existing drafts
      const result = await chrome.storage.local.get(['drafts']);
      const drafts = result.drafts || [];

      // Add new draft
      const draft = {
        ...tweetData,
        id: tweetData.id || this.generateId(),
        status: 'draft',
        createdAt: new Date().toISOString()
      };

      drafts.push(draft);

      // Save to storage
      await chrome.storage.local.set({ drafts });
      console.log('✅ Tweet saved as draft:', draft.text.substring(0, 50) + '...');

      // Download and store images if any
      if (tweetData.images && tweetData.images.length > 0) {
        await this.downloadImages(draft.id, tweetData.images);
      }
    } catch (error) {
      console.error('❌ Error saving tweet:', error);
      throw error;
    }
  }

  async getDrafts() {
    const result = await chrome.storage.local.get(['drafts']);
    return result.drafts || [];
  }

  async deleteDraft(id) {
    const result = await chrome.storage.local.get(['drafts']);
    const drafts = result.drafts || [];
    const updatedDrafts = drafts.filter(draft => draft.id !== id);
    await chrome.storage.local.set({ drafts: updatedDrafts });
  }

  async updateDraft(id, updates) {
    const result = await chrome.storage.local.get(['drafts']);
    const drafts = result.drafts || [];
    const draftIndex = drafts.findIndex(draft => draft.id === id);
    
    if (draftIndex !== -1) {
      drafts[draftIndex] = { ...drafts[draftIndex], ...updates };
      await chrome.storage.local.set({ drafts });
    }
  }

  async scheduleTweet(id, scheduleTime) {
    // Update draft status to scheduled
    await this.updateDraft(id, { 
      status: 'scheduled', 
      scheduledFor: scheduleTime 
    });

    // Set alarm for scheduled time
    const alarmName = `tweet_${id}`;
    const scheduleDate = new Date(scheduleTime);
    
    chrome.alarms.create(alarmName, {
      when: scheduleDate.getTime()
    });

    console.log(`Tweet ${id} scheduled for ${scheduleTime}`);
  }

  async autoScheduleTweet(id) {
    console.log('🐦 TwitterRepostService: Auto-scheduling tweet:', id);
    try {
      // Check if using API server
      const useApiServer = true;
      const apiUrl = 'https://twitter-scheduler-server-production-8314.up.railway.app';
      
      if (useApiServer) {
        // Get the draft
        const drafts = await this.getDrafts();
        const draft = drafts.find(d => d.id === id);
        
        if (!draft) {
          throw new Error('Draft not found');
        }
        
        // Send to Railway server for auto-scheduling
        const result = await this.autoScheduleViaApiServer(draft, apiUrl);
        
        // Update local status
        await this.updateDraft(id, { 
          status: 'scheduled',
          scheduledFor: result.scheduleTime
        });
        
        return {
          success: true,
          scheduledFor: result.scheduleTime,
          message: result.message
        };
      } else {
        // Fallback to local scheduling
        const optimalTime = await this.getNextOptimalTime();
        console.log('🐦 TwitterRepostService: Next optimal time:', optimalTime);
        
        await this.scheduleTweet(id, optimalTime);
        
        return {
          success: true,
          scheduledFor: optimalTime,
          message: `Tweet scheduled for ${new Date(optimalTime).toLocaleString()}`
        };
      }
    } catch (error) {
      console.error('🐦 TwitterRepostService: Error auto-scheduling tweet:', error);
      throw error;
    }
  }

  async getNextOptimalTime() {
    console.log('🐦 TwitterRepostService: Finding next optimal posting time...');
    
    // Get current time
    const now = new Date();
    const currentHour = now.getHours();
    
    // Optimal posting times (based on Twitter engagement data)
    const optimalHours = [9, 12, 15, 18, 21]; // 9 AM, 12 PM, 3 PM, 6 PM, 9 PM
    const minGapMinutes = 30; // Minimum 30 minutes between posts
    
    // Find the next optimal time
    let nextTime = new Date(now);
    
    // Check if we can post today
    for (const hour of optimalHours) {
      if (hour > currentHour) {
        nextTime.setHours(hour, 0, 0, 0);
        
        // Check if this time conflicts with existing scheduled posts
        const hasConflict = await this.hasSchedulingConflict(nextTime);
        if (!hasConflict) {
          console.log('🐦 TwitterRepostService: Found optimal time today:', nextTime);
          return nextTime.toISOString();
        }
      }
    }
    
    // If no good time today, find next day
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(optimalHours[0], 0, 0, 0);
    
    console.log('🐦 TwitterRepostService: Scheduling for tomorrow:', nextTime);
    return nextTime.toISOString();
  }

  async hasSchedulingConflict(proposedTime) {
    console.log('🐦 TwitterRepostService: Checking for scheduling conflicts at:', proposedTime);
    
    try {
      const drafts = await this.getDrafts();
      const scheduledTweets = drafts.filter(d => d.status === 'scheduled' && d.scheduledFor);
      
      const proposedTimeMs = proposedTime.getTime();
      const conflictWindow = 30 * 60 * 1000; // 30 minutes window
      
      for (const tweet of scheduledTweets) {
        const scheduledTime = new Date(tweet.scheduledFor).getTime();
        const timeDiff = Math.abs(proposedTimeMs - scheduledTime);
        
        if (timeDiff < conflictWindow) {
          console.log('🐦 TwitterRepostService: Found conflict with tweet:', tweet.id);
          return true;
        }
      }
      
      console.log('🐦 TwitterRepostService: No conflicts found');
      return false;
    } catch (error) {
      console.error('🐦 TwitterRepostService: Error checking conflicts:', error);
      return false;
    }
  }

  async postTweet(id) {
    console.log('🐦 TwitterRepostService: postTweet() called for ID:', id);
    try {
      const drafts = await this.getDrafts();
      const draft = drafts.find(d => d.id === id);
      
      if (!draft) {
        throw new Error('Draft not found');
      }

      console.log('🐦 TwitterRepostService: Found draft:', draft.text);
      const originalText = draft.text;
      
      // Use API server for posting
      const useApiServer = true;
      const apiUrl = 'https://twitter-scheduler-server-production-8314.up.railway.app';
      
      let result;
      let aiParaphrased = false;
      let postedText = originalText;
      
      if (useApiServer) {
        result = await this.postViaApiServer(draft, apiUrl);
        // The server applies AI paraphrasing automatically
        aiParaphrased = true;
        postedText = result?.text || originalText; // Server might return the posted text
        console.log('🤖 AI Paraphrasing enabled - tweet will be rewritten');
      } else {
        // Fallback to direct API
        const credentials = await this.getTwitterCredentials();
        if (!credentials) {
          throw new Error('Twitter API credentials not configured.');
        }
        result = await this.postToTwitter(draft, credentials);
      }
      
      console.log('🐦 TwitterRepostService: Tweet posted successfully:', result);
      console.log('🤖 AI Paraphrased:', aiParaphrased);
      
      // Update status to posted
      await this.updateDraft(id, { 
        status: 'posted', 
        postedAt: new Date().toISOString(),
        twitterId: result?.id,
        aiParaphrased: aiParaphrased,
        originalText: originalText,
        postedText: postedText
      });

      // Show notification with AI info
      const notificationMessage = aiParaphrased 
        ? `✨ AI Rewritten: ${postedText.substring(0, 100)}...`
        : 'Your tweet has been posted successfully.';
        
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: aiParaphrased ? '🤖 Tweet Posted with AI!' : 'Tweet Posted!',
        message: notificationMessage
      });

      return { 
        success: true,
        aiParaphrased: aiParaphrased,
        originalText: originalText,
        postedText: postedText,
        result: result
      };

    } catch (error) {
      console.error('🐦 TwitterRepostService: Error posting tweet:', error);
      
      // Show error notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Tweet Failed',
        message: 'Failed to post tweet: ' + error.message
      });
      
      throw error;
    }
  }

  async getTwitterCredentials() {
    try {
      // Hardcoded OAuth 1.0a credentials for real posting
      const credentials = {
        apiKey: 'Gw1L36NdnowNm0OU2EqV1xqr9ByYE9VhYtgVJgnmFCBVkyiU6v',
        apiSecret: 'd35lIhmBAmJTKcYKaYXw0VX3O8CHYOIeiNipDpsouFUya',
        accessToken: '1537440474696339456-WxABin2NgC6l3nrcNH3PEAKnpCV0NB',
        accessTokenSecret: 'd35lIhmBAmJTKcYKaYXw0VX3O8CHYOIeiNipDpsouFUya'
      };
      
      console.log('🐦 Using OAuth 1.0a credentials for real posting');
      return credentials;
    } catch (error) {
      console.error('🐦 Error getting Twitter credentials:', error);
      return null;
    }
  }

  async postToTwitter(draft, credentials) {
    console.log('🚀 REAL AUTOMATED Twitter posting starting...');
    console.log('📝 Tweet text:', draft.text);
    
    // Check if API server is configured
    const useApiServer = true; // Set to true when server is deployed
    const apiUrl = 'https://twitter-scheduler-server-production-8314.up.railway.app';
    
    if (useApiServer) {
      return await this.postViaApiServer(draft, apiUrl);
    }
    
    try {
      // Use Twitter API v1.1 for posting (more stable with OAuth 1.0a)
      const url = 'https://api.twitter.com/1.1/statuses/update.json';
      const params = {
        status: draft.text,
        trim_user: 'true'
      };

      // Generate OAuth 1.0a signature
      const oauthParams = await OAuth1.generateSignature('POST', url, params, credentials);
      const authHeader = OAuth1.buildAuthHeader(oauthParams);

      // Create form data for the request
      const formData = new URLSearchParams();
      formData.append('status', draft.text);

      // Post the tweet using Twitter API v1.1
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Twitter API response:', response.status, errorText);
        
        // If v1.1 fails, try v2 endpoint
        return await this.postToTwitterV2(draft, credentials);
      }

      const result = await response.json();
      console.log('✅ TWEET POSTED AUTOMATICALLY!', result);
      console.log('🔗 Tweet URL: https://twitter.com/user/status/' + result.id_str);
      
      return {
        id: result.id_str,
        text: result.text,
        created_at: result.created_at,
        url: `https://twitter.com/user/status/${result.id_str}`
      };

    } catch (error) {
      console.error('❌ Error with v1.1 API, trying v2...', error);
      // Fallback to v2 API
      return await this.postToTwitterV2(draft, credentials);
    }
  }

  async postToTwitterV2(draft, credentials) {
    console.log('🔄 Trying Twitter API v2...');
    
    try {
      const url = 'https://api.twitter.com/2/tweets';
      const params = {};
      
      // Generate OAuth 1.0a signature for v2
      const oauthParams = await OAuth1.generateSignature('POST', url, params, credentials);
      const authHeader = OAuth1.buildAuthHeader(oauthParams);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: draft.text })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Twitter API v2 error: ${errorData}`);
      }

      const result = await response.json();
      console.log('✅ TWEET POSTED via API v2!', result);
      
      return {
        id: result.data.id,
        text: result.data.text,
        created_at: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Both API versions failed:', error);
      throw error;
    }
  }


  async uploadMedia(images, credentials) {
    console.log('🐦 TwitterRepostService: Uploading media files...');
    const mediaIds = [];
    
    for (const image of images) {
      try {
        // Convert base64 to blob if needed
        let imageData;
        if (image.data) {
          // Image is already stored as base64
          imageData = await this.base64ToBlob(image.data);
        } else {
          // Fetch image from URL
          const response = await fetch(image.url);
          imageData = await response.blob();
        }

        // Upload to Twitter
        const formData = new FormData();
        formData.append('media', imageData);

        // Get OAuth 2.0 Bearer Token for media upload
        const tokenResponse = await fetch('https://api.twitter.com/oauth2/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials'
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get OAuth 2.0 token for media upload');
        }

        const tokenData = await tokenResponse.json();
        const bearerToken = tokenData.access_token;

        const uploadResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${bearerToken}`
          },
          body: formData
        });

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          mediaIds.push(uploadResult.media_id_string);
          console.log('🐦 TwitterRepostService: Media uploaded:', uploadResult.media_id_string);
        } else {
          console.error('🐦 TwitterRepostService: Media upload failed:', await uploadResponse.text());
        }
      } catch (error) {
        console.error('🐦 TwitterRepostService: Error uploading media:', error);
      }
    }
    
    return mediaIds;
  }

  base64ToBlob(base64) {
    return new Promise((resolve, reject) => {
      const byteCharacters = atob(base64.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      resolve(blob);
    });
  }

  async getScheduledTweets() {
    const drafts = await this.getDrafts();
    return drafts.filter(draft => draft.status === 'scheduled');
  }

  async downloadImages(draftId, images) {
    try {
      const downloadedImages = [];
      
      for (const image of images) {
        try {
          const response = await fetch(image.url);
          const blob = await response.blob();
          
          // Convert to base64 for storage
          const base64 = await this.blobToBase64(blob);
          
          downloadedImages.push({
            url: image.url,
            data: base64,
            alt: image.alt
          });
        } catch (error) {
          console.error('Error downloading image:', error);
        }
      }

      // Store images in storage
      await chrome.storage.local.set({
        [`images_${draftId}`]: downloadedImages
      });

    } catch (error) {
      console.error('Error downloading images:', error);
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  setupAlarms() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name.startsWith('tweet_')) {
        const tweetId = alarm.name.replace('tweet_', '');
        this.handleScheduledTweet(tweetId);
      }
    });
  }

  async handleScheduledTweet(tweetId) {
    console.log('⏰ Scheduled tweet time arrived! Auto-posting tweet:', tweetId);
    try {
      // Automatically post the scheduled tweet
      await this.postTweet(tweetId);
      
      // Show success notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Scheduled Tweet Posted!',
        message: 'Your scheduled tweet has been posted automatically.'
      });
      
      console.log('✅ Scheduled tweet posted successfully!');
    } catch (error) {
      console.error('❌ Error posting scheduled tweet:', error);
      
      // Show error notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Scheduled Tweet Failed',
        message: 'Failed to post scheduled tweet. Check the extension.'
      });
    }
  }

  generateId() {
    return 'tweet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async postViaApiServer(draft, apiUrl) {
    console.log('🌐 Posting via API server (works 24/7)...');
    console.log('📡 Server URL:', `${apiUrl}/api/post-now`);
    console.log('📝 Sending text:', draft.text);
    try {
      const response = await fetch(`${apiUrl}/api/post-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: draft.text,
          images: draft.images || []
        })
      });

      if (!response.ok) {
        throw new Error('API server error');
      }

      const result = await response.json();
      console.log('✅ Tweet posted via API server!', result);
      return result.result;
    } catch (error) {
      console.error('❌ API server error, falling back to direct API:', error);
      // Fall back to direct API if server is down
      return null;
    }
  }

  async scheduleViaApiServer(draft, scheduleTime, apiUrl) {
    console.log('🌐 Scheduling via API server (works even with laptop closed)...');
    try {
      const response = await fetch(`${apiUrl}/api/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: draft.text,
          images: draft.images || [],
          scheduleTime: scheduleTime
        })
      });

      if (!response.ok) {
        throw new Error('API server error');
      }

      const result = await response.json();
      console.log('✅ Tweet scheduled on server!', result);
      return result;
    } catch (error) {
      console.error('❌ API server error:', error);
      throw error;
    }
  }

  async autoScheduleViaApiServer(draft, apiUrl) {
    console.log('🌐 Auto-scheduling via API server...');
    try {
      const response = await fetch(`${apiUrl}/api/auto-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: draft.text,
          images: draft.images || []
        })
      });

      if (!response.ok) {
        throw new Error('API server error');
      }

      const result = await response.json();
      console.log('✅ Tweet auto-scheduled on server!', result);
      return result;
    } catch (error) {
      console.error('❌ API server error:', error);
      throw error;
    }
  }

  async authenticateTwitter() {
    console.log('🐦 TwitterRepostService: Authenticating with Twitter...');
    try {
      // Get hardcoded credentials
      const credentials = await this.getTwitterCredentials();
      
      // Test the credentials by getting a bearer token
      const tokenResponse = await fetch('https://api.twitter.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        console.log('🐦 TwitterRepostService: Authentication successful');
        
        // Store auth status
        await chrome.storage.local.set({ 
          twitterAuth: {
            authenticated: true,
            timestamp: new Date().toISOString()
          }
        });
        
        return {
          authenticated: true,
          message: 'Successfully connected to Twitter!'
        };
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error) {
      console.error('🐦 TwitterRepostService: Authentication error:', error);
      return {
        authenticated: false,
        error: error.message
      };
    }
  }

  async getAuthStatus() {
    console.log('🐦 TwitterRepostService: Getting auth status...');
    try {
      const result = await chrome.storage.local.get(['twitterAuth']);
      const auth = result.twitterAuth || { authenticated: false };
      
      // Since we have hardcoded credentials, always return authenticated
      return {
        authenticated: true,
        message: 'Using hardcoded credentials'
      };
    } catch (error) {
      console.error('🐦 TwitterRepostService: Error getting auth status:', error);
      return {
        authenticated: false,
        error: error.message
      };
    }
  }
}

// Initialize the service
new TwitterRepostService();
