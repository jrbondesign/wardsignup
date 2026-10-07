-- Focal point for the event cover (CSS object-position, e.g. "50% 30%").
-- Covers render in a fixed 2:1 frame with object-fit: cover; this picks the visible crop.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS cover_position text
  CHECK (cover_position IS NULL OR cover_position ~ '^(100|[1-9]?[0-9])% (100|[1-9]?[0-9])%$');
