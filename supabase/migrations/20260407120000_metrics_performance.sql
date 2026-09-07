-- Indexes for time-range filters and rollups (metrics, reports)
CREATE INDEX IF NOT EXISTS idx_signups_signed_up_at ON public.signups (signed_up_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns (created_at);

-- Sum of all session capacities (replaces full-table fetch in Node)
CREATE OR REPLACE FUNCTION public.metrics_total_capacity()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(capacity), 0)::bigint FROM public.sessions;
$$;

COMMENT ON FUNCTION public.metrics_total_capacity() IS 'Admin metrics: total capacity across all sessions.';

REVOKE ALL ON FUNCTION public.metrics_total_capacity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metrics_total_capacity() TO service_role;

-- Per-organizer-email rollup without nested sessions/signups JSON
CREATE OR REPLACE FUNCTION public.metrics_creator_breakdown()
RETURNS TABLE (
  organizer_email text,
  event_count bigint,
  session_count bigint,
  signup_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sub.organizer_email,
    SUM(sub.evts)::bigint,
    SUM(sub.sess)::bigint,
    SUM(sub.sign)::bigint
  FROM (
    SELECT
      COALESCE(c.user_email, 'unknown') AS organizer_email,
      1::bigint AS evts,
      COUNT(DISTINCT s.id)::bigint AS sess,
      COUNT(su.id)::bigint AS sign
    FROM public.campaigns c
    LEFT JOIN public.sessions s ON s.campaign_id = c.id
    LEFT JOIN public.signups su ON su.session_id = s.id
    GROUP BY c.id, c.user_email
  ) sub
  GROUP BY sub.organizer_email
  ORDER BY SUM(sub.sign) DESC;
$$;

COMMENT ON FUNCTION public.metrics_creator_breakdown() IS 'Admin metrics: events/sessions/signups grouped by campaign user_email.';

REVOKE ALL ON FUNCTION public.metrics_creator_breakdown() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metrics_creator_breakdown() TO service_role;
