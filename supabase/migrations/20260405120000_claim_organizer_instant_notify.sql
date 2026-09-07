-- Atomic claim for faster-alerts email: only one concurrent signup wins per cooldown window.
CREATE OR REPLACE FUNCTION public.claim_organizer_instant_notify(
  p_campaign_id uuid,
  p_min_interval_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.campaigns
  SET organizer_last_instant_notify_at = now()
  WHERE id = p_campaign_id
    AND organizer_instant_notify_enabled = true
    AND (
      organizer_last_instant_notify_at IS NULL
      OR organizer_last_instant_notify_at < now() - (p_min_interval_seconds * interval '1 second')
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

COMMENT ON FUNCTION public.claim_organizer_instant_notify(uuid, int) IS
  'Sets organizer_last_instant_notify_at only if cooldown elapsed; prevents duplicate instant emails from concurrent signups.';

REVOKE ALL ON FUNCTION public.claim_organizer_instant_notify(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_organizer_instant_notify(uuid, int) TO service_role;
