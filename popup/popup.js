// Popup script for Twitter Repost Assistant
class TwitterRepostPopup {
  constructor() {
    console.log('🐦 TwitterRepostPopup: Initializing popup...');
    this.currentTab = 'drafts';
    this.selectedDraft = null;
    this.drafts = [];
    this.scheduled = [];
    this.posted = [];
    this.analytics = null;
    
    this.init();
  }

  async init() {
    console.log('🐦 TwitterRepostPopup: Setting up event listeners...');
    this.setupEventListeners();
    console.log('🐦 TwitterRepostPopup: Loading data...');
    await this.loadData();
    console.log('🐦 TwitterRepostPopup: Rendering popup...');
    this.render();
    
    // Initialize analytics
    this.initAnalytics();
    
    console.log('🐦 TwitterRepostPopup: Popup initialization complete');
  }
  
  async initAnalytics() {
    // Load analytics script dynamically
    const script = document.createElement('script');
    script.src = 'analytics.js';
    document.head.appendChild(script);
    
    script.onload = () => {
      this.analytics = new TweetAnalytics();
    };
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Header buttons
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadData();
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Modal controls
    document.getElementById('closeModal').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('closeScheduleModal').addEventListener('click', () => {
      this.closeScheduleModal();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveDraft();
    });

    document.getElementById('postNowBtn').addEventListener('click', () => {
      this.postNow();
    });

    document.getElementById('scheduleBtn').addEventListener('click', () => {
      this.openScheduleModal();
    });

    document.getElementById('cancelScheduleBtn').addEventListener('click', () => {
      this.closeScheduleModal();
    });

    document.getElementById('confirmScheduleBtn').addEventListener('click', () => {
      this.scheduleTweet();
    });

    // Character count
    document.getElementById('tweetText').addEventListener('input', (e) => {
      this.updateCharCount(e.target.value.length);
    });

    // Close modals on outside click
    document.getElementById('tweetModal').addEventListener('click', (e) => {
      if (e.target.id === 'tweetModal') {
        this.closeModal();
      }
    });

    document.getElementById('scheduleModal').addEventListener('click', (e) => {
      if (e.target.id === 'scheduleModal') {
        this.closeScheduleModal();
      }
    });
  }

  async loadData() {
    console.log('🐦 TwitterRepostPopup: Loading data from background script...');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDrafts' });
      console.log('🐦 TwitterRepostPopup: Received response from background:', response);
      if (response && response.success) {
        this.drafts = response.drafts.filter(d => d.status === 'draft');
        this.scheduled = response.drafts.filter(d => d.status === 'scheduled');
        this.posted = response.drafts.filter(d => d.status === 'posted');
        console.log('🐦 TwitterRepostPopup: Loaded data - drafts:', this.drafts.length, 'scheduled:', this.scheduled.length, 'posted:', this.posted.length);
        this.render();
      } else {
        console.error('🐦 TwitterRepostPopup: Failed to load data:', response);
        this.showError('Failed to load drafts');
      }
    } catch (error) {
      console.error('🐦 TwitterRepostPopup: Error loading data:', error);
      this.showError('Failed to load drafts');
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');

    this.currentTab = tabName;
    this.render();
  }

  render() {
    this.renderDrafts();
    this.renderScheduled();
    this.renderPosted();
    this.renderAnalytics();
    this.updateEmptyState();
  }
  
  renderAnalytics() {
    if (this.currentTab === 'analytics' && this.analytics) {
      setTimeout(() => {
        this.analytics.renderHeatMap('analyticsContainer');
      }, 100);
    }
  }

