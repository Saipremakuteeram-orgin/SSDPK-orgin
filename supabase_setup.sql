-- ============================================================
-- Sathya Sai Trust - Supabase Database Schema
-- Run this entire file in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fnmbiapynzfdxgybxtyd/sql/new
-- ============================================================

-- ============================================================
-- TABLE: members
-- Stores all registered members of the Trust
-- ============================================================
CREATE TABLE IF NOT EXISTS public.members (
  id            BIGSERIAL PRIMARY KEY,
  fname         TEXT NOT NULL,
  lname         TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  place         TEXT,
  district      TEXT,
  address       TEXT,
  member_id     TEXT NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- In case members table already exists, run this to add email:
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email TEXT;
-- Add a unique constraint to email if not already present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_email_key') THEN
        ALTER TABLE public.members ADD CONSTRAINT members_email_key UNIQUE (email);
    END IF;
END $$;

-- RLS: Anyone can read members (for admin list), only anon key can insert
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read members" ON public.members
  FOR SELECT USING (true);

CREATE POLICY "Anyone can register" ON public.members
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- TABLE: events
-- Stores all Trust events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'bhajan',
  date          DATE NOT NULL,
  time          TEXT,
  venue         TEXT,
  description   TEXT,
  coordinator   TEXT,
  contact       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Public read, anyone (admin) can insert/update/delete
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read events" ON public.events
  FOR SELECT USING (true);

CREATE POLICY "Anyone can manage events" ON public.events
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: gallery
-- Stores gallery image metadata (actual files in Supabase Storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gallery (
  id           BIGSERIAL PRIMARY KEY,
  caption      TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'event',
  src_url      TEXT,
  placeholder  TEXT,
  event_id     BIGINT REFERENCES public.events(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Public read, anyone (admin) can insert/delete
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read gallery" ON public.gallery
  FOR SELECT USING (true);

CREATE POLICY "Anyone can manage gallery" ON public.gallery
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SEED: Default events data
-- ============================================================
INSERT INTO public.events (title, category, date, time, venue, description, coordinator, contact) VALUES
  ('Mother''s Day Special Bhajans', 'bhajan', '2026-05-10', '6:00 PM – 7:30 PM', 'SSPK Hall', 'Devotional songs dedicated to the Divine Mother. Special prayers for mothers around the world, inviting peace and spiritual nourishment.', 'Sita Sundar', '+91-9876543215'),
  ('Buddha Purnima Celebration', 'celebration', '2026-05-24', '6:00 PM – 7:30 PM', 'SSPK Hall', 'Special Buddhist chants, group meditation, and peace prayers reflecting the message of truth and non-violence of Lord Buddha.', 'Dr. Ramesh Kumar', '+91-9876543211'),
  ('Clothing Distribution Drive', 'seva', '2026-05-31', '8:00 AM – 12:00 PM', 'SSPK Premises', 'Annual distribution of clean clothes, warm blankets, and bedding to underprivileged families before the monsoon season begins.', 'Rahul Verma', '+91-9876543212'),
  ('Sunday Bhajans', 'bhajan', '2026-06-15', '6:00 PM – 7:30 PM', 'SSPK Hall', 'Weekly community devotional singing and meditation. Open to all members of the public seeking spiritual upliftment.', 'Srinivas Rao', '+91-9876543210'),
  ('Study Circle — Summer Course', 'study', '2026-06-22', '10:00 AM – 12:00 PM', 'SSPK Hall', 'Exploring the teachings of Sri Sathya Sai Baba on the theme of ''Love and Service'' with a collaborative Q&A session.', 'Dr. Ramesh Kumar', '+91-9876543211'),
  ('Community Seva — Food Drive', 'seva', '2026-06-29', '8:00 AM – 12:00 PM', 'City Community Center', 'Monthly food distribution drive for low-income families. Volunteers are welcome to assist in packing and sharing meals.', 'Rahul Verma', '+91-9876543212'),
  ('Guru Purnima Celebration', 'celebration', '2026-07-06', '9:00 AM – 11:00 AM', 'SSPK Hall', 'Special morning prayers, chants, and devotional offerings in reverence and gratitude to the spiritual master.', 'Srinivas Rao', '+91-9876543210'),
  ('Health Awareness Camp', 'seva', '2026-07-20', '9:00 AM – 3:00 PM', 'SSPK Community Hall', 'Free medical health screening, general practitioner consultations, and health advice leaflets for nearby residents.', 'Dr. Lakshmi Prasad', '+91-9876543213'),
  ('Independence Day & Seva', 'seva', '2026-08-15', '7:00 AM – 10:00 AM', 'SSPK Premises', 'Flag hoisting ceremony, patriotic songs, and a special nutritious breakfast distribution drive to local children.', 'Karan Johar', '+91-9876543214')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Default gallery data
-- ============================================================
INSERT INTO public.gallery (caption, category, placeholder) VALUES
  ('Evening Bhajans', 'bhajan', '🕉️'),
  ('Food Distribution Drive', 'seva', '🍲'),
  ('Health Camp', 'seva', '💊'),
  ('Sai Baba Birthday Celebration', 'event', '🎈'),
  ('Community Gathering', 'community', '🤝')
ON CONFLICT DO NOTHING;

-- ============================================================
-- STORAGE: gallery-images bucket
-- Run these lines in the Supabase SQL Editor
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('gallery-images', 'gallery-images', true)
  ON CONFLICT DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Public gallery read" ON storage.objects
  FOR SELECT USING (bucket_id = 'gallery-images');

CREATE POLICY "Anyone can upload gallery" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'gallery-images');

CREATE POLICY "Anyone can delete gallery" ON storage.objects
  FOR DELETE USING (bucket_id = 'gallery-images');

-- ============================================================
-- MIGRATION: Add missing columns to gallery table if not present
-- Run this after the CREATE TABLE above
-- ============================================================
ALTER TABLE public.gallery
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES public.events(id) ON DELETE SET NULL;
-- source values: 'telegram' | 'dashboard' | 'default'

