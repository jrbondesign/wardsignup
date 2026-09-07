-- Creator feedback loop: one row per (user, brand). The row is created by the
-- daily cron when a creator qualifies (has an event with >=1 signup), holds the
-- tokenized form link, and later the response itself. Service-role only — the
-- public form route looks rows up by token via the admin client, so no RLS
-- policies are defined on purpose.

create table if not exists public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id text not null,
  email_lower text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  qualified_at timestamptz not null default now(),
  sent_at timestamptz,
  responded_at timestamptz,
  answer_blocker text,
  answer_next_event text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'responded', 'triaged')),
  created_at timestamptz not null default now(),
  unique (user_id, brand_id)
);

create index if not exists feedback_requests_brand_status_idx
  on public.feedback_requests (brand_id, status);

alter table public.feedback_requests enable row level security;

-- Service-role only: no anon/authenticated grants and no RLS policies.
-- All reads/writes go through the admin client (cron passes + token routes).
grant select, insert, update, delete on public.feedback_requests to service_role;
