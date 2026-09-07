-- Allow free-text "approximate" times like "around 9-10am" or "dinnertime"
-- on the campaign event-level time fields. sessions.time is already TEXT.
ALTER TABLE public.campaigns
  ALTER COLUMN event_start_time TYPE TEXT,
  ALTER COLUMN event_end_time TYPE TEXT;
