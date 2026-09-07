-- Email safety layer: suppression list + global send ceiling support.
-- Service-role only, same pattern as feedback_requests. Idempotent.

-- 1. Suppression list: any address here never receives notification-class
--    email again (unsubscribes, hard bounces, manual blocks). Transactional
--    mail (magic links, signup confirmations) is exempt by design.
create table if not exists public.email_suppressions (
  email_lower text primary key,
  reason text not null default 'unsubscribe'
    check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  source text,
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
grant select, insert, update, delete on public.email_suppressions to service_role;

-- 2. Global hourly send ceiling reuses try_consume_action_rate: the "ip hash"
--    slot is fed a constant per (brand, category) key. No new RPC needed.

-- 3. Cooldown support for org member re-invites (invite rows live on
--    organization_members with invited_email).
alter table public.organization_members
  add column if not exists invite_last_sent_at timestamptz;
