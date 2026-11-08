#!/usr/bin/env bash
# Disposable local Postgres proof for the unapplied cutover migration.
# Creates and drops its own database. Does not touch a hosted database.
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed"
  exit 2
fi
if ! pg_isready -q 2>/dev/null && ! sudo -u postgres pg_isready -q; then
  echo "local postgres is not running"
  exit 2
fi

DB="wardsignup_cutover_proof_$$"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)

cleanup() {
  sudo -u postgres psql -X -q -c "drop database if exists ${DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};"
"${PSQL[@]}" -d postgres <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'cutover_tester') then
    create role cutover_tester nologin;
  end if;
end $$;
SQL
"${PSQL[@]}" -d postgres -c "grant service_role to cutover_tester;"
"${PSQL[@]}" -d postgres -c "create database ${DB};"

"${PSQL[@]}" -d "${DB}" <<'SQL'
create table public.email_queue (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'))
);
create table public.event_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  inviter_id uuid not null,
  invitee_email text not null,
  invitee_name text,
  message text,
  sent_at timestamptz not null default now()
);
grant usage on schema public to cutover_tester, anon;
SQL

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"${PSQL[@]}" -d "${DB}" -f "${ROOT}/supabase/migrations/20261108183000_email_provider_cutover.sql" >/dev/null

"${PSQL[@]}" -d "${DB}" <<'SQL'
-- Functions are security definer. Direct table reads run as the owner because
-- service_role has no RLS policy; Supabase's service_role bypasses RLS and
-- this local role does not.
set role cutover_tester;
do $$
declare
  outcome jsonb;
begin
  outcome := public.reserve_email_provider_quota('brevo', 'open', 1, 300, null);
  if outcome->>'result' <> 'unknown' then
    raise exception 'missing seed returned %', outcome;
  end if;
  outcome := public.reserve_email_provider_quota('brevo', 'seeded', 1, 300, 12);
  if outcome->>'result' <> 'reserved' or (outcome->>'reserved')::int <> 13 then
    raise exception 'seeded reserve returned %', outcome;
  end if;
  outcome := public.reserve_email_provider_quota('brevo', 'seeded', 1, 300, 0);
  if outcome->>'result' <> 'reserved' or (outcome->>'reserved')::int <> 14 then
    raise exception 'second reserve returned %', outcome;
  end if;
  -- A window that is already full at open stays full. A later seed of 0 does not reopen it.
  outcome := public.reserve_email_provider_quota('brevo', 'full-open', 1, 300, 300);
  if outcome->>'result' <> 'full' or (outcome->>'reserved')::int <> 300 then
    raise exception 'full-open reserve returned %', outcome;
  end if;
  outcome := public.reserve_email_provider_quota('brevo', 'full-open', 1, 300, 0);
  if outcome->>'result' <> 'full' or (outcome->>'reserved')::int <> 300 then
    raise exception 'full-open was reopened: %', outcome;
  end if;
end $$;
reset role;
do $$
declare
  n int;
  reserved int;
begin
  select count(*) into n from public.email_provider_quota where window_key = 'open';
  if n <> 0 then
    raise exception 'missing seed inserted a row';
  end if;
  select reserved_recipients into reserved from public.email_provider_quota where window_key = 'seeded';
  if reserved <> 14 then
    raise exception 'seeded row is %', reserved;
  end if;
  select reserved_recipients into reserved from public.email_provider_quota where window_key = 'full-open';
  if reserved <> 300 then
    raise exception 'full-open row is %', reserved;
  end if;
end $$;
SQL

# Five parallel reservations against a cap of 2. The advisory lock must keep the total at 2.
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; select public.reserve_email_provider_quota('brevo', 'race', 1, 2, 0);" >/dev/null &
done
wait

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  reserved int;
begin
  select reserved_recipients into reserved
  from public.email_provider_quota
  where provider = 'brevo' and window_key = 'race';
  if reserved <> 2 then
    raise exception 'parallel reserve total %, expected 2', reserved;
  end if;
end $$;

set role cutover_tester;
do $$
declare
  outcome jsonb;
  action text;
  phase text;
  http_started boolean;
