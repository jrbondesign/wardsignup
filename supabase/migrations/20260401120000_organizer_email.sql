-- Organizer email preferences + digest / instant notify watermarks
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS organizer_digest_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS organizer_instant_notify_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS organizer_last_digest_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS organizer_last_instant_notify_at timestamptz;

COMMENT ON COLUMN public.campaigns.organizer_digest_enabled IS 'When true, daily cron may send a metrics digest if something changed.';
COMMENT ON COLUMN public.campaigns.organizer_instant_notify_enabled IS 'When true, send throttled emails after new signups.';
COMMENT ON COLUMN public.campaigns.organizer_last_digest_sent_at IS 'Last time a digest email was sent (watermark for change detection).';
COMMENT ON COLUMN public.campaigns.organizer_last_instant_notify_at IS 'Last instant-notify email (throttle window).';

-- Track session edits for digest "something changed" without new signups
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.sessions SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_set_updated_at ON public.sessions;
CREATE TRIGGER trg_sessions_set_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sessions_updated_at();
