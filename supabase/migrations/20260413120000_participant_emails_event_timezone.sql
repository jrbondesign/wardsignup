-- Participant reminder dedupe + organizer-set event timezone (IANA) for slot times and emails

ALTER TABLE public.signups
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.signups.reminder_sent_at IS 'Set when the ~24h participant reminder email was sent successfully; null means not sent yet.';

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS event_timezone TEXT;

COMMENT ON COLUMN public.campaigns.event_timezone IS 'IANA timezone for interpreting session_date + time (e.g. America/Denver). Null uses DEFAULT_EVENT_TIMEZONE env at runtime.';
