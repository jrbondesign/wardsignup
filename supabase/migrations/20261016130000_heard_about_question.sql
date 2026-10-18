-- Add optional "How did you hear about us?" tracking to organizer_profiles
-- Captured once at first event creation, never overwritten

ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS heard_about_choice text,
  ADD COLUMN IF NOT EXISTS heard_about_other_text text,
  ADD COLUMN IF NOT EXISTS heard_about_answered_at timestamptz;

COMMENT ON COLUMN organizer_profiles.heard_about_choice IS 'How the creator first heard about the product (e.g., "signed_up_on_event", "friend_or_ward", "search", "facebook", "ai_chat", "other"). Written once, never overwritten.';
COMMENT ON COLUMN organizer_profiles.heard_about_other_text IS 'Free-text detail when heard_about_choice = "other"';
COMMENT ON COLUMN organizer_profiles.heard_about_answered_at IS 'When the heard_about question was first answered';
