-- City-level geography cache for the homepage map.
-- Refreshed daily by /api/cron/geography-refresh from PostHog GeoIP.
-- No PII: city name, country, lat/lng, unique-person counts only.

CREATE TABLE IF NOT EXISTS public.geography_snapshot_cache (
  id TEXT PRIMARY KEY DEFAULT 'default',
  cities JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_cities INT NOT NULL DEFAULT 0,
  total_users INT NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'posthog'
);

COMMENT ON TABLE public.geography_snapshot_cache IS
  'Cached city markers for the public geography map; refreshed daily from PostHog. City-level only, no PII.';

ALTER TABLE public.geography_snapshot_cache ENABLE ROW LEVEL SECURITY;

-- Public map reads via the Next.js API with the service role. No anon policies.
-- Seed empty row so upserts are simple.
INSERT INTO public.geography_snapshot_cache (id, cities, total_cities, total_users, source)
VALUES ('default', '[]'::jsonb, 0, 0, 'seed')
ON CONFLICT (id) DO NOTHING;
