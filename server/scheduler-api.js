// Node.js Server for Twitter Scheduling - Runs 24/7 on cloud
const express = require('express');
const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TweetParaphraser = require('./ai-paraphraser');

const app = express();
app.use(express.json());
app.use(cors());

// Your Twitter OAuth 1.0a credentials
const twitterClient = new TwitterApi({
  appKey: 'Gw1L36NdnowNm0OU2EqV1xqr9ByYE9VhYtgVJgnmFCBVkyiU6v',
  appSecret: 'd35lIhmBAmJTKcYKaYXw0VX3O8CHYOIeiNipDpsouFUya',
  accessToken: '1537440474696339456-WxABin2NgC6l3nrcNH3PEAKnpCV0NB',
  accessSecret: 'd35lIhmBAmJTKcYKaYXw0VX3O8CHYOIeiNipDpsouFUya'
});

// Initialize AI Paraphraser
// Note: Set OPENAI_API_KEY environment variable in your Railway/Render deployment
const paraphraser = new TweetParaphraser(process.env.OPENAI_API_KEY);

// Persistent storage paths
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';
const SCHEDULED_FILE = path.join(DATA_DIR, 'scheduled.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`📁 Created data directory: ${DATA_DIR}`);
}

// Load or initialize scheduled tweets from persistent storage
let scheduledTweets = new Map();
function loadScheduledTweets() {
  try {
    if (fs.existsSync(SCHEDULED_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHEDULED_FILE, 'utf-8'));
      scheduledTweets = new Map(data);
      console.log(`📥 Loaded ${scheduledTweets.size} scheduled tweets from storage`);
      
      // Restore cron jobs for scheduled tweets
      for (const [tweetId, tweet] of scheduledTweets) {
        if (tweet.status === 'scheduled') {
          const scheduleDate = new Date(tweet.scheduleTime);
          
          // Only restore if the tweet is still in the future
          if (scheduleDate > new Date()) {
            const cronPattern = `${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
            
            const job = cron.schedule(cronPattern, async () => {
              await postTweet(tweetId, tweet.text, tweet.images);
              job.destroy();
              scheduledTweets.delete(tweetId);
              saveScheduledTweets();
            }, {
              scheduled: true,
              timezone: "UTC"
            });
            
            tweet.job = job;
            console.log(`🔄 Restored cron job for tweet ${tweetId} scheduled at ${tweet.scheduleTime}`);
          } else {
            console.log(`⏰ Tweet ${tweetId} is overdue (scheduled for ${tweet.scheduleTime})`);
          }
        }
      }
    } else {
      fs.writeFileSync(SCHEDULED_FILE, JSON.stringify([]));
      console.log('📝 Created new scheduled tweets file');
    }
  } catch (error) {
    console.error('❌ Error loading scheduled tweets:', error);
    scheduledTweets = new Map();
  }
}

// Save scheduled tweets to persistent storage
function saveScheduledTweets() {
  try {
    // Don't save the job object (can't be serialized)
    const data = Array.from(scheduledTweets.entries()).map(([id, tweet]) => {
      const { job, ...tweetData } = tweet;
      return [id, tweetData];
    });
    fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Saved ${scheduledTweets.size} scheduled tweets to storage`);
  } catch (error) {
    console.error('❌ Error saving scheduled tweets:', error);
  }
}

// Load or initialize analytics from persistent storage
let tweetAnalytics = {
  posted: [],
  impressions: {},
  engagement: {}
};
function loadAnalytics() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      tweetAnalytics = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
      console.log(`📊 Loaded analytics data from storage`);
    } else {
      fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(tweetAnalytics, null, 2));
      console.log('📝 Created new analytics file');
    }
  } catch (error) {
    console.error('❌ Error loading analytics:', error);
  }
}

// Save analytics to persistent storage
function saveAnalytics() {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(tweetAnalytics, null, 2));
    console.log('💾 Saved analytics to storage');
  } catch (error) {
    console.error('❌ Error saving analytics:', error);
  }
}

// Initialize data on startup
loadScheduledTweets();
loadAnalytics();

