// js/chatbot.js

document.addEventListener('DOMContentLoaded', () => {
  // Inject Chatbot HTML with Token Notification Bar
  const chatbotHTML = `
    <div class="chatbot-fab" id="chatbotFab" title="Ask Sai AI">
      &#x2728;
    </div>
    
    <div class="chatbot-window" id="chatbotWindow">
      <div class="chatbot-header">
        <div class="chatbot-header-title">
          <h3>Sai AI Assistant</h3>
          <span>&bull; Online</span>
        </div>
        <button class="chatbot-close" id="chatbotClose">&times;</button>
      </div>

      <!-- Key Setup (Only shown if key is missing) -->
      <div class="chat-key-setup" id="chatKeySetup">
        <p style="font-size:14px; margin-bottom:8px;"><strong>Local Simulation Mode</strong></p>
        <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">To use the AI chatbot locally without exposing secrets in the code, please enter your Google Gemini API Key.</p>
        <input type="password" id="geminiKeyInput" placeholder="Enter Gemini API Key">
        <button class="btn btn-primary" id="saveKeyBtn" style="width:100%; justify-content:center;">Save Key Securely</button>
      </div>

      <div class="chatbot-messages hidden" id="chatbotMessages">
        <div class="chat-msg bot">Sai Ram! I'm Sai AI, your assistant for the Sri Sai Dharma Samrakshana Prema Kuteeram website. I can help you with information about our trust, events, activities, and services. How may I assist you today?</div>
      </div>

      <!-- Token Notification Bar -->
      <div class="chatbot-notify-bar hidden" id="chatbotNotifyBar">
        <div class="chatbot-notify-progress" id="chatbotNotifyProgress" style="width: 0%;"></div>
        <div class="chatbot-notify-content">
          <span class="chatbot-notify-text" id="chatbotNotifyText">Token Usage: 0%</span>
          <span class="chatbot-notify-renew" id="chatbotNotifyRenew">Stable</span>
        </div>
      </div>

      <form class="chatbot-input hidden" id="chatbotForm">
        <input type="text" id="chatInput" placeholder="Ask a question..." autocomplete="off">
        <button type="submit" id="chatSubmitBtn" title="Send">&#x27A4;</button>
      </form>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', chatbotHTML);

  // Elements
  const fab = document.getElementById('chatbotFab');
  const win = document.getElementById('chatbotWindow');
  const closeBtn = document.getElementById('chatbotClose');
  const keySetup = document.getElementById('chatKeySetup');
  const messagesArea = document.getElementById('chatbotMessages');
  const form = document.getElementById('chatbotForm');
  const input = document.getElementById('chatInput');
  const submitBtn = document.getElementById('chatSubmitBtn');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const keyInput = document.getElementById('geminiKeyInput');

  // Page Context Detection
  let pageContext = `You are "Sai AI", a dedicated assistant for the Sri Sai Dharma Samrakshana Prema Kuteeram (SSPK) website. You are STRICTLY limited to answering questions ONLY about the following topics:

1. The trust — its mission, vision, founding, registration (Reg. No. 51/2026, Melakarur, Karur), Settlor & Managing Trustee Shri S. Govindaraj, and the 12 Board of Trustees.
2. Trust activities — Spiritual (Guru Purnima, Ganapathi Homam, Gayatri Homam, Sai Jayanthi, Rudra Japam, monthly Amavasya Tarpanam, annual Thithi/Shraddha, Rathakalpa Pooja, Sathyanarayana Pooja, Rama Navami, Karthigai Deepam, etc.), Seva (Grocery Aid, Temple Archakas/Gurus Support, Veda Students Support, Diwali Clothing, Family Welfare Aid, Old-Age Home, Temple Service, Tree Planting, Monthly Brindhavan Pooja, Narayana Seva), Education & Awareness (Career Guidance, Health & Hygiene Programs, Satsangs, Spiritual Classes), and Publications (Deivathin Kural, Maha Periyava Teachings, Audio/Video Releases).
3. Events — upcoming and past events, event registration, event dates, bhajans, medical camps, and seva activities.
4. The website itself — how to navigate pages, use the gallery, register for events, donate via the dashboard, and contact the trust.
5. How to reach the trust — email: info@sathyasaipremakuterram.org, registered office: No.104, Mettu Street, Karur - 639001.

CRITICAL RULES:
- NEVER answer questions unrelated to the trust, its activities, or this website.
- NEVER provide general knowledge, trivia, coding help, opinions, or any external information.
- NEVER engage in casual conversation, roleplay, or hypothetical discussions.
- If a user asks anything outside the scope above, respond EXACTLY: "I'm sorry, but I can only assist with questions related to Sri Sai Dharma Samrakshana Prema Kuteeram and its activities. Please feel free to ask about our trust, events, or services."
- Always respond in a warm, respectful, and helpful tone consistent with the trust's values.`;

  if (window.location.pathname.includes('events')) {
    pageContext += " The user is currently on the Events page. We have upcoming Bhajans, Medical Camps, and Seva activities. Guide them on how to register or find dates.";
  } else if (window.location.pathname.includes('gallery')) {
    pageContext += " The user is currently on the Gallery page. Explain our past Seva and community activities.";
  } else if (window.location.pathname.includes('dashboard')) {
    pageContext += " The user is currently on the Dashboard page. Guide them on how to donate, view their profile, or manage their account.";
  } else if (window.location.pathname.includes('trustees')) {
    pageContext += " The user is currently on the Trustees page. Provide information about the Board of Trustees, their roles, and activities.";
  }

  // Check for saved API key
  let apiKey = localStorage.getItem('sspk_gemini_key');
  
  function initUI() {
    if (apiKey) {
      keySetup.classList.add('hidden');
      messagesArea.classList.remove('hidden');
      form.classList.remove('hidden');
    } else {
      keySetup.classList.remove('hidden');
      messagesArea.classList.add('hidden');
      form.classList.add('hidden');
    }
  }

  // Try to load Gemini API key dynamically from local config endpoint or local .env if available
  async function loadLocalApiKey() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        if (data.GEMINI_API_KEY) {
          apiKey = data.GEMINI_API_KEY.trim();
          console.log('Successfully loaded Gemini API key from /api/config');
          initUI();
          return;
        }
      }
    } catch (e) {
      console.log('No /api/config endpoint available, trying raw .env fallback...');
    }

    if (apiKey) return;

    try {
      const response = await fetch('/.env');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n#]+)["']?/i);
          if (match && match[1]) {
            apiKey = match[1].trim();
            console.log('Successfully loaded Gemini API key from local fallback .env');
            initUI();
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Could not load local .env file:', e);
    }
  }
  
  initUI();
  loadLocalApiKey();

  // Toggle Window
  fab.addEventListener('click', () => win.classList.add('active'));
  closeBtn.addEventListener('click', () => win.classList.remove('active'));

  // Save Key
  saveKeyBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (key.length > 20) {
      localStorage.setItem('sspk_gemini_key', key);
      apiKey = key;
      initUI();
    } else {
      alert('Please enter a valid Gemini API key.');
    }
  });

  // ══════════════════════════════════════════════════════════════
  // RATE LIMITING & TOKEN BUDGET CONSTANTS
  // ══════════════════════════════════════════════════════════════
  const TOKEN_BUDGET = 50000;
  const RPM_LIMIT = 15;
  const WINDOW_MS = 60000; // 1 minute sliding window
  
  // DOM Elements for notification
  const notifyBar = document.getElementById('chatbotNotifyBar');
  const notifyProgress = document.getElementById('chatbotNotifyProgress');
  const notifyText = document.getElementById('chatbotNotifyText');
  const notifyRenew = document.getElementById('chatbotNotifyRenew');

  // Load/initialize token state with daily reset
  let lastResetDate = localStorage.getItem('sspk_chatbot_last_reset') || '';
  const today = new Date().toISOString().slice(0, 10);
  if (lastResetDate !== today) {
    localStorage.setItem('sspk_chatbot_token_count', '0');
    localStorage.setItem('sspk_chatbot_request_times', '[]');
    localStorage.setItem('sspk_chatbot_last_reset', today);
  }

  let cumulativeTokens = parseInt(localStorage.getItem('sspk_chatbot_token_count')) || 0;
  let requestTimestamps = JSON.parse(localStorage.getItem('sspk_chatbot_request_times')) || [];
  let cooldownTimer = null;

  // ══════════════════════════════════════════════════════════════
  // INPUT ENABLE/DISABLE HELPERS
  // ══════════════════════════════════════════════════════════════
  function setInputEnabled(enabled) {
    input.disabled = !enabled;
    submitBtn.disabled = !enabled;
    if (enabled) {
      input.placeholder = 'Ask a question...';
      input.style.opacity = '1';
      submitBtn.style.opacity = '1';
    } else {
      input.style.opacity = '0.5';
      submitBtn.style.opacity = '0.5';
    }
  }

  function startCooldown(seconds) {
    if (cooldownTimer) clearInterval(cooldownTimer);
    setInputEnabled(false);
    input.placeholder = 'Rate limited — please wait ' + seconds + 's...';

    cooldownTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        setInputEnabled(true);
      } else {
        input.placeholder = 'Rate limited — please wait ' + seconds + 's...';
      }
    }, 1000);
  }

  // ══════════════════════════════════════════════════════════════
  // RATE LIMIT CHECK FUNCTIONS
  // ══════════════════════════════════════════════════════════════
  function cleanTimestamps() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(t => now - t < WINDOW_MS);
    localStorage.setItem('sspk_chatbot_request_times', JSON.stringify(requestTimestamps));
  }

  function getRateLimitResetMs() {
    if (requestTimestamps.length === 0) return 0;
    return Math.max(0, requestTimestamps[0] + WINDOW_MS - Date.now());
  }

  function isTokenBudgetExhausted() {
    return cumulativeTokens >= TOKEN_BUDGET;
  }

  function isRateLimited() {
    cleanTimestamps();
    return requestTimestamps.length >= RPM_LIMIT;
  }

  // ══════════════════════════════════════════════════════════════
  // NOTIFICATION BAR UI UPDATE
  // ══════════════════════════════════════════════════════════════
  function updateTokenUI() {
    if (!apiKey) {
      notifyBar.classList.add('hidden');
      return;
    }
    notifyBar.classList.remove('hidden');
    
    cleanTimestamps();

    // Calculate token percentage
    const percent = Math.min(100, Math.round((cumulativeTokens / TOKEN_BUDGET) * 100));
    notifyProgress.style.width = percent + '%';

    // Token budget status
    if (isTokenBudgetExhausted()) {
      notifyBar.className = 'chatbot-notify-bar danger-alert';
      notifyText.textContent = 'Usage limit reached. Resets tomorrow.';
      notifyRenew.textContent = 'Offline';
      setInputEnabled(false);
      input.placeholder = 'Daily usage limit reached. Resets tomorrow.';
      return;
    }

    // RPM status
    if (isRateLimited()) {
      const resetMs = getRateLimitResetMs();
      const resetSec = Math.ceil(resetMs / 1000);
      notifyBar.className = 'chatbot-notify-bar warning-alert';
      notifyText.textContent = 'Rate limit: ' + requestTimestamps.length + '/' + RPM_LIMIT + ' req/min';
      notifyRenew.textContent = 'Renew in: ' + resetSec + 's';
      if (!cooldownTimer) startCooldown(resetSec);
    } else if (percent >= 75) {
      notifyBar.className = 'chatbot-notify-bar warning-alert';
      notifyText.textContent = 'Tokens: ' + percent + '% (' + cumulativeTokens + '/' + TOKEN_BUDGET + ')';
      notifyRenew.textContent = RPM_LIMIT - requestTimestamps.length + '/' + RPM_LIMIT + ' req left';
    } else {
      notifyBar.className = 'chatbot-notify-bar';
      notifyText.textContent = 'Tokens: ' + percent + '% (' + cumulativeTokens + '/' + TOKEN_BUDGET + ')';
      notifyRenew.textContent = RPM_LIMIT - requestTimestamps.length + '/' + RPM_LIMIT + ' req left';
    }
  }

  // Set interval to update UI countdowns
  setInterval(updateTokenUI, 1000);
  updateTokenUI();

  // ══════════════════════════════════════════════════════════════
  // CLIENT-SIDE TOPIC FILTER
  // ══════════════════════════════════════════════════════════════
  const ALLOWED_KEYWORDS = [
    'trust', 'sspk', 'sathya sai', 'prema kuteeram', 'prema kuterram',
    'kuteeram', 'kuterram', 'dharma', 'samrakshana', 'seva', 'bhajan',
    'bhajans', 'homam', 'pooja', 'archaka', 'veda', 'guru purnima',
    'sai jayanthi', 'ram navami', 'karthigai', 'deepam', 'diwali',
    'medical camp', 'event', 'events', 'register', 'registration',
    'gallery', 'photo', 'photos', 'image', 'images', 'video', 'videos',
    'donate', 'donation', 'donations', 'dashboard', 'profile',
    'about', 'mission', 'vision', 'trustee', 'trustees', 'board',
    'govindaraj', 'sai prakash', 'sathyamoorthy', 'chandrasekaran',
    'hariharan', 'prem sai', 'amarnath', 'sridevi', 'srividya',
    'sathyanarayanan', 'nithya', 'prasad', 'darshan',
    'karur', 'melakarur', 'contact', 'email', 'phone', 'address',
    'website', 'page', 'navigate', 'login', 'sign up', 'sign in',
    'password', 'account', 'weekly', 'monthly', 'annual', 'daily',
    'schedule', 'date', 'time', 'location', 'venue', 'programme',
    'spiritual', 'education', 'awareness', 'publications', 'social media',
    'facebook', 'instagram', 'youtube', 'telegram', 'whatsapp',
    'career', 'hygiene', 'clothing', 'food', 'grocery', 'health',
    'old-age', 'temple', 'planting', 'tree', 'community', 'children',
    'youth', 'student', 'students', 'family', 'welfare', 'support',
    'help', 'info', 'information', 'detail', 'details', 'learn',
    'what', 'when', 'where', 'who', 'how', 'which', 'tell'
  ];

  // ══════════════════════════════════════════════════════════════
  // CHAT SUBMIT HANDLER
  // ══════════════════════════════════════════════════════════════
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !apiKey) return;

    // Guard 1: Token budget hard cutoff
    if (isTokenBudgetExhausted()) {
      appendMessage('bot', 'You have reached the daily usage limit. Your token quota will reset tomorrow. Thank you for your patience.');
      return;
    }

    // Guard 2: RPM hard cutoff
    cleanTimestamps();
    if (isRateLimited()) {
      const resetSec = Math.ceil(getRateLimitResetMs() / 1000);
      appendMessage('bot', 'You have reached the request rate limit (' + RPM_LIMIT + ' requests per minute). Please wait ' + resetSec + ' seconds before trying again.');
      if (!cooldownTimer) startCooldown(resetSec);
      return;
    }

    // Guard 3: Client-side topic filter
    const lowerText = text.toLowerCase();
    const isOnTopic = ALLOWED_KEYWORDS.some(kw => lowerText.includes(kw));
    if (!isOnTopic) {
      appendMessage('bot', "I'm sorry, but I can only assist with questions related to Sri Sai Dharma Samrakshana Prema Kuteeram and its activities. Please feel free to ask about our trust, events, or services.");
      return;
    }

    // Track request timestamp
    const now = Date.now();
    requestTimestamps.push(now);
    localStorage.setItem('sspk_chatbot_request_times', JSON.stringify(requestTimestamps));
    updateTokenUI();

    appendMessage('user', text);
    input.value = '';
    
    // Show typing indicator
    const typingId = showTyping();

    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'SYSTEM CONTEXT: ' + pageContext + '\n\nUSER QUESTION: ' + text }]
          }]
        })
      });

      removeTyping(typingId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'API Error');
      }

      const data = await response.json();
      
      // Parse usageMetadata and update cumulative tokens
      if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
        cumulativeTokens += data.usageMetadata.totalTokenCount;
        localStorage.setItem('sspk_chatbot_token_count', cumulativeTokens);
        updateTokenUI();
      }

      const botReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that.";
      appendMessage('bot', botReply);

    } catch (error) {
      removeTyping(typingId);
      console.error(error);
      if (error.message.includes('API_KEY_INVALID')) {
        appendMessage('bot', 'Error: Invalid API Key. Please clear your local storage and re-enter.');
        localStorage.removeItem('sspk_gemini_key');
      } else {
        appendMessage('bot', 'Error connecting to Gemini AI: ' + error.message);
      }
    }
  });

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    
    // Simple markdown parsing for bold text if gemini returns it
    let htmlText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = htmlText;
    
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function showTyping() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    return id;
  }

  function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
});