begin
  -- Pre-HTTP inflight stays retryable after it is stale.
  outcome := public.email_delivery_claim('k1', 'wardsignup', 'magic_link', 'a@example.com', 1, now(), 'magic:wardsignup:a@example.com');
  if outcome->>'action' <> 'send_primary' then
    raise exception 'first claim %', outcome;
  end if;
  reset role;
  update public.email_delivery_attempts
    set updated_at = now() - interval '2 minutes', http_started = false
  where idempotency_key = 'k1';
  set role cutover_tester;
  outcome := public.email_delivery_claim('k1', 'wardsignup', 'magic_link', 'a@example.com', 1, now(), null);
  action := outcome->>'action';
  phase := outcome->'row'->>'phase';
  if action <> 'send_primary' or phase <> 'primary_inflight' then
    raise exception 'stale pre-http claim %', outcome;
  end if;

  -- HTTP-started inflight becomes ambiguous and does not send again.
  perform public.email_delivery_mark_http_started('k1', now() - interval '2 minutes');
  reset role;
  update public.email_delivery_attempts
    set updated_at = now() - interval '2 minutes'
  where idempotency_key = 'k1';
  set role cutover_tester;
  outcome := public.email_delivery_claim('k1', 'wardsignup', 'magic_link', 'a@example.com', 1, now(), null);
  action := outcome->>'action';
  phase := outcome->'row'->>'phase';
  http_started := (outcome->'row'->>'httpStarted')::boolean;
  if action <> 'stop' or phase <> 'primary_ambiguous' or http_started is not true then
    raise exception 'stale http claim %', outcome;
  end if;

  -- Finish failure is visible: a missing key returns false.
  if public.email_delivery_finish('missing', 'primary_rejected', 'auth', 'brevo', null, 'no', null, false, now()) then
    raise exception 'finish of a missing row returned true';
  end if;

  -- Message ids match with or without brackets.
  perform public.email_delivery_claim('k2', 'wardsignup', 'magic_link', 'b@example.com', 1, now(), null);
  if not public.email_delivery_finish('k2', 'primary_accepted', null, 'brevo', '<Abc@Brevo>', null, 'accepted', true, now()) then
    raise exception 'finish did not record';
  end if;
  perform public.apply_email_provider_event('ABC@brevo', null, 'bounced');
  reset role;
  if (select delivery_status from public.email_delivery_attempts where idempotency_key = 'k2') <> 'bounced' then
    raise exception 'normalized message id did not match';
  end if;
  set role cutover_tester;

  -- Receipt is not a second apply. Seen is false, then true.
  if public.email_webhook_event_seen('brevo', 'e1') then
    raise exception 'event was seen before insert';
  end if;
  if not public.record_email_webhook_event('brevo', 'e1') then
    raise exception 'event was not inserted';
  end if;
  if public.record_email_webhook_event('brevo', 'e1') then
    raise exception 'event inserted twice';
  end if;
  if not public.email_webhook_event_seen('brevo', 'e1') then
    raise exception 'event was not seen after insert';
  end if;
end $$;
reset role;

set role cutover_tester;
do $$
declare
  outcome jsonb;
  released text;
  reserved int;
  seed int;
  phx int;
  utc int;
