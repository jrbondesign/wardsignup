-- Faster alerts no longer use RPC throttling; cron uses organizer_last_instant_notify_at only.
DROP FUNCTION IF EXISTS public.claim_organizer_instant_notify(uuid, int);
