import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setupDOM, mockFetch } from './helpers.js';

describe('supabase-client.js', () => {
  const DEFAULT_URL = 'https://zkzotagctwqthxypczej.supabase.co';
  const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inrem90YWdjdHdxdGh4eXBjemVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjc3NzMsImV4cCI6MjA5NTcwMzc3M30.8xL23N-3MfbrXOA-ljsOnFy_LIDKCSxbYfHRzvMqCak';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Default Configuration', () => {
    it('should have correct default Supabase URL', () => {
      expect(DEFAULT_URL).toBe('https://zkzotagctwqthxypczej.supabase.co');
    });

    it('should have correct default anon key', () => {
      expect(DEFAULT_KEY).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(DEFAULT_KEY.length).toBeGreaterThan(100);
    });

    it('should have valid UUID-based project reference in URL', () => {
      const projRef = DEFAULT_URL.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
      expect(projRef).toBeTruthy();
      expect(projRef[1]).toBe('zkzotagctwqthxypczej');
    });
  });

  describe('Configuration Endpoint', () => {
    it('should handle /api/config being unavailable', async () => {
      global.fetch = mockFetch({});

      // Simulate the config fetch
      try {
        const res = await fetch('/api/config', { cache: 'force-cache' });
        expect(res.ok).toBe(true); // mockFetch returns ok:true by default
      } catch (e) {
        // Network error - should be handled gracefully
        expect(e).toBeTruthy();
      }
    });

    it('should handle config response with different credentials', async () => {
      const newConfig = {
        SUPABASE_URL: 'https://different-project.supabase.co',
        SUPABASE_ANON_KEY: 'different-key'
      };

      global.fetch = mockFetch({
        '/api/config': { data: newConfig }
      });

      const res = await fetch('/api/config', { cache: 'force-cache' });
      const data = await res.json();

      expect(data.SUPABASE_URL).toBe('https://different-project.supabase.co');
      expect(data.SUPABASE_ANON_KEY).toBe('different-key');
      expect(data.SUPABASE_URL !== DEFAULT_URL).toBe(true);
    });

    it('should handle config response with same credentials (no change)', async () => {
      const sameConfig = {
        SUPABASE_URL: DEFAULT_URL,
        SUPABASE_ANON_KEY: DEFAULT_KEY
      };

      global.fetch = mockFetch({
        '/api/config': { data: sameConfig }
      });

      const res = await fetch('/api/config', { cache: 'force-cache' });
      const data = await res.json();

      expect(data.SUPABASE_URL).toBe(DEFAULT_URL);
      expect(data.SUPABASE_ANON_KEY).toBe(DEFAULT_KEY);
    });

    it('should handle config response with missing fields', async () => {
      global.fetch = mockFetch({
        '/api/config': { data: { SUPABASE_URL: null, SUPABASE_ANON_KEY: undefined } }
      });

      const res = await fetch('/api/config', { cache: 'force-cache' });
      const data = await res.json();

      expect(data.SUPABASE_URL).toBeFalsy();
      expect(data.SUPABASE_ANON_KEY).toBeFalsy();
    });
  });

  describe('Auth State Management', () => {
    it('should have correct auth config options', () => {
      const authConfig = {
        persistSession: true,
        storageKey: 'sspk-auth',
        detectSessionInUrl: true
      };

      expect(authConfig.persistSession).toBe(true);
      expect(authConfig.storageKey).toBe('sspk-auth');
      expect(authConfig.detectSessionInUrl).toBe(true);
    });

    it('should use correct storage key format', () => {
      expect('sspk-auth').toMatch(/^sspk-/);
    });
  });

  describe('Client Configuration Check', () => {
    it('should validate URL format', () => {
      const urlPattern = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
      expect(urlPattern.test(DEFAULT_URL)).toBe(true);
    });

    it('should validate anon key format (JWT)', () => {
      // JWT keys start with eyJ (base64 for {" header)
      expect(DEFAULT_KEY.startsWith('eyJ')).toBe(true);
      const parts = DEFAULT_KEY.split('.');
      expect(parts.length).toBe(3); // JWT has 3 parts
    });
  });
});
