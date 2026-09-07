-- Hourly per-IP signup rate limiting (API route calls via service role)

CREATE TABLE IF NOT EXISTS public.signup_rate_limit (
  ip_hash TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, bucket_start)
);

COMMENT ON TABLE public.signup_rate_limit IS 'Hourly signup rate limit buckets; service role only.';

ALTER TABLE public.signup_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_consume_signup_rate(
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
  PERFORM pg_advisory_xact_lock(hashtext(p_ip_hash), hashtext(p_bucket::text));

  SELECT request_count INTO c
  FROM public.signup_rate_limit
  WHERE ip_hash = p_ip_hash AND bucket_start = p_bucket;

  IF FOUND THEN
    IF c >= p_max THEN
      RETURN false;
    END IF;
    UPDATE public.signup_rate_limit
    SET request_count = request_count + 1
    WHERE ip_hash = p_ip_hash AND bucket_start = p_bucket;
    RETURN true;
  ELSE
    INSERT INTO public.signup_rate_limit (ip_hash, bucket_start, request_count)
    VALUES (p_ip_hash, p_bucket, 1);
    RETURN true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.try_consume_signup_rate IS 'Returns false if hourly signup cap reached; otherwise increments and returns true.';
