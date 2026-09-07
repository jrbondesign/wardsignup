-- Add end_time field to sessions table
ALTER TABLE public.sessions
ADD COLUMN end_time TEXT;

-- Comment explaining the field
COMMENT ON COLUMN public.sessions.end_time IS 'End time for the session (e.g., "20:00", "8:00 PM").';
