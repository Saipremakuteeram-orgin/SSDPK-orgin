-- Run this in your Supabase SQL Editor
-- This adds the telegram_file_id column to the gallery table to support 0-byte Telegram Storage

ALTER TABLE public.gallery 
ADD COLUMN telegram_file_id text;

-- Add an index to speed up telegram deep link queries
CREATE INDEX IF NOT EXISTS idx_gallery_telegram_file_id ON public.gallery(telegram_file_id);
