const API_URL = 'https://twitter-scheduler-server-production-8314.up.railway.app';
let currentDate = new Date();
let scheduledTweets = [];
let currentView = 'calendar';

async function loadScheduledTweets() {
    try {
        console.log('📅 Loading scheduled tweets from:', `${API_URL}/api/scheduled`);
        const response = await fetch(`${API_URL}/api/scheduled`);
        const data = await response.json();
        console.log('📊 API Response:', data);
        
        if (data.success) {
            scheduledTweets = data.tweets || [];
            console.log(`✅ Loaded ${scheduledTweets.length} scheduled tweets`);
            updateStats(data.stats);
            renderCalendar();
            renderTimeline();
        } else {
            showError('Failed to load scheduled tweets');
        }
    } catch (error) {
        console.error('Error loading tweets:', error);
        showError('Error connecting to server');
    }
}

function updateStats(stats) {
    if (!stats) return;
    
    document.getElementById('totalScheduled').textContent = stats.totalScheduled || 0;
    
    // Calculate today's tweets
    const today = new Date().toDateString();
    const todayTweets = scheduledTweets.filter(tweet => 
        new Date(tweet.scheduleTime).toDateString() === today
    );
    document.getElementById('todayCount').textContent = todayTweets.length;
    
    // Calculate this week's tweets
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    const weekTweets = scheduledTweets.filter(tweet => {
        const tweetDate = new Date(tweet.scheduleTime);
        return tweetDate >= weekStart && tweetDate < weekEnd;
    });
    document.getElementById('weekCount').textContent = weekTweets.length;
    
    // Find next tweet
    const now = new Date();
    const nextTweets = scheduledTweets
        .filter(tweet => new Date(tweet.scheduleTime) > now)
        .sort((a, b) => new Date(a.scheduleTime) - new Date(b.scheduleTime));
    
    if (nextTweets.length > 0) {
        const nextTime = new Date(nextTweets[0].scheduleTime);
        document.getElementById('nextTweet').textContent = 
            nextTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
        document.getElementById('nextTweet').textContent = 'None';
    }
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
    
    // Create calendar grid
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = day;
        grid.appendChild(header);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Add previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = createDayElement(
            new Date(year, month - 1, daysInPrevMonth - i),
            true
        );
        grid.appendChild(day);
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = createDayElement(
            new Date(year, month, day),
            false
        );
        grid.appendChild(dayElement);
    }
    
    // Add next month's leading days
    const totalCells = grid.children.length - 7; // Subtract headers
    const remainingCells = 35 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayElement = createDayElement(
            new Date(year, month + 1, day),
            true
        );
        grid.appendChild(dayElement);
    }
}

function createDayElement(date, isOtherMonth) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    
    if (isOtherMonth) {
        dayDiv.classList.add('other-month');
    }
    
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        dayDiv.classList.add('today');
    }
    
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = date.getDate();
    dayDiv.appendChild(dayNumber);
    
    // Get tweets for this day
    const dayTweets = scheduledTweets.filter(tweet => {
        const tweetDate = new Date(tweet.scheduleTime);
        return tweetDate.toDateString() === date.toDateString();
    });
    
    // Add tweet count badge
    if (dayTweets.length > 0) {
        const countBadge = document.createElement('div');
        countBadge.className = 'tweet-count';
        countBadge.textContent = dayTweets.length;
        dayDiv.appendChild(countBadge);
    }
    
    // Add first 2 tweets as preview
    dayTweets.slice(0, 2).forEach(tweet => {
        const tweetSlot = document.createElement('div');
        tweetSlot.className = 'tweet-slot';
        
        const tweetTime = document.createElement('div');
        tweetTime.className = 'tweet-time';
        const time = new Date(tweet.scheduleTime);
        tweetTime.textContent = time.toLocaleTimeString('en-US', 
            { hour: '2-digit', minute: '2-digit' });
        
        const tweetPreview = document.createElement('div');
        tweetPreview.className = 'tweet-preview';
        tweetPreview.textContent = tweet.text.substring(0, 30) + '...';
        
        tweetSlot.appendChild(tweetTime);
        tweetSlot.appendChild(tweetPreview);
        dayDiv.appendChild(tweetSlot);
    });
    
    // Add click handler to show all tweets for the day
    if (dayTweets.length > 0) {
        dayDiv.style.cursor = 'pointer';
        dayDiv.onclick = () => showDayTweets(date, dayTweets);
    }
    
    return dayDiv;
}