begin
  outcome := public.reserve_email_provider_quota('brevo', 'refund', 1, 300, 12);
  if outcome->>'result' <> 'reserved' or (outcome->>'reserved')::int <> 13 then
    raise exception 'refund reserve %', outcome;
  end if;
  perform public.email_delivery_claim('refund-1', 'wardsignup', 'magic_link', 'a@example.com', 1, now(), null);
  if not public.email_delivery_mark_quota_held('refund-1', true, now()) then
    raise exception 'could not mark held';
  end if;
  -- Releasing more than this attempt reserved still cannot pass the seed.
  released := public.email_delivery_release_held('refund-1', 'brevo', 'refund', 20, now());
  if released <> 'released' then
    raise exception 'first release %', released;
  end if;
  reset role;
  select reserved_recipients, seed_recipients into reserved, seed
  from public.email_provider_quota where window_key = 'refund';
  if reserved <> 12 or seed <> 12 then
    raise exception 'release went under seed: reserved % seed %', reserved, seed;
  end if;
  set role cutover_tester;
  released := public.email_delivery_release_held('refund-1', 'brevo', 'refund', 20, now());
  if released <> 'already_released' then
    raise exception 'replay release %', released;
  end if;
  reset role;
  select reserved_recipients into reserved from public.email_provider_quota where window_key = 'refund';
  if reserved <> 12 then
    raise exception 'replay changed reserved to %', reserved;
  end if;

  -- Existing Resend usage: a full UTC window does not take a Phoenix slot.
  insert into public.action_rate_limit (action, ip_hash, bucket_start, request_count)
  values ('email_resend_daily', 'utc-prior', '2026-11-08 00:00:00+00', 2);
  set role cutover_tester;
  if public.try_consume_resend_pair(
    'utc-prior', '2026-11-08 00:00:00+00', 2,
    'phx-prior', '2026-11-08 07:00:00+00', 100,
    1
  ) <> 'full' then
    raise exception 'full utc window was consumed';
  end if;
  if public.try_consume_resend_pair(
    'utc-bad', '2026-11-08 00:00:00+00', 2,
    'phx-bad', '2026-11-08 07:00:00+00', 100,
    0
  ) <> 'invalid' then
    raise exception 'invalid amount was accepted';
  end if;
  reset role;
  select request_count into phx from public.action_rate_limit
  where action = 'email_resend_phx_day' and ip_hash = 'phx-prior';
  if phx is not null then
    raise exception 'phoenix window moved while utc was full: %', phx;
  end if;
  select request_count into utc from public.action_rate_limit
  where action = 'email_resend_daily' and ip_hash = 'utc-prior';
  if utc <> 2 then
    raise exception 'utc prior usage changed to %', utc;
  end if;
end $$;
reset role;
SQL

# Five parallel Resend pair consumes against a cap of 2. Both windows stop at 2.
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; select public.try_consume_resend_pair('utc-race', '2026-11-08 00:00:00+00', 2, 'phx-race', '2026-11-08 07:00:00+00', 2, 1);" >/dev/null &
done
wait

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  utc int;
  phx int;
begin
  select request_count into utc from public.action_rate_limit
  where action = 'email_resend_daily' and ip_hash = 'utc-race';
  select request_count into phx from public.action_rate_limit
  where action = 'email_resend_phx_day' and ip_hash = 'phx-race';
  if utc <> 2 or phx <> 2 then
    raise exception 'parallel resend pair utc % phx %, expected 2 and 2', utc, phx;
  end if;
end $$;
SQL

"${PSQL[@]}" -d "${DB}" <<'SQL'
-- anon cannot call the quota function or read the table.
do $$
begin
  begin
    execute 'set role anon';
    begin
      perform public.reserve_email_provider_quota('brevo', 'nope', 1, 300, 0);
      raise exception 'anon was allowed to reserve';
    exception
      when insufficient_privilege then
        null;
    end;
    begin
      perform 1 from public.email_provider_quota;
      raise exception 'anon was allowed to read quota';
    exception
      when insufficient_privilege then
        null;
    end;
    reset role;
  end;
end $$;
SQL

"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  taken boolean;
  n int;
  holder text;
begin
  if not public.try_consume_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 1, 'holder-a') then
    raise exception 'owner did not take the slot';
  end if;
  if public.try_consume_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 1, 'holder-b') then
    raise exception 'second holder took an owned slot';
  end if;
  if public.release_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 'holder-b') then
    raise exception 'other holder released the slot';
  end if;
  perform public.release_action_rate_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00');
  if public.try_consume_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 1, 'holder-b') then
    raise exception 'blind release freed the slot';
  end if;
  if not public.release_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 'holder-a') then
    raise exception 'owner release failed';
  end if;
  if public.release_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 'holder-a') then
    raise exception 'repeated release changed the slot';
  end if;
  if not public.try_consume_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 1, 'holder-b') then
    raise exception 'freed slot was not available';
  end if;
  if public.release_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 'holder-a') then
    raise exception 'stale release dropped the new owner';
  end if;
  reset role;
  select request_count, action_rate_limit.holder into n, holder
  from public.action_rate_limit
  where action = 'magic_link_dedupe' and ip_hash = 'slot-a';
  if n <> 1 or holder <> 'holder-b' then
    raise exception 'slot after stale release is % / %', n, holder;
  end if;
  set role cutover_tester;
  taken := public.try_consume_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 1, 'holder-c');
  if taken then
    raise exception 'a third holder consumed the slot';
  end if;
