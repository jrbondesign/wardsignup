-- Add date field to sessions table to support specific dates
ALTER TABLE public.sessions
ADD COLUMN session_date DATE;

-- Add index for better query performance on date
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.sessions(session_date);

-- Comment explaining the field
COMMENT ON COLUMN public.sessions.session_date IS 'Specific date for the session. If null, session is recurring based on day_of_week.';
