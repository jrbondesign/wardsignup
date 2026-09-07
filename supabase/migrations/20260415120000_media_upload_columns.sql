-- Step 1: Add logo_url + email_lower to organizer_profiles
-- email_lower enables fast lookup in send-magic-link without auth.users join
ALTER TABLE public.organizer_profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS email_lower TEXT;

CREATE INDEX IF NOT EXISTS idx_organizer_profiles_email_lower
  ON public.organizer_profiles (email_lower);

-- Add cover image to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