end $$;
reset role;
SQL

# Five concurrent consumes of one dedupe slot. Exactly one wins.
status=0
pids=()
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; select public.try_consume_owned_slot('magic_link_dedupe', 'slot-race', '2026-11-08 18:01:00+00', 1, 'race-$i');" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
if [[ "$status" -ne 0 ]]; then
  echo "owned slot race failed"
  exit 1
fi

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  n int;
  winners int;
begin
  select request_count into n from public.action_rate_limit
  where action = 'magic_link_dedupe' and ip_hash = 'slot-race';
  if n <> 1 then
    raise exception 'parallel owned consumes left count %', n;
  end if;
  select count(*) into winners from public.action_rate_limit
  where action = 'magic_link_dedupe' and ip_hash = 'slot-race' and holder is not null;
  if winners <> 1 then
    raise exception 'parallel owned consumes left no holder';
  end if;
end $$;

set role cutover_tester;
do $$
declare
  created jsonb;
  other jsonb;
  campaign uuid := '11111111-1111-4111-8111-111111111111';
  inviter uuid := '22222222-2222-4222-8222-222222222222';
begin
  created := public.claim_event_invite(campaign, 'teacher@example.com', inviter, 'Ada', null, 'holder-a');
  if created->>'result' <> 'created' then
    raise exception 'event invite was not created: %', created;
  end if;
  other := public.claim_event_invite(campaign, 'teacher@example.com', inviter, 'Ada', null, 'holder-b');
  if other->>'result' <> 'busy' or other->>'id' <> created->>'id' then
    raise exception 'concurrent event invite was not busy: %', other;
  end if;
  if public.finish_event_invite((other->>'id')::uuid, 'holder-b', 'retryable') then
    raise exception 'other holder finished the invite';
  end if;
  if not public.finish_event_invite((created->>'id')::uuid, 'holder-a', 'retryable') then
    raise exception 'retryable finish failed';
  end if;
  other := public.claim_event_invite(campaign, 'teacher@example.com', inviter, 'Ada', null, 'holder-c');
  if other->>'result' <> 'retry' or other->>'id' <> created->>'id' then
    raise exception 'replay did not reuse the invite: %', other;
  end if;
  if not public.finish_event_invite((created->>'id')::uuid, 'holder-c', 'settled') then
    raise exception 'settled finish failed';
  end if;
  if public.finish_event_invite((created->>'id')::uuid, 'holder-c', 'retryable') then
    raise exception 'settled invite was downgraded';
  end if;
  other := public.claim_event_invite(campaign, 'teacher@example.com', inviter, 'Ada', null, 'holder-d');
  if other->>'result' <> 'recent' then
    raise exception 'settled invite was not recent: %', other;
  end if;
end $$;
reset role;

update public.event_invites
  set email_outcome = 'pending',
      email_holder = 'holder-stale',
      email_held_at = now() - interval '5 minutes'
where invitee_email = 'teacher@example.com';

set role cutover_tester;
do $$
declare
  again jsonb;
  campaign uuid := '11111111-1111-4111-8111-111111111111';
  inviter uuid := '22222222-2222-4222-8222-222222222222';
  rows int;
begin
  again := public.claim_event_invite(campaign, 'teacher@example.com', inviter, 'Ada', null, 'holder-e');
  if again->>'result' <> 'retry' then
    raise exception 'stale pending invite was not retryable: %', again;
  end if;
  if not public.finish_event_invite((again->>'id')::uuid, 'holder-e', 'settled') then
    raise exception 'stale finish failed';
  end if;
  reset role;
  update public.event_invites
    set sent_at = now() - interval '25 hours'
  where id = (again->>'id')::uuid;
  set role cutover_tester;
  again := public.claim_event_invite(campaign, 'teacher@example.com', inviter, 'Ada', null, 'holder-f');
  if again->>'result' <> 'created' then
    raise exception 'later invite was not created: %', again;
  end if;
  reset role;
  select count(*) into rows from public.event_invites where lower(invitee_email) = 'teacher@example.com';
  if rows <> 2 then
    raise exception 'later invite row count %', rows;
  end if;
