-- Generic per-IP per-hour rate limit (used for magic-link, cancel, and other
-- low-volume unauthenticated endpoints) plus a cron-idempotency table so a
-- compromised CRON_SECRET cannot be replayed within the same scheduled bucket.

CREATE TABLE IF NOT EXISTS public.action_rate_limit (
  action TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (action, ip_hash, bucket_start)
);

COMMENT ON TABLE public.action_rate_limit IS 'Per-action hourly rate limit buckets; service role only.';

ALTER TABLE public.action_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_consume_action_rate(
  p_action text,
  p_ip_hash text,
  p_bucket timestamptz,
  p_max int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c int;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(p_action || ':' || p_ip_hash),
    hashtext(p_bucket::text)
  );

  SELECT request_count INTO c
  FROM public.action_rate_limit
  WHERE action = p_action AND ip_hash = p_ip_hash AND bucket_start = p_bucket;

  IF FOUND THEN
    IF c >= p_max THEN
      RETURN false;
    END IF;
    UPDATE public.action_rate_limit
    SET request_count = request_count + 1
    WHERE action = p_action AND ip_hash = p_ip_hash AND bucket_start = p_bucket;
    RETURN true;
  ELSE
    INSERT INTO public.action_rate_limit (action, ip_hash, bucket_start, request_count)
    VALUES (p_action, p_ip_hash, p_bucket, 1);
    RETURN true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.try_consume_action_rate IS 'Returns false if hourly cap for the given action+ip reached; otherwise increments and returns true.';

-- Cron idempotency: each (job, bucket) row claim returns true at most once.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  job TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job, bucket_start)
);

COMMENT ON TABLE public.cron_runs IS 'Records cron invocations to prevent replay within a scheduled bucket; service role only.';

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_claim_cron_run(
  p_job text,
  p_bucket timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cron_runs (job, bucket_start)
  VALUES (p_job, p_bucket)
  ON CONFLICT (job, bucket_start) DO NOTHING;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.try_claim_cron_run IS 'Returns true if this is the first claim for (job, bucket); subsequent calls return false.';
