// js/chatbot.js

document.addEventListener('DOMContentLoaded', () => {
  // Inject Chatbot HTML
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
        <div class="chat-msg bot">Sai Ram! How can I help you regarding our events, gallery, or trust activities today?</div>
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
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const keyInput = document.getElementById('geminiKeyInput');

  // Page Context Detection
  let pageContext = "You are an AI assistant for the Sathya Sai Trust website.";
  if (window.location.pathname.includes('events')) {
    pageContext += " The user is currently on the Events page. We have upcoming Bhajans, Medical Camps, and Seva activities. Guide them on how to register or find dates.";
  } else if (window.location.pathname.includes('gallery')) {
    pageContext += " The user is currently on the Gallery page. Explain our past Seva and community activities.";
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
    // 1. Try safe local config endpoint first
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

    // 2. Fall back to raw .env file parsing (for simple python -m http.server setups)
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

  // Chat Logic
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !apiKey) return;

    appendMessage('user', text);
    input.value = '';
    
    // Show typing indicator
    const typingId = showTyping();

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `SYSTEM CONTEXT: ${pageContext}\n\nUSER QUESTION: ${text}` }]
          }]
        })
      });

      removeTyping(typingId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'API Error');
      }

      const data = await response.json();
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
    div.className = `chat-msg ${role}`;
    
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
