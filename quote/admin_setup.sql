-- ============================================================
-- STEP 1: Create site_admins table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_admins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS — clients can only read their own admin record
ALTER TABLE public.site_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read own record"
  ON public.site_admins FOR SELECT
  USING (auth.jwt() ->> 'email' = email);

-- No INSERT/UPDATE/DELETE policies for clients — admin-only via Supabase dashboard


-- ============================================================
-- STEP 2: Insert your admin email into site_admins
-- Replace the email below with your actual admin email
-- ============================================================

INSERT INTO public.site_admins (email)
VALUES ('your-admin@email.com')   -- ← CHANGE THIS to your chosen admin email
ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- STEP 3: Create the admin user in Supabase Auth
-- Go to: Supabase Dashboard → Authentication → Users → "+ Add User"
-- Set:
--   Email    : same as above (e.g. your-admin@email.com)
--   Password : choose a strong password (min 8 chars)
--   Email Confirm: check "Auto Confirm"
-- 
-- After creating: the admin can log in at /login.html
-- using that email + password. No credentials are in the code.
-- ============================================================
