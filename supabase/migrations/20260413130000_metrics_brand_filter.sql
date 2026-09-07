-- Add optional brand_id filter to metrics RPCs (NULL = all brands, backward-compatible)

CREATE OR REPLACE FUNCTION public.metrics_total_capacity(p_brand_id text DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(s.capacity), 0)::bigint
  FROM public.sessions s
  JOIN public.campaigns c ON c.id = s.campaign_id
  WHERE p_brand_id IS NULL OR c.brand_id = p_brand_id;
$$;

COMMENT ON FUNCTION public.metrics_total_capacity(text) IS 'Admin metrics: total capacity, optionally filtered by brand_id.';

REVOKE ALL ON FUNCTION public.metrics_total_capacity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metrics_total_capacity(text) TO service_role;

CREATE OR REPLACE FUNCTION public.metrics_creator_breakdown(p_brand_id text DEFAULT NULL)
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
    WHERE p_brand_id IS NULL OR c.brand_id = p_brand_id
    GROUP BY c.id, c.user_email
  ) sub
  GROUP BY sub.organizer_email
  ORDER BY SUM(sub.sign) DESC;
$$;

COMMENT ON FUNCTION public.metrics_creator_breakdown(text) IS 'Admin metrics: events/sessions/signups by organizer email, optionally filtered by brand_id.';

REVOKE ALL ON FUNCTION public.metrics_creator_breakdown(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metrics_creator_breakdown(text) TO service_role;