end $$;
reset role;

set role cutover_tester;
do $$
declare
  first text;
  second text;
begin
  first := public.email_operation_acquire('org-member:org:bishop@example.com', 'holder-a', 180);
  if first <> 'go' then
    raise exception 'org lease did not start: %', first;
  end if;
  if not public.email_operation_remember('org-member:org:bishop@example.com', 'holder-a', 'same-link') then
    raise exception 'holder could not store the invite link';
  end if;
  if public.email_operation_recall('org-member:org:bishop@example.com') <> 'same-link' then
    raise exception 'recall did not return the stored link';
  end if;
  if public.email_operation_remember('org-member:org:bishop@example.com', 'holder-b', 'other-link') then
    raise exception 'other holder replaced the stored link';
  end if;
  if public.email_operation_recall('org-member:org:bishop@example.com') <> 'same-link' then
    raise exception 'stored link changed';
  end if;
  if public.email_operation_finish('org-member:org:bishop@example.com', 'holder-b', 'failed') then
    raise exception 'other holder finished the org lease';
  end if;
  second := public.email_operation_acquire('org-member:org:bishop@example.com', 'holder-b', 180);
  if second <> 'busy' then
    raise exception 'second org invite was not busy: %', second;
  end if;
  if not public.email_operation_finish('org-member:org:bishop@example.com', 'holder-a', 'failed') then
    raise exception 'org lease finish failed';
  end if;
  second := public.email_operation_acquire('org-member:org:bishop@example.com', 'holder-c', 30);
  if second <> 'go' then
    raise exception 'failed org lease was not reusable: %', second;
  end if;
end $$;
reset role;

update public.email_operation_lease
  set updated_at = now() - interval '10 minutes'
where scope = 'org-member:org:bishop@example.com';

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:bishop@example.com', 'holder-d', 180);
  if taken <> 'go' then
    raise exception 'stale org lease was not reusable: %', taken;
  end if;
end $$;
reset role;
SQL

"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:delay@example.com', 'holder-a', 180);
  if taken <> 'go' then
    raise exception 'delay lease did not start: %', taken;
  end if;
  if not public.email_operation_remember('org-member:org:delay@example.com', 'holder-a', 'plaintext-one') then
    raise exception 'delay lease did not store the link';
  end if;
  if public.email_operation_remember('org-member:org:delay@example.com', 'holder-a', '') then
    raise exception 'remember cleared the token before finish';
  end if;
  if public.email_operation_recall('org-member:org:delay@example.com') <> 'plaintext-one' then
    raise exception 'token changed before finish';
  end if;
end $$;
reset role;

update public.email_operation_lease
  set updated_at = now() - interval '179 seconds'
where scope = 'org-member:org:delay@example.com';

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:delay@example.com', 'holder-b', 180);
  if taken <> 'busy' then
    raise exception '179s lease was not busy: %', taken;
  end if;
  if public.email_operation_recall('org-member:org:delay@example.com') <> 'plaintext-one' then
    raise exception '179s recall changed the token';
  end if;
end $$;
reset role;

update public.email_operation_lease
  set updated_at = now() - interval '181 seconds'
where scope = 'org-member:org:delay@example.com';

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:delay@example.com', 'holder-b', 180);
  if taken <> 'go' then
    raise exception '181s takeover failed: %', taken;
  end if;
  if public.email_operation_recall('org-member:org:delay@example.com') <> 'plaintext-one' then
    raise exception '181s takeover changed the token';
  end if;
end $$;
reset role;

-- The old crash: token cleared while the lease is still sending.
update public.email_operation_lease
  set token = null, updated_at = now() - interval '181 seconds'
where scope = 'org-member:org:delay@example.com';

set role cutover_tester;
do $$
declare
  taken text;
  saved text;
begin
  saved := public.email_operation_recall('org-member:org:delay@example.com');
  if saved is not null then
    raise exception 'crash recall was %', saved;
  end if;
  taken := public.email_operation_acquire('org-member:org:delay@example.com', 'holder-c', 180);
  if taken <> 'blocked' then
    raise exception 'empty-token takeover was %', taken;
  end if;
end $$;
reset role;

set role cutover_tester;
do $$
declare
  taken text;
  lease_state text;
  saved text;
  blocked boolean;
