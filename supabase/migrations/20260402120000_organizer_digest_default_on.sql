-- New events: daily digest opt-in by default (existing rows unchanged).
ALTER TABLE public.campaigns
  ALTER COLUMN organizer_digest_enabled SET DEFAULT true;

COMMENT ON COLUMN public.campaigns.organizer_digest_enabled IS 'When true, daily cron may send a metrics digest (default on for new events).';
