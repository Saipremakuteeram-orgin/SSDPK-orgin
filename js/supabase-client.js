// supabase-client.js
// Shared Supabase client instance for the entire project.
// 
// IMPORTANT: Replace the values below with your actual Supabase credentials.
// For production, consider using environment injection or a build step.
// The anon key is safe to expose in client-side code — Row Level Security (RLS)
// on the Supabase dashboard enforces access control.
//
// Get your credentials from: https://supabase.com/dashboard/project/_/settings/api

const SUPABASE_URL = 'https://fnmbiapynzfdxgybxtyd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubWJpYXB5bnpmZHhneWJ4dHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTY4MjQsImV4cCI6MjA5NTI3MjgyNH0.ax8tV7UhJ5XcfQDZ4Gbyga8kuqVro5zoPwo9d-5hVNg';

// Initialise the Supabase client using the globally imported CDN library.
// We use 'var' to prevent syntax conflicts with the Supabase CDN's global variable declaration.
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