begin
  taken := public.email_operation_acquire('org-member:org:atomic@example.com', 'holder-a', 180);
  if taken <> 'go' then
    raise exception 'atomic lease did not start: %', taken;
  end if;
  if not public.email_operation_remember('org-member:org:atomic@example.com', 'holder-a', 'plaintext-one') then
    raise exception 'atomic remember failed';
  end if;
  if not public.email_operation_finish('org-member:org:atomic@example.com', 'holder-a', 'ambiguous') then
    raise exception 'ambiguous finish failed';
  end if;
end $$;
reset role;

do $$
declare
  lease_state text;
  saved text;
  blocked boolean;
begin
  select state, token, block_reissue
    into lease_state, saved, blocked
  from public.email_operation_lease
  where scope = 'org-member:org:atomic@example.com';
  if lease_state <> 'settled' or saved is not null or blocked is not true then
    raise exception 'ambiguous finish left state % token % blocked %', lease_state, saved, blocked;
  end if;
end $$;

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:atomic@example.com', 'holder-b', 180);
  if taken <> 'blocked' then
    raise exception 'ambiguous lease was reusable: %', taken;
  end if;
end $$;
reset role;
SQL

status=0
pids=()
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; select public.email_operation_acquire('org-member:org:atomic@example.com', 'later-$i', 180);" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
if [[ "$status" -ne 0 ]]; then
  echo "ambiguous lease race failed"
  exit 1
fi

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  lease_state text;
  saved text;
  blocked boolean;
  lease_holder text;
begin
  select state, token, block_reissue, holder
    into lease_state, saved, blocked, lease_holder
  from public.email_operation_lease
  where scope = 'org-member:org:atomic@example.com';
  if lease_state <> 'settled' or saved is not null or blocked is not true or lease_holder <> 'holder-a' then
    raise exception 'delayed replay took the ambiguous lease: % % % %', lease_state, saved, blocked, lease_holder;
  end if;
end $$;
SQL

status=0
pids=()
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; select public.claim_event_invite('11111111-1111-4111-8111-111111111111'::uuid, 'race@example.com', '22222222-2222-4222-8222-222222222222'::uuid, null, null, 'race-$i');" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
if [[ "$status" -ne 0 ]]; then
  echo "event invite race failed"
  exit 1
fi

status=0
pids=()
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; select public.email_operation_acquire('org-member:org:race@example.com', 'race-$i', 180);" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
if [[ "$status" -ne 0 ]]; then
  echo "org lease race failed"
  exit 1
fi

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  invites int;
  holders int;
  lease_state text;
begin
  select count(*) into invites from public.event_invites where invitee_email = 'race@example.com';
  if invites <> 1 then
    raise exception 'parallel event invites created % rows', invites;
  end if;
  select count(*) into holders from public.email_operation_lease
  where scope = 'org-member:org:race@example.com';
  select state into lease_state from public.email_operation_lease
  where scope = 'org-member:org:race@example.com';
  if holders <> 1 or lease_state <> 'sending' then
    raise exception 'parallel org lease rows % state %', holders, lease_state;
  end if;
end $$;

do $$
begin
  begin
    execute 'set role anon';
    begin
      perform public.try_consume_owned_slot('magic_link_dedupe', 'nope', '2026-11-08 18:00:00+00', 1, 'anon');
      raise exception 'anon consumed an owned slot';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.release_owned_slot('magic_link_dedupe', 'slot-a', '2026-11-08 18:00:00+00', 'holder-b');
      raise exception 'anon released an owned slot';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.claim_event_invite(
        '11111111-1111-4111-8111-111111111111'::uuid, 'nope@example.com',
        '22222222-2222-4222-8222-222222222222'::uuid, null, null, 'anon');
      raise exception 'anon claimed an event invite';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.email_operation_acquire('org-member:org:nope@example.com', 'anon', 180);
      raise exception 'anon acquired an org lease';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.email_operation_recall('org-member:org:bishop@example.com');
      raise exception 'anon recalled an invite link';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.email_operation_lease;
      raise exception 'anon read an org lease';
    exception
      when insufficient_privilege then null;
    end;
    reset role;
  end;
end $$;
SQL

echo "email-cutover postgres proof ok"