function showDayTweets(date, tweets) {
    const modal = document.getElementById('tweetModal');
    const modalDate = document.getElementById('modalDate');
    const modalTweets = document.getElementById('modalTweets');
    
    modalDate.textContent = date.toLocaleDateString('en-US', 
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    modalTweets.innerHTML = '';
    
    tweets.sort((a, b) => new Date(a.scheduleTime) - new Date(b.scheduleTime));
    
    tweets.forEach(tweet => {
        const tweetDetail = document.createElement('div');
        tweetDetail.className = 'tweet-detail';
        
        const tweetTime = document.createElement('div');
        tweetTime.className = 'tweet-detail-time';
        const time = new Date(tweet.scheduleTime);
        tweetTime.textContent = time.toLocaleTimeString('en-US', 
            { hour: '2-digit', minute: '2-digit' });
        
        const tweetText = document.createElement('div');
        tweetText.className = 'tweet-detail-text';
        tweetText.textContent = tweet.text;
        
        tweetDetail.appendChild(tweetTime);
        tweetDetail.appendChild(tweetText);
        modalTweets.appendChild(tweetDetail);
    });
    
    modal.classList.add('active');
}

function renderTimeline() {
    const timelineContent = document.getElementById('timelineContent');
    timelineContent.innerHTML = '';
    
    // Group tweets by day
    const tweetsByDay = {};
    scheduledTweets.forEach(tweet => {
        const date = new Date(tweet.scheduleTime).toDateString();
        if (!tweetsByDay[date]) {
            tweetsByDay[date] = [];
        }
        tweetsByDay[date].push(tweet);
    });
    
    // Sort days
    const sortedDays = Object.keys(tweetsByDay).sort((a, b) => 
        new Date(a) - new Date(b)
    );
    
    sortedDays.forEach(dateString => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'timeline-day';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'timeline-date';
        const date = new Date(dateString);
        dateHeader.textContent = date.toLocaleDateString('en-US', 
            { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        dayDiv.appendChild(dateHeader);
        
        // Sort tweets by time
        tweetsByDay[dateString].sort((a, b) => 
            new Date(a.scheduleTime) - new Date(b.scheduleTime)
        );
        
        tweetsByDay[dateString].forEach(tweet => {
            const tweetDiv = document.createElement('div');
            tweetDiv.className = 'timeline-tweet';
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'timeline-time';
            const time = new Date(tweet.scheduleTime);
            timeDiv.textContent = time.toLocaleTimeString('en-US', 
                { hour: '2-digit', minute: '2-digit' });
            
            const textDiv = document.createElement('div');
            textDiv.className = 'timeline-text';
            textDiv.textContent = tweet.text;
            
            tweetDiv.appendChild(timeDiv);
            tweetDiv.appendChild(textDiv);
            dayDiv.appendChild(tweetDiv);
        });
        
        timelineContent.appendChild(dayDiv);
    });
    
    if (sortedDays.length === 0) {
        timelineContent.innerHTML = '<div class="loading">No scheduled tweets</div>';
    }
}

function closeModal() {
    document.getElementById('tweetModal').classList.remove('active');
}

function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

function switchView(view) {
    currentView = view;
    
    // Update buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(view)) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide views
    if (view === 'calendar') {
        document.getElementById('calendarView').style.display = 'block';
        document.getElementById('timelineView').classList.remove('active');
    } else {
        document.getElementById('calendarView').style.display = 'none';
        document.getElementById('timelineView').classList.add('active');
    }
}

function showError(message) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = `<div class="error">${message}</div>`;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load tweets on page load
    loadScheduledTweets();
    
    // Auto-refresh every 30 seconds
    setInterval(loadScheduledTweets, 30000);
    
    // Set up event listeners
    document.getElementById('prevMonth').addEventListener('click', previousMonth);
    document.getElementById('nextMonth').addEventListener('click', nextMonth);
    document.getElementById('calendarViewBtn').addEventListener('click', () => switchView('calendar'));
    document.getElementById('timelineViewBtn').addEventListener('click', () => switchView('timeline'));
    document.getElementById('refreshBtn').addEventListener('click', loadScheduledTweets);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    
    // Close modal when clicking outside
    document.getElementById('tweetModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
});
