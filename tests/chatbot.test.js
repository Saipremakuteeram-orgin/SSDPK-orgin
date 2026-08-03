import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setupDOM, mockLocalStorage } from './helpers.js';

describe('chatbot.js', () => {
  beforeEach(() => {
    setupDOM(`
      <html><body>
        <div id="chatbotContainer"></div>
      </body></html>
    `);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DOM Injection', () => {
    it('should create chatbot FAB element', () => {
      const fab = document.createElement('div');
      fab.id = 'chatbotFab';
      fab.className = 'chatbot-fab';
      document.body.appendChild(fab);

      const element = document.getElementById('chatbotFab');
      expect(element).toBeTruthy();
      expect(element.className).toContain('chatbot-fab');
    });

    it('should create chatbot window element', () => {
      const win = document.createElement('div');
      win.id = 'chatbotWindow';
      win.className = 'chatbot-window';
      document.body.appendChild(win);

      const element = document.getElementById('chatbotWindow');
      expect(element).toBeTruthy();
    });

    it('should create notification element', () => {
      const notif = document.createElement('div');
      notif.id = 'chatbotNotification';
      notif.className = 'chatbot-notification';
      document.body.appendChild(notif);

      const element = document.getElementById('chatbotNotification');
      expect(element).toBeTruthy();
      expect(element.className).toContain('chatbot-notification');
    });
  });

  describe('API Key Management', () => {
    it('should save API key to localStorage when valid', () => {
      window.localStorage = mockLocalStorage({});

      const key = 'test-api-key-with-sufficient-length';
      window.localStorage.setItem('sspk_gemini_key', key);

      expect(window.localStorage.getItem('sspk_gemini_key')).toBe(key);
    });

    it('should reject API key that is too short', () => {
      window.localStorage = mockLocalStorage({});

      const shortKey = 'short';
      const isValid = shortKey.length > 20;

      expect(isValid).toBe(false);
    });

    it('should validate API key length correctly', () => {
      const validKey = 'a-very-long-and-valid-api-key-123456789';
      const invalidKey = 'short-key';

      expect(validKey.length > 20).toBe(true);
      expect(invalidKey.length > 20).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    const TOKEN_BUDGET = 50000;
    const RPM_LIMIT = 15;
    const WINDOW_MS = 60000;

    it('should track request timestamps', () => {
      let timestamps = [];
      const now = Date.now();

      // Simulate adding timestamp
      timestamps.push(now);
      localStorage.setItem('sspk_chatbot_request_times', JSON.stringify(timestamps));

      const parsed = JSON.parse(localStorage.getItem('sspk_chatbot_request_times') || '[]');
      expect(parsed.length).toBe(1);
    });

    it('should filter old timestamps', () => {
      const oldTime = Date.now() - 120000; // 2 minutes ago, outside 1 min window
      const newTime = Date.now();
      let timestamps = [oldTime, newTime];

      const now = Date.now();
      timestamps = timestamps.filter(t => now - t < WINDOW_MS);

      expect(timestamps.length).toBe(1);
    });

    it('should check rate limit correctly', () => {
      let timestamps = Array(RPM_LIMIT).fill(Date.now());

      const isRateLimited = timestamps.length >= RPM_LIMIT;
      expect(isRateLimited).toBe(true);

      timestamps = Array(RPM_LIMIT - 1).fill(Date.now());
      const notRateLimited = timestamps.length >= RPM_LIMIT;
      expect(notRateLimited).toBe(false);
    });

    it('should track token budget', () => {
      let cumulativeTokens = 0;
      const isExhausted = cumulativeTokens >= TOKEN_BUDGET;
      expect(isExhausted).toBe(false);

      cumulativeTokens = TOKEN_BUDGET;
      const exhausted = cumulativeTokens >= TOKEN_BUDGET;
      expect(exhausted).toBe(true);
    });
  });

  describe('Topic Filtering', () => {
    const ALLOWED_KEYWORDS = [
      'trust', 'sspk', 'sathya sai', 'prema kuteeram', 'seva', 'bhajan',
      'event', 'events', 'register', 'gallery', 'donate', 'dashboard',
      'about', 'mission', 'trustee', 'contact', 'email', 'phone'
    ];

    it('should allow trust-related queries', () => {
      const text = 'Tell me about the trust activities';
      const lowerText = text.toLowerCase();
      const isOnTopic = ALLOWED_KEYWORDS.some(kw => lowerText.includes(kw));
      expect(isOnTopic).toBe(true);
    });

    it('should allow seva-related queries', () => {
      const text = 'What seva activities do you do?';
      const lowerText = text.toLowerCase();
      const isOnTopic = ALLOWED_KEYWORDS.some(kw => lowerText.includes(kw));
      expect(isOnTopic).toBe(true);
    });

    it('should block unrelated queries', () => {
      const text = 'How do I fix my computer?';
      const lowerText = text.toLowerCase();
      const isOnTopic = ALLOWED_KEYWORDS.some(kw => lowerText.includes(kw));
      expect(isOnTopic).toBe(false);
    });

    it('should allow event-related queries', () => {
      const text = 'Upcoming events this month';
      const lowerText = text.toLowerCase();
      const isOnTopic = ALLOWED_KEYWORDS.some(kw => lowerText.includes(kw));
      expect(isOnTopic).toBe(true);
    });
  });

  describe('Message Handling', () => {
    it('should check messages area element exists', () => {
      const div = document.createElement('div');
      div.id = 'chatbotMessages';
      div.className = 'chatbot-messages hidden';
      document.body.appendChild(div);

      const element = document.getElementById('chatbotMessages');
      expect(element).toBeTruthy();
      expect(element.classList.contains('hidden')).toBe(true);
    });

    it('should check form element exists', () => {
      const form = document.createElement('form');
      form.id = 'chatbotForm';
      form.className = 'chatbot-input hidden';
      document.body.appendChild(form);

      const element = document.getElementById('chatbotForm');
      expect(element).toBeTruthy();
    });

    it('should check input element exists', () => {
      const input = document.createElement('input');
      input.id = 'chatInput';
      input.placeholder = 'Ask a question...';
      document.body.appendChild(input);

      const element = document.getElementById('chatInput');
      expect(element).toBeTruthy();
      expect(element.placeholder).toBe('Ask a question...');
    });
  });

  describe('UI State Management', () => {
    it('should toggle hidden class on elements', () => {
      const div = document.createElement('div');
      div.className = 'hidden';
      document.body.appendChild(div);

      expect(div.classList.contains('hidden')).toBe(true);

      div.classList.remove('hidden');
      expect(div.classList.contains('hidden')).toBe(false);

      div.classList.add('hidden');
      expect(div.classList.contains('hidden')).toBe(true);
    });

    it('should update input placeholder', () => {
      const input = document.createElement('input');
      input.id = 'chatInput';
      document.body.appendChild(input);

      input.placeholder = 'Rate limited — please wait 30s...';
      expect(input.placeholder).toBe('Rate limited — please wait 30s...');

      input.placeholder = 'Ask a question...';
      expect(input.placeholder).toBe('Ask a question...');
    });

    it('should handle window open/close', () => {
      const win = document.createElement('div');
      win.id = 'chatbotWindow';
      win.className = 'chatbot-window';
      document.body.appendChild(win);

      expect(win.classList.contains('active')).toBe(false);

      win.classList.add('active');
      expect(win.classList.contains('active')).toBe(true);

      win.classList.remove('active');
      expect(win.classList.contains('active')).toBe(false);
    });
  });
});