// Check for overdue tweets on startup
setTimeout(async () => {
  console.log('🔍 Checking for overdue tweets on startup...');
  const now = new Date();
  const overdueTweets = [];
  
  for (const [tweetId, tweet] of scheduledTweets) {
    const scheduleTime = new Date(tweet.scheduleTime);
    if (scheduleTime <= now && tweet.status === 'scheduled') {
      console.log(`🚨 Found overdue tweet on startup: ${tweetId} (scheduled for ${tweet.scheduleTime})`);
      overdueTweets.push(tweet);
      
      try {
        await postTweet(tweetId, tweet.text, tweet.images);
        tweet.status = 'posted';
        scheduledTweets.delete(tweetId);
        saveScheduledTweets();
        console.log(`✅ Posted overdue tweet: ${tweetId}`);
      } catch (error) {
        console.error(`❌ Failed to post overdue tweet ${tweetId}:`, error);
      }
    }
  }
  
  if (overdueTweets.length > 0) {
    console.log(`📊 Processed ${overdueTweets.length} overdue tweets on startup`);
  } else {
    console.log('✅ No overdue tweets found on startup');
  }
}, 5000); // Wait 5 seconds for server to fully initialize

// API Endpoints

// Schedule a tweet
app.post('/api/schedule', async (req, res) => {
  try {
    const { text, scheduleTime, images } = req.body;
    const tweetId = `tweet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Parse schedule time
    const scheduleDate = new Date(scheduleTime);
    const cronPattern = `${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
    
    // Create cron job for this specific tweet
    const job = cron.schedule(cronPattern, async () => {
      await postTweet(tweetId, text, images);
      job.destroy(); // Remove job after posting
      scheduledTweets.delete(tweetId);
      saveScheduledTweets(); // Save after deletion
    }, {
      scheduled: true,
      timezone: "UTC" // Use UTC for consistency
    });
    
    // Store scheduled tweet
    scheduledTweets.set(tweetId, {
      id: tweetId,
      text,
      images,
      scheduleTime,
      job,
      status: 'scheduled'
    });
    saveScheduledTweets(); // Save after adding
    
    console.log(`✅ Tweet scheduled for ${scheduleTime}`);
    res.json({ 
      success: true, 
      tweetId, 
      message: `Tweet scheduled for ${scheduleDate.toLocaleString()}`
    });
    
  } catch (error) {
    console.error('❌ Schedule error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Post tweet immediately
app.post('/api/post-now', async (req, res) => {
  try {
    const { text, images } = req.body;
    const result = await postTweet(null, text, images);
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual trigger to post overdue tweets
app.post('/api/trigger-overdue', async (req, res) => {
  try {
    const now = new Date();
    const overdueTweets = [];
    
    for (const [tweetId, tweet] of scheduledTweets) {
      const scheduleTime = new Date(tweet.scheduleTime);
      if (scheduleTime <= now && tweet.status === 'scheduled') {
        console.log(`🚨 Found overdue tweet: ${tweetId} (scheduled for ${tweet.scheduleTime})`);
        overdueTweets.push(tweet);
        
        // Post the overdue tweet
        try {
          await postTweet(tweetId, tweet.text, tweet.images);
          tweet.status = 'posted';
          scheduledTweets.delete(tweetId);
          saveScheduledTweets(); // Save after deletion
          console.log(`✅ Posted overdue tweet: ${tweetId}`);
        } catch (error) {
          console.error(`❌ Failed to post overdue tweet ${tweetId}:`, error);
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Processed ${overdueTweets.length} overdue tweets`,
      overdueCount: overdueTweets.length
    });
  } catch (error) {
    console.error('❌ Trigger overdue error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-schedule with smart timing
app.post('/api/auto-schedule', async (req, res) => {
  try {
    const { text, images } = req.body;
    
    // Check daily limit before scheduling (temporarily disabled)
    // const limitCheck = await checkDailyLimit();
    // if (limitCheck.hitDailyLimit) {
    //   return res.status(429).json({
    //     success: false,
    //     error: `Daily tweet limit reached (${limitCheck.dailyLimit} tweets/day). Resets at ${new Date(limitCheck.resetTime * 1000).toLocaleString()}`,
    //     dailyLimit: limitCheck.dailyLimit,
    //     remaining: limitCheck.remaining,
    //     resetTime: limitCheck.resetTime
    //   });
    // }
    
    // Find optimal time based on analytics
    const optimalTime = findOptimalPostingTime();
    const tweetId = `tweet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Parse schedule time
    const scheduleDate = new Date(optimalTime);
    const cronPattern = `${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
    
    // Create cron job for this specific tweet
    const job = cron.schedule(cronPattern, async () => {
      await postTweet(tweetId, text, images);
      job.destroy();
      scheduledTweets.delete(tweetId);
      saveScheduledTweets(); // Save after deletion
    }, {
      scheduled: true,
      timezone: "UTC" // Use UTC for consistency
    });
    
    // Store scheduled tweet
    scheduledTweets.set(tweetId, {
      id: tweetId,
      text,
      images,
      scheduleTime: optimalTime,
      job,
      status: 'scheduled'
    });
    saveScheduledTweets(); // Save after adding
    
    console.log(`✅ Auto-scheduled tweet for ${optimalTime}`);
    res.json({ 
      success: true, 
      tweetId, 
      scheduleTime: optimalTime,
      message: `Tweet auto-scheduled for ${scheduleDate.toLocaleString()}`
    });
    
  } catch (error) {
    console.error('❌ Auto-schedule error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get scheduled tweets
app.get('/api/scheduled', (req, res) => {
  const tweets = Array.from(scheduledTweets.values()).map(t => ({
    id: t.id,
    text: t.text,
    images: t.images || [],  // Include images field
    scheduleTime: t.scheduleTime,
    status: t.status,
    hasMedia: (t.images && t.images.length > 0) // Add flag for easy checking
  }));
  
  // Add scheduling stats
  const stats = getSchedulingStats();
  
  res.json({ 
    success: true, 
    tweets,
    stats 
  });
});

// Get scheduling statistics
app.get('/api/scheduling-stats', (req, res) => {
  const stats = getSchedulingStats();
  res.json({ success: true, stats });
});

// Helper function to get scheduling statistics
function getSchedulingStats() {
  const scheduledTimes = getScheduledTimesMap();
  const now = new Date();
  
  // Count tweets per day for next 7 days
  const dailyDistribution = {};
  const hourlyDistribution = Array(24).fill(0);
  
  scheduledTweets.forEach(tweet => {
    const date = new Date(tweet.scheduleTime);
    const dayKey = date.toLocaleDateString();
    dailyDistribution[dayKey] = (dailyDistribution[dayKey] || 0) + 1;
    
    hourlyDistribution[date.getHours()]++;
  });
  
  // Find next available slots
  const nextSlots = [];
  const testDate = new Date(now);
  for (let i = 0; i < 24; i++) {
    testDate.setHours(testDate.getHours() + 1, 0, 0, 0);
    if (!hasConflictAt(testDate, scheduledTimes)) {
      nextSlots.push(new Date(testDate).toISOString());
      if (nextSlots.length >= 5) break; // Show next 5 available slots
    }
  }
  
  return {
    totalScheduled: scheduledTweets.size,
    maxPerDay: 24, // Maximum tweets per day
    dailyDistribution,
    hourlyDistribution,
    nextAvailableSlots: nextSlots,
    optimalHours: [7, 8, 9, 12, 13, 17, 18, 19, 20, 21]
  };
}

// Cancel scheduled tweet
app.delete('/api/scheduled/:id', (req, res) => {
  const { id } = req.params;
  const tweet = scheduledTweets.get(id);
  
  if (tweet) {
    tweet.job.destroy(); // Cancel cron job
    scheduledTweets.delete(id);
    saveScheduledTweets(); // Save after deletion
    res.json({ success: true, message: 'Tweet cancelled' });
  } else {
    res.status(404).json({ success: false, error: 'Tweet not found' });
  }
});

// Get analytics
app.get('/api/analytics', async (req, res) => {
  try {
    // Get real Twitter analytics
    const analytics = await fetchTwitterAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    res.json({ success: true, analytics: tweetAnalytics });
  }
});

// Preview AI paraphrase
app.post('/api/preview-paraphrase', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }
    
    console.log(`🔍 Previewing paraphrase for: ${text.substring(0, 50)}...`);
    const result = await paraphraser.previewParaphrase(text);
    
    res.json({
      success: true,
      original: result.original,
      paraphrased: result.paraphrased,
      characterDiff: result.characterDiff,
      aiSuccess: result.success
    });
    
  } catch (error) {
    console.error('❌ Preview paraphrase error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Helper Functions

// Helper function to post tweet via RapidAPI
async function postTweetViaRapidAPI(text, images = []) {
  try {
    console.log(`🚀 Posting via RapidAPI: ${text.substring(0, 50)}...`);
    
    // For now, we'll need to get authToken and ct0 from somewhere
    // These would typically be extracted from a logged-in Twitter session
    const authToken = process.env.TWITTER_AUTH_TOKEN || 'your_auth_token';
    const ct0 = process.env.TWITTER_CT0 || 'your_ct0';
    
    if (authToken === 'your_auth_token' || ct0 === 'your_ct0') {
      throw new Error('RapidAPI requires valid Twitter session tokens (authToken, ct0)');
    }
    
    const url = `https://twitter-aio.p.rapidapi.com/actions/createTweet?authToken=${authToken}&ct0=${ct0}`;
    const options = {
      method: 'POST',
      headers: {
        'x-rapidapi-key': '7ddc0e392amshbc5cec4e5d7de11p1cfae8jsn9c343729f6e1',
        'x-rapidapi-host': 'twitter-aio.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tweet: text
      })
    };
    
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`RapidAPI error: ${result.message || 'Unknown error'}`);
    }
    
    console.log(`✅ Tweet posted via RapidAPI! ID: ${result.id}`);
    return {
      data: {
        id: result.id,
        text: text
      }
    };
    
  } catch (error) {
    console.error('❌ RapidAPI posting failed:', error);
    throw error;
  }
}

async function postTweet(tweetId, text, images) {
  try {
    console.log(`🚀 Original tweet: ${text.substring(0, 50)}...`);
    
    // AI PARAPHRASING STEP
    console.log('🤖 Paraphrasing tweet with AI...');
    console.log(`📝 Original text: "${text}"`);
    const paraphrasedText = await paraphraser.paraphraseTweet(text);
    console.log(`✨ Paraphrased text: "${paraphrasedText}"`);
    console.log(`📊 Same as original? ${paraphrasedText === text}`);
    
    // Use paraphrased version for posting
    const finalText = paraphrasedText || text;
    console.log(`🚀 Final text to post: "${finalText}"`);
    
    let mediaIds = [];
    
    // Upload images/videos if any
    if (images && images.length > 0) {
      console.log(`📸 Uploading ${images.length} media files...`);
      
      for (const image of images) {
        try {
          let mediaId;
          
          // Handle different image formats
          if (image.base64) {
            // If we have base64 data, convert to buffer
            const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Determine MIME type
            const mimeType = image.base64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
            
            console.log(`📤 Uploading base64 image (${mimeType})...`);
            mediaId = await twitterClient.v1.uploadMedia(buffer, { mimeType });
            
          } else if (image.url) {
            // If it's a URL, try to fetch and upload
            console.log(`📤 Fetching and uploading image from URL: ${image.url.substring(0, 50)}...`);
            
            // For Twitter image URLs, we need to fetch them first
            if (image.url.includes('pbs.twimg.com') || image.url.includes('video.twimg.com')) {
              const fetch = (await import('node-fetch')).default;
              const response = await fetch(image.url);
              const buffer = await response.buffer();
              const contentType = response.headers.get('content-type') || 'image/jpeg';
              
              mediaId = await twitterClient.v1.uploadMedia(buffer, { mimeType: contentType });
            } else {
              // Direct URL upload
              mediaId = await twitterClient.v1.uploadMedia(image.url);
            }
          }
          
          if (mediaId) {
            mediaIds.push(mediaId);
            console.log(`✅ Media uploaded successfully: ${mediaId}`);
          }
          
        } catch (mediaError) {
          console.error(`⚠️ Failed to upload media:`, mediaError.message);
          // Continue with other images even if one fails
        }
      }
    }
    
    // Post the tweet with or without media
    let tweetData = { text: finalText };
    
    if (mediaIds.length > 0) {
      console.log(`🖼️ Attaching ${mediaIds.length} media files to tweet`);
      tweetData.media = { media_ids: mediaIds };
    }
    
    // Post with rate limit handling
    let result;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        result = await twitterClient.v2.tweet(tweetData);
        console.log(`✅ Tweet posted via Twitter API! ID: ${result.data.id}`);
        console.log(`🔗 View at: https://twitter.com/user/status/${result.data.id}`);
        break; // Success, exit retry loop
        
      } catch (error) {
        if (error.code === 429) {
          // Rate limit hit - wait and retry
          const waitTime = Math.pow(2, retryCount) * 60 * 1000; // Exponential backoff: 1min, 2min, 4min
          console.log(`⏳ Rate limit hit (429). Waiting ${waitTime/1000/60} minutes before retry ${retryCount + 1}/${maxRetries}...`);
          
          if (retryCount < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
          } else {
            // Twitter API failed after retries, try RapidAPI as fallback
            console.log(`🔄 Twitter API failed after ${maxRetries} retries. Trying RapidAPI fallback...`);
            try {
              result = await postTweetViaRapidAPI(finalText, images);
              console.log(`✅ Tweet posted via RapidAPI fallback! ID: ${result.data.id}`);
              break;
            } catch (rapidApiError) {
              throw new Error(`Both Twitter API and RapidAPI failed. Twitter: ${error.message}, RapidAPI: ${rapidApiError.message}`);
            }
          }
        } else {
          throw error; // Re-throw non-rate-limit errors
        }
      }
    }
    
    // Track in analytics
    tweetAnalytics.posted.push({
      id: result.data.id,
      text,
      postedAt: new Date().toISOString(),
      tweetId: tweetId,
      hasMedia: mediaIds.length > 0
    });
    saveAnalytics(); // Save analytics after updating
    
    // Fetch initial metrics after 5 minutes
    setTimeout(() => fetchTweetMetrics(result.data.id), 5 * 60 * 1000);
    
    return result.data;
    
  } catch (error) {
    console.error('❌ Error posting tweet:', error);
    throw error;
  }
}

// Helper function to check daily tweet limit
async function checkDailyLimit() {
  try {
    // Check rate limit status without making a post request
    const rateLimits = await twitterClient.v1.get('application/rate_limit_status.json', {
      resources: 'statuses'
    });
    
    // Get the statuses/update endpoint rate limit info
    const updateLimit = rateLimits.resources?.statuses?.['/statuses/update'];
    
    if (updateLimit) {
      return {
        hitDailyLimit: updateLimit.remaining === 0,
        dailyLimit: updateLimit.limit,
        remaining: updateLimit.remaining,
        resetTime: updateLimit.reset
      };
    }
    
    // Fallback: check if we've hit daily limit by trying a test post
    try {
      const testResult = await twitterClient.v2.tweet({ text: 'test' });
      return {
        hitDailyLimit: false,
        dailyLimit: 17,
        remaining: 17,
        resetTime: null
      };
    } catch (error) {
      if (error.code === 429 && error.rateLimit) {
        const dailyLimit = error.rateLimit.day?.limit || error.rateLimit.userDay?.limit || 17;
        const remaining = error.rateLimit.day?.remaining || error.rateLimit.userDay?.remaining || 0;
        const resetTime = error.rateLimit.day?.reset || error.rateLimit.userDay?.reset;
        
        return {
          hitDailyLimit: remaining === 0,
          dailyLimit: dailyLimit,
          remaining: remaining,
          resetTime: resetTime
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('Error checking daily limit:', error);
    return {
      hitDailyLimit: false,
      dailyLimit: 17,
      remaining: 17,
      resetTime: null
    };
  }
}

function findOptimalPostingTime() {
  const now = new Date();
  
  // Define optimal posting hours based on typical engagement patterns
  // Morning: 7-9 AM, Lunch: 12-1 PM, Evening: 5-7 PM, Night: 8-10 PM
  const optimalHours = [7, 8, 9, 12, 13, 17, 18, 19, 20, 21];
  
  // Get all scheduled times for the next 7 days
  const scheduledTimes = getScheduledTimesMap();
  
  // Find the next available slot
  let targetDate = new Date(now);
  let foundSlot = false;
  let attempts = 0;
  const maxAttempts = 168; // 7 days * 24 hours
  
  while (!foundSlot && attempts < maxAttempts) {
    // First try optimal hours for current day
    if (attempts === 0) {
      const currentHour = targetDate.getHours();
      for (const hour of optimalHours) {
        if (hour > currentHour) {
          targetDate.setHours(hour, 0, 0, 0);
          if (!hasConflictAt(targetDate, scheduledTimes)) {
            foundSlot = true;
            break;
          }
        }
      }
    }
    
    if (!foundSlot) {
      // Try next day's optimal hours
      targetDate.setDate(targetDate.getDate() + 1);
      for (const hour of optimalHours) {
        targetDate.setHours(hour, 0, 0, 0);
        if (!hasConflictAt(targetDate, scheduledTimes)) {
          foundSlot = true;
          break;
        }
      }
    }
    
    // If no optimal slot found, try any hour
    if (!foundSlot) {
      for (let hour = 0; hour < 24; hour++) {
        targetDate.setHours(hour, 0, 0, 0);
        if (!hasConflictAt(targetDate, scheduledTimes)) {
          foundSlot = true;
          break;
        }
      }
    }
    
    attempts++;
  }
  
  // Log scheduling info
  const scheduledCount = scheduledTimes.size;
  console.log(`📅 Auto-scheduling: Found slot at ${targetDate.toLocaleString()}`);
  console.log(`📊 Currently ${scheduledCount} tweets scheduled`);
  
  return targetDate.toISOString();
}

// Helper function to get a map of scheduled times
function getScheduledTimesMap() {
  const timeMap = new Map();
  
  scheduledTweets.forEach(tweet => {
    const date = new Date(tweet.scheduleTime);
    // Create a key for each hour slot (YYYY-MM-DD-HH)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    timeMap.set(key, (timeMap.get(key) || 0) + 1);
  });
  
  return timeMap;
}

// Check if there's a conflict at the given time
function hasConflictAt(date, scheduledTimes) {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
  
  // Allow max 1 tweet per hour
  const tweetsInSlot = scheduledTimes.get(key) || 0;
  
  // Also check for minimum spacing (at least 30 minutes between tweets)
  let tooClose = false;
  scheduledTweets.forEach(tweet => {
    const tweetTime = new Date(tweet.scheduleTime).getTime();
    const timeDiff = Math.abs(date.getTime() - tweetTime);
    if (timeDiff < 30 * 60 * 1000) { // 30 minutes
      tooClose = true;
    }
  });
  
  return tweetsInSlot >= 1 || tooClose;
}

async function fetchTweetMetrics(tweetId) {
  try {
    // Note: Twitter API v2 metrics require Academic Research access
    // For now, we'll skip metrics fetching
    console.log(`📊 Metrics tracking for tweet ${tweetId} (requires Academic access)`);
    
    // Placeholder metrics
    tweetAnalytics.impressions[tweetId] = 0;
    tweetAnalytics.engagement[tweetId] = {
      likes: 0,
      retweets: 0,
      replies: 0
    };
  } catch (error) {
    console.error('Error fetching metrics:', error);
  }
}

async function fetchTwitterAnalytics() {
  // Aggregate all analytics data
  const hourlyDistribution = Array(24).fill(0);
  const weekdayDistribution = Array(7).fill(0);
  
  tweetAnalytics.posted.forEach(tweet => {
    const date = new Date(tweet.postedAt);
    hourlyDistribution[date.getHours()]++;
    weekdayDistribution[date.getDay()]++;
  });
  
  return {
    totalPosts: tweetAnalytics.posted.length,
    hourlyDistribution,
    weekdayDistribution,
    impressions: tweetAnalytics.impressions,
    engagement: tweetAnalytics.engagement,
    topTweets: getTopPerformingTweets()
  };
}

function getTopPerformingTweets() {
  return tweetAnalytics.posted
    .map(tweet => ({
      ...tweet,
      impressions: tweetAnalytics.impressions[tweet.id] || 0,
      engagement: tweetAnalytics.engagement[tweet.id] || {}
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Twitter Scheduler API running on port ${PORT}`);
  console.log('✅ Ready to schedule tweets 24/7 - even with laptop closed!');
});

// Keep-alive endpoint to prevent Railway app sleeping
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    scheduledTweets: scheduledTweets.size,
    uptime: process.uptime()
  });
});

// Test RapidAPI post endpoint
app.post('/api/test-rapidapi', async (req, res) => {
  try {
    const { text } = req.body;
    console.log('🧪 Testing RapidAPI post:', text);
    
    const result = await postTweetViaRapidAPI(text);
    
    res.json({
      success: true,
      result: result,
      id: result.data?.id,
      text: result.data?.text,
      method: 'RapidAPI'
    });
  } catch (error) {
    console.error('❌ RapidAPI test error:', error);
    res.status(error.code || 500).json({
      success: false,
      error: error.message,
      method: 'RapidAPI'
    });
  }
});

// Test post endpoint without retry (for debugging)
app.post('/api/test-post', async (req, res) => {
  try {
    const { text } = req.body;
    console.log('🧪 Test posting tweet:', text);
    
    // Direct post without retries to see actual error
    const result = await twitterClient.v2.tweet({ text });
    
    res.json({
      success: true,
      result: result,
      id: result.data?.id,
      text: result.data?.text
    });
  } catch (error) {
    console.error('❌ Test post error:', error);
    res.status(error.code || 500).json({
      success: false,
      error: error.message,
      code: error.code,
      data: error.data,
      rateLimit: error.rateLimit,
      errors: error.errors
    });
  }
});

// Diagnostic endpoint to check Twitter API status
app.get('/api/twitter-status', async (req, res) => {
  try {
    console.log('🔍 Checking Twitter API status...');
    
    // Try to get rate limit status
    const rateLimits = await twitterClient.v1.get('application/rate_limit_status.json', {
      resources: 'statuses'
    }).catch(err => ({ error: err.message, code: err.code }));
    
    // Try to verify credentials
    const credentials = await twitterClient.v1.verifyCredentials().catch(err => ({ 
      error: err.message, 
      code: err.code 
    }));
    
    res.json({
      success: true,
      rateLimits: rateLimits,
      credentials: credentials?.screen_name ? {
        screen_name: credentials.screen_name,
        id: credentials.id_str,
        verified: true
      } : credentials,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error checking Twitter status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code,
      data: error.data
    });
  }
});

// Keep-alive ping every 5 minutes to prevent Railway sleeping
// TODO: Update this URL after deploying to your new Railway instance
const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN || 'YOUR_NEW_RAILWAY_URL_HERE';
cron.schedule('*/5 * * * *', async () => {
  console.log('💓 Keep-alive ping to prevent Railway sleeping...');
  try {
    const healthUrl = RAILWAY_URL.startsWith('http') ? `${RAILWAY_URL}/api/health` : `https://${RAILWAY_URL}/api/health`;
    const response = await fetch(healthUrl);
    console.log('✅ Keep-alive successful');
  } catch (error) {
    console.log('⚠️ Keep-alive failed:', error.message);
  }
});

// Periodic analytics update (every hour)
cron.schedule('0 * * * *', async () => {
  console.log('📊 Updating analytics...');
  for (const tweet of tweetAnalytics.posted) {
    if (tweet.id) {
      await fetchTweetMetrics(tweet.id);
    }
  }
});