  renderDrafts() {
    const container = document.getElementById('draftsList');
    
    if (this.drafts.length === 0) {
      container.innerHTML = '<div class="loading">No drafts yet</div>';
      return;
    }

    container.innerHTML = this.drafts.map(draft => this.createDraftCard(draft)).join('');
    
    // Add click handlers to draft cards
    container.querySelectorAll('.draft-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.draft-actions')) {
          this.openDraft(draft);
        }
      });
    });

    // Add action button handlers
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const draftId = btn.dataset.draftId;
        this.openDraft(this.drafts.find(d => d.id === draftId));
      });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const draftId = btn.dataset.draftId;
        this.deleteDraft(draftId);
      });
    });

    // Add AI preview button handlers
    container.querySelectorAll('.preview-ai-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const draftId = btn.dataset.draftId;
        this.previewAIParaphrase(draftId);
      });
    });

    container.querySelectorAll('.post-now-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const draftId = btn.dataset.draftId;
        this.postDraftNow(draftId);
      });
    });

    container.querySelectorAll('.auto-schedule-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const draftId = btn.dataset.draftId;
        this.autoScheduleDraft(draftId);
      });
    });
  }

  renderScheduled() {
    const container = document.getElementById('scheduledList');
    
    if (this.scheduled.length === 0) {
      container.innerHTML = '<div class="loading">No scheduled tweets</div>';
      return;
    }

    container.innerHTML = this.scheduled.map(draft => this.createScheduledCard(draft)).join('');
  }

  renderPosted() {
    const container = document.getElementById('postedList');
    
    if (this.posted.length === 0) {
      container.innerHTML = '<div class="loading">No posted tweets</div>';
      return;
    }

    container.innerHTML = this.posted.map(draft => this.createPostedCard(draft)).join('');
  }

  createDraftCard(draft) {
    const date = new Date(draft.createdAt || draft.savedAt).toLocaleDateString();
    const images = draft.images || [];
    
    // Create enhanced media preview
    let mediaPreviewHtml = '';
    if (images.length > 0) {
      const displayImages = images.slice(0, 4); // Show max 4 images
      mediaPreviewHtml = `
        <div class="draft-media-preview">
          ${displayImages.map(img => {
            if (img.type === 'video_thumbnail') {
              return `
                <div class="media-thumb video-thumb">
                  <img src="${img.url}" alt="${img.alt || 'Video'}" class="draft-image">
                  <span class="media-type-badge">📹</span>
                </div>
              `;
            } else if (img.type === 'gif') {
              return `
                <div class="media-thumb gif-thumb">
                  <img src="${img.url}" alt="GIF" class="draft-image">
                  <span class="media-type-badge">GIF</span>
                </div>
              `;
            } else {
              return `
                <div class="media-thumb">
                  <img src="${img.url}" alt="${img.alt || 'Image'}" class="draft-image">
                </div>
              `;
            }
          }).join('')}
          ${images.length > 4 ? `<div class="media-more">+${images.length - 4} more</div>` : ''}
        </div>
      `;
    }
    
    return `
      <div class="draft-card" data-draft-id="${draft.id}">
        <div class="draft-text">${this.escapeHtml(draft.text)}</div>
        ${mediaPreviewHtml}
        <div class="draft-meta">
          <span class="draft-author">${this.escapeHtml(draft.author || 'Unknown')}</span>
          <span class="draft-date">${date}</span>
          ${images.length > 0 ? `<span class="media-count">📸 ${images.length}</span>` : ''}
        </div>
        <div class="draft-actions">
          <button class="btn info small preview-ai-btn" data-draft-id="${draft.id}">🤖 Preview AI</button>
          <button class="btn success small post-now-btn" data-draft-id="${draft.id}">Post Now</button>
          <button class="btn warning small auto-schedule-btn" data-draft-id="${draft.id}">Auto Schedule</button>
          <button class="btn primary small edit-btn" data-draft-id="${draft.id}">Edit</button>
          <button class="btn danger small delete-btn" data-draft-id="${draft.id}">Delete</button>
        </div>
      </div>
    `;
  }

  createScheduledCard(draft) {
    const scheduleDate = new Date(draft.scheduledFor).toLocaleString();
    
    return `
      <div class="draft-card">
        <div class="draft-text">${this.escapeHtml(draft.text)}</div>
        <div class="draft-meta">
          <span class="draft-author">${this.escapeHtml(draft.author || 'Unknown')}</span>
          <span class="draft-date">Scheduled for: ${scheduleDate}</span>
        </div>
        <div class="draft-actions">
          <button class="btn success small" onclick="this.postNow('${draft.id}')">Post Now</button>
          <button class="btn danger small" onclick="this.cancelSchedule('${draft.id}')">Cancel</button>
        </div>
      </div>
    `;
  }

  createPostedCard(draft) {
    const postedDate = new Date(draft.postedAt).toLocaleString();
    
    return `
      <div class="draft-card">
        <div class="draft-text">${this.escapeHtml(draft.text)}</div>
        <div class="draft-meta">
          <span class="draft-author">${this.escapeHtml(draft.author || 'Unknown')}</span>
          <span class="draft-date">Posted: ${postedDate}</span>
        </div>
        <div class="draft-actions">
          <span class="btn secondary small">Posted ✓</span>
        </div>
      </div>
    `;
  }

  openDraft(draft) {
    this.selectedDraft = draft;
    document.getElementById('tweetText').value = draft.text;
    this.updateCharCount(draft.text.length);
    this.showModal();
  }

  showModal() {
    document.getElementById('tweetModal').classList.add('show');
  }

  closeModal() {
    document.getElementById('tweetModal').classList.remove('show');
    this.selectedDraft = null;
  }

  openScheduleModal() {
    document.getElementById('scheduleModal').classList.add('show');
  }

  closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('show');
  }

  async saveDraft() {
    if (!this.selectedDraft) return;

    const newText = document.getElementById('tweetText').value;
    
    try {
      await chrome.runtime.sendMessage({
        action: 'updateDraft',
        id: this.selectedDraft.id,
        data: { text: newText }
      });

      this.closeModal();
      await this.loadData();
      this.showSuccess('Draft updated!');
    } catch (error) {
      console.error('Error saving draft:', error);
      this.showError('Failed to save draft');
    }
  }

  async postNow() {
    if (!this.selectedDraft) return;

    try {
      await chrome.runtime.sendMessage({
        action: 'postNow',
        id: this.selectedDraft.id
      });

      this.closeModal();
      await this.loadData();
      this.showSuccess('Tweet posted!');
    } catch (error) {
      console.error('Error posting tweet:', error);
      this.showError('Failed to post tweet');
    }
  }

  async scheduleTweet() {
    if (!this.selectedDraft) return;

    const scheduleType = document.querySelector('input[name="scheduleType"]:checked').value;
    let scheduleTime;

    if (scheduleType === 'datetime') {
      scheduleTime = document.getElementById('scheduleDateTime').value;
    } else {
      // Handle smart scheduling
      const smartOption = document.getElementById('smartSchedule').value;
      scheduleTime = this.calculateSmartSchedule(smartOption);
    }

    if (!scheduleTime) {
      this.showError('Please select a schedule time');
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        action: 'scheduleTweet',
        id: this.selectedDraft.id,
        scheduleTime: scheduleTime
      });

      this.closeScheduleModal();
      this.closeModal();
      await this.loadData();
      this.showSuccess('Tweet scheduled!');
    } catch (error) {
      console.error('Error scheduling tweet:', error);
      this.showError('Failed to schedule tweet');
    }
  }

  calculateSmartSchedule(option) {
    const now = new Date();
    
    switch (option) {
      case '1hour':
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      case '4hours':
        return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
      case 'tomorrow':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.toISOString();
      case 'weekend':
        const weekend = new Date(now);
        const daysUntilSaturday = (6 - now.getDay()) % 7;
        weekend.setDate(weekend.getDate() + daysUntilSaturday);
        weekend.setHours(10, 0, 0, 0);
        return weekend.toISOString();
      default:
        return null;
    }
  }

  async deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft?')) return;

    try {
      await chrome.runtime.sendMessage({
        action: 'deleteDraft',
        id: draftId
      });

      await this.loadData();
      this.showSuccess('Draft deleted!');
    } catch (error) {
      console.error('Error deleting draft:', error);
      this.showError('Failed to delete draft');
    }
  }

  async autoScheduleDraft(draftId) {
    console.log('🐦 TwitterRepostPopup: Auto-scheduling draft:', draftId);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'autoSchedule',
        id: draftId
      });

      if (response && response.success) {
        await this.loadData();
        this.showSuccess(response.message || 'Tweet auto-scheduled!');
      } else {
        throw new Error(response?.error || 'Failed to auto-schedule');
      }
    } catch (error) {
      console.error('🐦 TwitterRepostPopup: Error auto-scheduling draft:', error);
      this.showError('Failed to auto-schedule: ' + error.message);
    }
  }

  async postDraftNow(draftId) {
    console.log('🐦 TwitterRepostPopup: Posting draft now:', draftId);
    try {
      // Show AI paraphrasing status
      this.showInfo('🤖 AI is rewriting your tweet...');
      
      const response = await chrome.runtime.sendMessage({
        action: 'postNow',
        id: draftId
      });

      if (response && response.success) {
        await this.loadData();
        
        // Show AI paraphrase result if available
        if (response.aiParaphrased) {
          this.showSuccess(`✨ Tweet posted with AI rewrite!\n📝 Original: "${response.originalText?.substring(0, 50)}..."\n✏️ Posted as: "${response.postedText?.substring(0, 50)}..."`);
        } else {
          this.showSuccess('✅ Tweet posted successfully!');
        }
      } else {
        throw new Error(response?.error || 'Failed to post tweet');
      }
    } catch (error) {
      console.error('🐦 TwitterRepostPopup: Error posting draft:', error);
      this.showError('Failed to post tweet: ' + error.message);
    }
  }

  async previewAIParaphrase(draftId) {
    try {
      const draft = this.drafts.find(d => d.id === draftId);
      if (!draft) {
        throw new Error('Draft not found');
      }

      // Show loading state
      console.log('🤖 Generating AI paraphrase...');

      // Call the server's preview endpoint
      const apiUrl = 'https://twitter-scheduler-server-production-8314.up.railway.app';
      const response = await fetch(`${apiUrl}/api/preview-paraphrase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: draft.text
        })
      });

      if (!response.ok) {
        throw new Error('Server error');
      }

      const result = await response.json();
      
      if (result.success) {
        // Show the paraphrase in a modal or notification
        this.showParaphraseModal(result.original, result.paraphrased, result.characterDiff);
      } else {
        throw new Error(result.error || 'Failed to generate paraphrase');
      }
    } catch (error) {
      console.error('Error previewing AI paraphrase:', error);
      alert('Error generating AI paraphrase: ' + error.message);
    }
  }

  showParaphraseModal(original, paraphrased, characterDiff) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'paraphrase-modal-overlay';
    modal.innerHTML = `
      <div class="paraphrase-modal">
        <div class="paraphrase-header">
          <h3>🤖 AI Paraphrase Preview</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="paraphrase-content">
          <div class="text-comparison">
            <div class="original-text">
              <h4>📝 Original:</h4>
              <p>${this.escapeHtml(original)}</p>
              <small>${original.length} characters</small>
            </div>
            <div class="paraphrased-text">
              <h4>✨ AI Paraphrase:</h4>
              <p>${this.escapeHtml(paraphrased)}</p>
              <small>${paraphrased.length} characters ${characterDiff > 0 ? `(+${characterDiff})` : characterDiff < 0 ? `(${characterDiff})` : '(same length)'}</small>
            </div>
          </div>
        </div>
        <div class="paraphrase-footer">
          <button class="btn secondary" id="closeModal">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector('.close-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.querySelector('#closeModal').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  updateCharCount(count) {
    const charCount = document.getElementById('charCount');
    charCount.textContent = count;
    
    charCount.className = 'char-count';
    if (count > 260) {
      charCount.classList.add('warning');
    }
    if (count > 280) {
      charCount.classList.add('error');
    }
  }

  updateEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const hasContent = this.drafts.length > 0 || this.scheduled.length > 0 || this.posted.length > 0;
    
    emptyState.style.display = hasContent ? 'none' : 'block';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showNotification(message, type = 'info') {
    // Create a notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      left: 20px;
      padding: 12px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 13px;
      animation: slideIn 0.3s ease;
      white-space: pre-line;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;
    
    // Set colors based on type
    const colors = {
      info: { bg: '#3b82f6', text: 'white' },
      success: { bg: '#10b981', text: 'white' },
      error: { bg: '#ef4444', text: 'white' },
      warning: { bg: '#f59e0b', text: 'white' }
    };
    
    const color = colors[type] || colors.info;
    notification.style.backgroundColor = color.bg;
    notification.style.color = color.text;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }
  
  showInfo(message) {
    console.log('ℹ️ Info:', message);
    this.showNotification(message, 'info');
  }
  
  showSuccess(message) {
    console.log('✅ Success:', message);
    this.showNotification(message, 'success');
  }
  
  showError(message) {
    console.error('❌ Error:', message);
    this.showNotification(message, 'error');
  }
  
  showWarning(message) {
    console.warn('⚠️ Warning:', message);
    this.showNotification(message, 'warning');
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TwitterRepostPopup();
  
  // Add calendar button handler
  const calendarBtn = document.getElementById('openCalendar');
  if (calendarBtn) {
    calendarBtn.addEventListener('click', () => {
      // Open calendar in a new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('calendar/calendar.html')
      });
    });
  }
});
