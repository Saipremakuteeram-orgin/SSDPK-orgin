// supabase-client.js
// Shared Supabase client instance for the entire project.
// 
// IMPORTANT: Replace the values below with your actual Supabase credentials.
// For production, consider using environment injection or a build step.
// The anon key is safe to expose in client-side code — Row Level Security (RLS)
// on the Supabase dashboard enforces access control.
//
// Get your credentials from: https://supabase.com/dashboard/project/_/settings/api

const DEFAULT_SUPABASE_URL = 'https://zkzotagctwqthxypczej.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprem90YWdjdHdxdGh4eXBjemVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjc3NzMsImV4cCI6MjA5NTcwMzc3M30.8xL23N-3MfbrXOA-ljsOnFy_LIDKCSxbYfHRzvMqCak';

// Initialise with defaults
var supabase = window.supabase.createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);

// Synchronously check if we can load credentials from the config endpoint (e.g. Vercel or local DevServer)
// to ensure other scripts register their listeners on the correct client instance.
try {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/config', false); // Synchronous request
  xhr.send(null);
  if (xhr.status === 200) {
    const data = JSON.parse(xhr.responseText);
    if (data.SUPABASE_URL && data.SUPABASE_ANON_KEY) {
      const newUrl = data.SUPABASE_URL.trim();
      const newKey = data.SUPABASE_ANON_KEY.trim();
      if (newUrl && newKey && (newUrl !== DEFAULT_SUPABASE_URL || newKey !== DEFAULT_SUPABASE_ANON_KEY)) {
        supabase = window.supabase.createClient(newUrl, newKey);
        console.log('Successfully re-configured Supabase Client synchronously from /api/config');
      }
    }
  }
} catch (e) {
  console.log('Using default client credentials (config endpoint not available or failed)');
}
