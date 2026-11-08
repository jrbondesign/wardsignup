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

# Crash after acquire and before any token: recoverable after the stale bound.
# The row stays. One takeover stores one token. The old holder cannot replace it.
"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:pretoken@example.com', 'holder-a', 180);
  if taken <> 'go' then
    raise exception 'pre-token lease did not start: %', taken;
  end if;
  if public.email_operation_mark_http('org-member:org:pretoken@example.com', 'holder-a') then
    raise exception 'HTTP was marked before a token existed';
  end if;
  if public.email_operation_reconcile(
    'org-member:org:pretoken@example.com', 'no-such-key'
  ) <> 'refused' then
    raise exception 'reconcile changed a lease that never contacted the provider';
  end if;
end $$;
reset role;

do $$
declare
  lease_phase text;
  rows int;
begin
  select phase into lease_phase from public.email_operation_lease
  where scope = 'org-member:org:pretoken@example.com';
  select count(*) into rows from public.email_operation_lease
  where scope = 'org-member:org:pretoken@example.com';
  if lease_phase <> 'acquired' or rows <> 1 then
    raise exception 'pre-token phase % rows %', lease_phase, rows;
  end if;
end $$;

update public.email_operation_lease
  set updated_at = now() - interval '179 seconds'
where scope = 'org-member:org:pretoken@example.com';

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:pretoken@example.com', 'holder-b', 180);
  if taken <> 'busy' then
    raise exception '179s pre-token lease was not busy: %', taken;
  end if;
  if public.email_operation_recall('org-member:org:pretoken@example.com') is not null then
    raise exception '179s pre-token lease stored a token';
  end if;
end $$;
reset role;

update public.email_operation_lease
  set updated_at = now() - interval '181 seconds'
where scope = 'org-member:org:pretoken@example.com';

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:pretoken@example.com', 'holder-b', 180);
  if taken <> 'go' then
    raise exception '181s pre-token takeover failed: %', taken;
  end if;
  if not public.email_operation_remember('org-member:org:pretoken@example.com', 'holder-b', 'only-token') then
    raise exception 'pre-token takeover could not store the one token';
  end if;
  if public.email_operation_remember('org-member:org:pretoken@example.com', 'holder-b', 'replacement') then
    raise exception 'holder replaced the stored token';
  end if;
  if public.email_operation_remember('org-member:org:pretoken@example.com', 'holder-a', 'old-token') then
    raise exception 'old holder stored a token after takeover';
  end if;
  if public.email_operation_finish('org-member:org:pretoken@example.com', 'holder-a', 'failed') then
    raise exception 'old holder finished the lease after takeover';
  end if;
  if public.email_operation_recall('org-member:org:pretoken@example.com') <> 'only-token' then
    raise exception 'pre-token recovery did not keep the one token';
  end if;
end $$;
reset role;

do $$
declare
  lease_holder text;
  rows int;
  lease_phase text;
begin
  select holder, phase into lease_holder, lease_phase from public.email_operation_lease
  where scope = 'org-member:org:pretoken@example.com';
  select count(*) into rows from public.email_operation_lease
  where scope = 'org-member:org:pretoken@example.com';
  if lease_holder <> 'holder-b' or lease_phase <> 'token' or rows <> 1 then
    raise exception 'pre-token lease was deleted or retaken: % % %', lease_holder, lease_phase, rows;
  end if;
end $$;
SQL

# Token stored, then HTTP marked, then a failed finish from the wrong holder.
# The token stays. Ambiguous finish is one update. Reconciliation checks the attempt.
"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:http@example.com', 'holder-a', 180);
  if taken <> 'go' then
    raise exception 'http lease did not start: %', taken;
  end if;
  if not public.email_operation_remember('org-member:org:http@example.com', 'holder-a', 'before-http') then
    raise exception 'token was not stored before HTTP';
  end if;
  if not public.email_operation_mark_http('org-member:org:http@example.com', 'holder-a') then
    raise exception 'HTTP was not marked';
  end if;
  if public.email_operation_finish('org-member:org:http@example.com', 'holder-b', 'ambiguous') then
    raise exception 'wrong holder finished an HTTP lease';
  end if;
end $$;
reset role;

do $$
declare
  lease_phase text;
  saved text;
  blocked boolean;
begin
  select phase, token, block_reissue into lease_phase, saved, blocked
  from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  if lease_phase <> 'http' or saved <> 'before-http' or blocked then
    raise exception 'failed finish changed the HTTP lease: % % %', lease_phase, saved, blocked;
  end if;
end $$;

update public.email_operation_lease
  set updated_at = now() - interval '181 seconds'
where scope = 'org-member:org:http@example.com';

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:http@example.com', 'holder-c', 180);
  if taken <> 'go' then
    raise exception 'stale HTTP lease was not resumable: %', taken;
  end if;
  if public.email_operation_recall('org-member:org:http@example.com') <> 'before-http' then
    raise exception 'HTTP takeover replaced the token';
  end if;
  if public.email_operation_remember('org-member:org:http@example.com', 'holder-c', 'second-token') then
    raise exception 'HTTP takeover stored a second token';
  end if;
  if public.email_operation_remember('org-member:org:http@example.com', 'holder-a', 'resumed-token') then
    raise exception 'old HTTP holder replaced the token';
  end if;
end $$;
reset role;

insert into public.email_delivery_attempts (
  idempotency_key, brand_id, kind, to_address, recipient_count, tag, phase,
  http_started, operation_scope, updated_at
) values (
  'org_member_invite/http-one', 'wardsignup', 'org_member_invite', 'http@example.com', 1,
  'khttpones', 'primary_inflight', true, 'org-member:org:http@example.com', now()
);

set role cutover_tester;
do $$
begin
  if public.email_delivery_claim(
    'org_member_invite/http-one', 'wardsignup', 'org_member_invite', 'http@example.com',
    1, now(), 'org-member:org:http@example.com'
  )->>'action' <> 'stop' then
    raise exception 'HTTP-started attempt was sent again';
  end if;
  if public.email_operation_recall('org-member:org:http@example.com') <> 'before-http' then
    raise exception 'claim changed the invite token';
  end if;
  if not public.email_operation_finish('org-member:org:http@example.com', 'holder-c', 'ambiguous') then
    raise exception 'HTTP holder could not finish ambiguous';
  end if;
end $$;
reset role;

do $$
declare
  lease_phase text;
  saved text;
  blocked boolean;
  rows int;
begin
  select phase, token, block_reissue into lease_phase, saved, blocked
  from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  if lease_phase <> 'ambiguous' or saved is not null or blocked is not true then
    raise exception 'ambiguous HTTP finish was not atomic: % % %', lease_phase, saved, blocked;
  end if;
  select count(*) into rows from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  if rows <> 1 then
    raise exception 'ambiguous lease row count %', rows;
  end if;
end $$;

set role cutover_tester;
do $$
declare
  reconciled text;
  taken text;
begin
  reconciled := public.email_operation_reconcile(
    'org-member:org:http@example.com', 'org_member_invite/http-one'
  );
  if reconciled <> 'refused' then
    raise exception 'delete outcome cleared the block: %', reconciled;
  end if;
end $$;
reset role;

update public.email_delivery_attempts
  set phase = 'primary_accepted', delivery_status = 'accepted', provider_message_id = 'msg-accepted'
where idempotency_key = 'org_member_invite/http-one';

set role cutover_tester;
do $$
declare
  reconciled text;
  taken text;
begin
  reconciled := public.email_operation_reconcile(
    'org-member:org:http@example.com', 'org_member_invite/http-one'
  );
  if reconciled <> 'refused' then
    raise exception 'accepted attempt was reconciled: %', reconciled;
  end if;
  taken := public.email_operation_acquire('org-member:org:http@example.com', 'holder-d', 180);
  if taken <> 'blocked' then
    raise exception 'accepted uncertainty was reissued: %', taken;
  end if;
end $$;
reset role;

do $$
declare
  blocked boolean;
  rows int;
begin
  select block_reissue into blocked from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  select count(*) into rows from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  if blocked is not true or rows <> 1 then
    raise exception 'refused reconcile changed the lease: blocked % rows %', blocked, rows;
  end if;
end $$;

update public.email_delivery_attempts
  set phase = 'primary_ambiguous', delivery_status = null, provider_message_id = 'msg-unknown'
where idempotency_key = 'org_member_invite/http-one';

set role cutover_tester;
do $$
declare
  reconciled text;
  taken text;
begin
  reconciled := public.email_operation_reconcile(
    'org-member:org:http@example.com', 'org_member_invite/other'
  );
  if reconciled <> 'refused' then
    raise exception 'missing attempt cleared the block: %', reconciled;
  end if;
  reconciled := public.email_operation_reconcile(
    'org-member:org:http@example.com', 'org_member_invite/http-one'
  );
  if reconciled <> 'refused' then
    raise exception 'message id or HTTP start was treated as not accepted: %', reconciled;
  end if;
  taken := public.email_operation_acquire('org-member:org:http@example.com', 'holder-e', 180);
  if taken <> 'blocked' then
    raise exception 'ambiguous message id was reissued: %', taken;
  end if;
end $$;
reset role;

do $$
declare
  blocked boolean;
  rows int;
  lease_phase text;
  saved text;
begin
  select block_reissue, phase, token into blocked, lease_phase, saved from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  select count(*) into rows from public.email_operation_lease
  where scope = 'org-member:org:http@example.com';
  if blocked is not true or lease_phase <> 'ambiguous' or saved is not null or rows <> 1 then
    raise exception 'refused reconcile changed the ambiguous lease: % % % %', blocked, lease_phase, saved, rows;
  end if;
end $$;
SQL

# Five stale takeovers of a never-initialized lease. Exactly one may store a token.
"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire('org-member:org:stale-race@example.com', 'holder-a', 180);
  if taken <> 'go' then
    raise exception 'stale race lease did not start: %', taken;
  end if;
end $$;
reset role;
update public.email_operation_lease
  set updated_at = now() - interval '181 seconds'
where scope = 'org-member:org:stale-race@example.com';
create table if not exists public.cutover_proof_result (label text, result text);
grant insert on public.cutover_proof_result to cutover_tester;
SQL

status=0
pids=()
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" -c "set role cutover_tester; insert into public.cutover_proof_result (label, result) select 'stale-race', public.email_operation_acquire('org-member:org:stale-race@example.com', 'take-$i', 180);" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid" || status=1
done
if [[ "$status" -ne 0 ]]; then
  echo "stale pre-token takeover race failed"
  exit 1
fi

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  gos int;
  busies int;
  winner text;
  i int;
  rows int;
begin
  select count(*) into gos from public.cutover_proof_result
  where label = 'stale-race' and result = 'go';
  select count(*) into busies from public.cutover_proof_result
  where label = 'stale-race' and result = 'busy';
  if gos <> 1 or busies <> 4 then
    raise exception 'stale takeover go % busy %', gos, busies;
  end if;
  select holder into winner from public.email_operation_lease
  where scope = 'org-member:org:stale-race@example.com';
  if winner is null or winner = 'holder-a' or winner not like 'take-%' then
    raise exception 'stale race winner %', winner;
  end if;
  if not public.email_operation_remember('org-member:org:stale-race@example.com', winner, 'race-token') then
    raise exception 'stale race winner could not store the token';
  end if;
  if public.email_operation_remember('org-member:org:stale-race@example.com', 'holder-a', 'old-token') then
    raise exception 'old holder stored a token after the stale race';
  end if;
  for i in 1..5 loop
    if 'take-' || i is distinct from winner
       and public.email_operation_remember('org-member:org:stale-race@example.com', 'take-' || i, 'other-' || i) then
      raise exception 'stale race loser stored a token';
    end if;
  end loop;
  if public.email_operation_recall('org-member:org:stale-race@example.com') <> 'race-token' then
    raise exception 'stale race did not keep one token';
  end if;
  select count(*) into rows from public.email_operation_lease
  where scope = 'org-member:org:stale-race@example.com';
  if rows <> 1 then
    raise exception 'stale race lease rows %', rows;
  end if;
end $$;
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
      perform public.email_operation_mark_http('org-member:org:bishop@example.com', 'anon');
      raise exception 'anon marked an invite HTTP start';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.email_operation_reconcile('org-member:org:bishop@example.com', 'key');
      raise exception 'anon reconciled an invite lease';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.email_operation_mark_queued('org-member:org:bishop@example.com', 'anon', 'key');
      raise exception 'anon marked an invite queued';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.email_operation_apply_queue_result('key', 'accepted');
      raise exception 'anon applied a queue result';
    exception
      when insufficient_privilege then null;
    end;
    begin
      perform public.email_queue_enqueue(
        'wardsignup', 'notification', 'organizer_report', 'from@example.com', 'to@example.com',
        'subject', '<p>x</p>', null, null, null, now(), 'organizer_report/anon'
      );
      raise exception 'anon enqueued a keyed email';
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

# Queued org invite, strict reconcile, and keyed queue dedupe.
"${PSQL[@]}" -d "${DB}" <<'SQL'
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invited_email text not null,
  invite_last_sent_at timestamptz
);
insert into public.organization_members (organization_id, invited_email)
values ('11111111-1111-4111-8111-111111111111', 'bishop@example.com');

insert into public.email_delivery_attempts (
  idempotency_key, brand_id, kind, to_address, recipient_count, tag, phase,
  http_started, provider_message_id, operation_scope, updated_at
) values (
  'org_member_invite/parked', 'wardsignup', 'org_member_invite', 'bishop@example.com', 1,
  'kparked01', 'primary_rejected', false, null,
  'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', now()
);

set role cutover_tester;
do $$
declare
  taken text;
  marked boolean;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-a', 180
  );
  if taken <> 'go' then
    raise exception 'queued lease did not start: %', taken;
  end if;
  if not public.email_operation_remember(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-a', 'token-parked'
  ) then
    raise exception 'queued lease did not store its token';
  end if;
  if not public.email_operation_mark_http(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-a'
  ) then
    raise exception 'queued lease did not mark HTTP';
  end if;
  marked := public.email_operation_mark_queued(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-b', 'org_member_invite/parked'
  );
  if marked then
    raise exception 'wrong holder marked the lease queued';
  end if;
  if not public.email_operation_mark_queued(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-a', 'org_member_invite/parked'
  ) then
    raise exception 'holder did not mark the lease queued';
  end if;
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-c', 180
  );
  if taken <> 'queued' then
    raise exception 'pending queue minted: %', taken;
  end if;
end $$;
reset role;

do $$
declare
  lease_phase text;
  saved text;
  blocked boolean;
  stamped timestamptz;
begin
  select phase, token, block_reissue into lease_phase, saved, blocked
  from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com';
  if lease_phase <> 'queued' or saved <> 'token-parked' or blocked then
    raise exception 'queued lease was finished as ambiguous: % % %', lease_phase, saved, blocked;
  end if;
  select invite_last_sent_at into stamped
  from public.organization_members
  where invited_email = 'bishop@example.com';
  if stamped is not null then
    raise exception 'queued invite started the cooldown';
  end if;
end $$;

insert into public.email_queue (
  brand_id, category, kind, from_address, to_address, subject, html, send_after, status, idempotency_key
) values (
  'wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>',
  'bishop@example.com', 'Invite', '<p>parked</p>', now(), 'pending', 'org_member_invite/parked'
);

-- Crash after the queue insert and before mark_queued. The token stays and acquire does not mint.
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', 'holder-a', 180
  );
  if taken <> 'go' then
    raise exception 'crash lease did not start: %', taken;
  end if;
  if not public.email_operation_remember(
    'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', 'holder-a', 'token-crash'
  ) then
    raise exception 'crash lease did not store its token';
  end if;
  if not public.email_operation_mark_http(
    'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', 'holder-a'
  ) then
    raise exception 'crash lease did not mark HTTP';
  end if;
end $$;
reset role;
insert into public.email_delivery_attempts (
  idempotency_key, brand_id, kind, to_address, recipient_count, tag, phase,
  http_started, operation_scope, updated_at
) values (
  'org_member_invite/crash', 'wardsignup', 'org_member_invite', 'crash@example.com', 1,
  'kcrash001', 'primary_rejected', false, 'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', now()
);
insert into public.email_queue (
  brand_id, category, kind, from_address, to_address, subject, html, send_after, status, idempotency_key
) values (
  'wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>',
  'crash@example.com', 'Invite', '<p>crash</p>', now(), 'pending', 'org_member_invite/crash'
);
update public.email_operation_lease
  set updated_at = now() - interval '181 seconds'
where scope = 'org-member:11111111-1111-4111-8111-111111111111:crash@example.com';
set role cutover_tester;
do $$
declare
  taken text;
  saved text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', 'holder-b', 180
  );
  if taken <> 'queued' then
    raise exception 'crash before mark minted: %', taken;
  end if;
  saved := public.email_operation_recall('org-member:11111111-1111-4111-8111-111111111111:crash@example.com');
  if saved <> 'token-crash' then
    raise exception 'crash before mark dropped the token: %', saved;
  end if;
end $$;
reset role;

-- Out of order and replay on the parked key.
set role cutover_tester;
do $$
declare
  outcome text;
  taken text;
begin
  outcome := public.email_operation_apply_queue_result('org_member_invite/parked', 'rejected');
  if outcome <> 'rejected' then
    raise exception 'queue rejection was not applied: %', outcome;
  end if;
  outcome := public.email_operation_apply_queue_result('org_member_invite/parked', 'accepted');
  if outcome <> 'accepted' then
    raise exception 'later acceptance did not win: %', outcome;
  end if;
  outcome := public.email_operation_apply_queue_result('org_member_invite/parked', 'rejected');
  if outcome <> 'ignored' then
    raise exception 'late rejection downgraded an acceptance: %', outcome;
  end if;
  outcome := public.email_operation_apply_queue_result('org_member_invite/parked', 'ambiguous');
  if outcome <> 'ignored' then
    raise exception 'late ambiguity downgraded an acceptance: %', outcome;
  end if;
  outcome := public.email_operation_apply_queue_result('org_member_invite/other', 'rejected');
  if outcome <> 'ignored' then
    raise exception 'wrong key changed the lease: %', outcome;
  end if;
end $$;
reset role;
update public.email_queue set status = 'sent' where idempotency_key = 'org_member_invite/parked';
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-d', 180
  );
  if taken <> 'go' then
    raise exception 'accepted queue did not open one reissue: %', taken;
  end if;
  if not public.email_operation_remember(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-d', 'token-reissue'
  ) then
    raise exception 'accepted queue did not store the reissue token';
  end if;
end $$;
reset role;

do $$
declare
  stamped timestamptz;
  saved text;
begin
  select invite_last_sent_at into stamped
  from public.organization_members
  where invited_email = 'bishop@example.com';
  if stamped is null or stamped < now() - interval '5 minutes' then
    raise exception 'accepted queue did not start the cooldown';
  end if;
  select token into saved from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com';
  if saved <> 'token-reissue' then
    raise exception 'reissue token changed: %', saved;
  end if;
end $$;

-- Ambiguous queue stays blocked, including when a missing receipt is offered.
set role cutover_tester;
do $$
declare
  taken text;
  outcome text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'holder-a', 180
  );
  if taken <> 'go' then
    raise exception 'ambiguous queue lease did not start: %', taken;
  end if;
  if not public.email_operation_remember(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'holder-a', 'token-maybe'
  ) then
    raise exception 'ambiguous queue lease did not store its token';
  end if;
  if not public.email_operation_mark_queued(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'holder-a', 'org_member_invite/maybe'
  ) then
    raise exception 'ambiguous queue was not marked';
  end if;
  outcome := public.email_operation_apply_queue_result('org_member_invite/maybe', 'ambiguous');
  if outcome <> 'ambiguous' then
    raise exception 'ambiguous queue result was not applied: %', outcome;
  end if;
  outcome := public.email_operation_apply_queue_result('org_member_invite/maybe', 'rejected');
  if outcome <> 'ignored' then
    raise exception 'rejection cleared an ambiguous queue: %', outcome;
  end if;
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'holder-b', 180
  );
  if taken <> 'blocked' then
    raise exception 'ambiguous queue minted: %', taken;
  end if;
end $$;
reset role;

insert into public.email_delivery_attempts (
  idempotency_key, brand_id, kind, to_address, recipient_count, tag, phase,
  http_started, provider_message_id, operation_scope, updated_at
) values
  (
    'org_member_invite/maybe', 'wardsignup', 'org_member_invite', 'maybe@example.com', 1,
    'kmaybe001', 'primary_ambiguous', true, 'msg-maybe-accepted',
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', now()
  ),
  (
    'org_member_invite/httpstart', 'wardsignup', 'org_member_invite', 'bishop@example.com', 1,
    'khttpsta1', 'primary_inflight', true, null,
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', now()
  ),
  (
    'org_member_invite/wrong', 'wardsignup', 'org_member_invite', 'other@example.com', 1,
    'kwrong001', 'primary_rejected', false, null,
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', now()
  ),
  (
    'org_member_invite/prehttp', 'wardsignup', 'org_member_invite', 'prehttp@example.com', 1,
    'kprehttp1', 'primary_rejected', false, null,
    'org-member:11111111-1111-4111-8111-111111111111:prehttp@example.com', now()
  );

set role cutover_tester;
do $$
declare
  taken text;
  reconciled text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'holder-http', 180
  );
  if taken <> 'busy' and taken <> 'go' then
    raise exception 'http fixture lease unexpected: %', taken;
  end if;
end $$;
reset role;

-- The bishop lease is the reissue, phase token. Build separate ambiguous leases for the refused cases.
update public.email_operation_lease
  set phase = 'ambiguous', state = 'settled', block_reissue = true, token = null, had_token = false
where scope = 'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com';

set role cutover_tester;
do $$
declare
  taken text;
  reconciled text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:prehttp@example.com', 'holder-a', 180
  );
  if taken <> 'go' then
    raise exception 'pre-http lease did not start: %', taken;
  end if;
  if not public.email_operation_finish(
    'org-member:11111111-1111-4111-8111-111111111111:prehttp@example.com', 'holder-a', 'ambiguous'
  ) then
    raise exception 'pre-http lease did not finish ambiguous';
  end if;
  reconciled := public.email_operation_reconcile(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'org_member_invite/maybe'
  );
  if reconciled <> 'refused' then
    raise exception 'message id was cleared: %', reconciled;
  end if;
  reconciled := public.email_operation_reconcile(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'org_member_invite/httpstart'
  );
  if reconciled <> 'refused' then
    raise exception 'HTTP start was cleared: %', reconciled;
  end if;
  reconciled := public.email_operation_reconcile(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'org_member_invite/wrong'
  );
  if reconciled <> 'refused' then
    raise exception 'wrong recipient was cleared: %', reconciled;
  end if;
  reconciled := public.email_operation_reconcile(
    'org-member:11111111-1111-4111-8111-111111111111:bishop@example.com', 'org_member_invite/missing'
  );
  if reconciled <> 'refused' then
    raise exception 'missing receipt was cleared: %', reconciled;
  end if;
  reconciled := public.email_operation_reconcile(
    'org-member:11111111-1111-4111-8111-111111111111:prehttp@example.com', 'org_member_invite/prehttp'
  );
  if reconciled <> 'cleared' then
    raise exception 'pre-HTTP rejection stayed blocked: %', reconciled;
  end if;
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:prehttp@example.com', 'holder-b', 180
  );
  if taken <> 'go' then
    raise exception 'pre-HTTP rejection did not allow one new token: %', taken;
  end if;
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'holder-c', 180
  );
  if taken <> 'blocked' then
    raise exception 'message id was reissued after reconcile: %', taken;
  end if;
end $$;
reset role;

-- Accepted after ambiguous upgrades that one key and opens the reissue.
set role cutover_tester;
do $$
declare
  outcome text;
  taken text;
begin
  outcome := public.email_operation_apply_queue_result('org_member_invite/maybe', 'accepted');
  if outcome <> 'accepted' then
    raise exception 'accepted did not upgrade ambiguous: %', outcome;
  end if;
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:maybe@example.com', 'holder-d', 180
  );
  if taken <> 'go' then
    raise exception 'upgraded acceptance stayed blocked: %', taken;
  end if;
end $$;
reset role;

-- Five accepts of one key leave one settled row. Five same-key enqueues leave one body.
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:race@example.com', 'holder-a', 180
  );
  if taken <> 'go' then
    raise exception 'race lease did not start: %', taken;
  end if;
  if not public.email_operation_remember(
    'org-member:11111111-1111-4111-8111-111111111111:race@example.com', 'holder-a', 'token-race'
  ) then
    raise exception 'race lease did not store its token';
  end if;
  if not public.email_operation_mark_queued(
    'org-member:11111111-1111-4111-8111-111111111111:race@example.com', 'holder-a', 'org_member_invite/race'
  ) then
    raise exception 'race lease was not queued';
  end if;
end $$;
reset role;
SQL

"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  i int;
  outcome text;
begin
  for i in 1..5 loop
    outcome := public.email_operation_apply_queue_result('org_member_invite/race', 'accepted');
    if outcome <> 'accepted' then
      raise exception 'concurrent accept % returned %', i, outcome;
    end if;
  end loop;
end $$;
reset role;
do $$
declare
  rows int;
  lease_phase text;
  blocked boolean;
begin
  select count(*), max(phase), bool_or(block_reissue) into rows, lease_phase, blocked
  from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:race@example.com';
  if rows <> 1 or lease_phase <> 'settled' or blocked then
    raise exception 'concurrent accepts changed the lease: % % %', rows, lease_phase, blocked;
  end if;
end $$;

set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:race2@example.com', 'holder-a', 180
  );
  if taken <> 'go' then
    raise exception 'parallel race lease did not start: %', taken;
  end if;
  if not public.email_operation_remember(
    'org-member:11111111-1111-4111-8111-111111111111:race2@example.com', 'holder-a', 'token-race2'
  ) then
    raise exception 'parallel race lease did not store its token';
  end if;
  if not public.email_operation_mark_queued(
    'org-member:11111111-1111-4111-8111-111111111111:race2@example.com', 'holder-a', 'org_member_invite/race2'
  ) then
    raise exception 'parallel race lease was not queued';
  end if;
end $$;
reset role;
create table public.cutover_enqueue_result (slot int, status text);
grant insert on public.cutover_enqueue_result to cutover_tester;
SQL

for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" <<SQL &
set role cutover_tester;
insert into public.cutover_enqueue_result (slot, status)
select ${i}, public.email_operation_apply_queue_result('org_member_invite/race2', 'accepted');
SQL
done
wait

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  rows int;
  lease_phase text;
  blocked boolean;
  accepted int;
begin
  select count(*), max(phase), bool_or(block_reissue) into rows, lease_phase, blocked
  from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:race2@example.com';
  select count(*) into accepted from public.cutover_enqueue_result
  where slot between 1 and 5 and status = 'accepted';
  if rows <> 1 or lease_phase <> 'settled' or blocked or accepted <> 5 then
    raise exception 'parallel accepts did not settle once: rows % phase % blocked % accepted %', rows, lease_phase, blocked, accepted;
  end if;
end $$;
SQL

for i in 1 2 3 4 5; do
  "${PSQL[@]}" -d "${DB}" <<SQL &
set role cutover_tester;
insert into public.cutover_enqueue_result (slot, status)
select ${i}, public.email_queue_enqueue(
  'wardsignup', 'notification', 'organizer_faster', 'Jonathan <jonathan@wardsignup.com>',
  'organizer@example.com', 'Dinner · Dinner — 1 new signup', '<p>Ada</p>', null, null, null, now(),
  'organizer_faster/same'
);
SQL
done
wait

"${PSQL[@]}" -d "${DB}" <<'SQL'
do $$
declare
  rows int;
  inserted int;
  body text;
begin
  select count(*) into rows from public.email_queue where idempotency_key = 'organizer_faster/same';
  select count(*) into inserted from public.cutover_enqueue_result where status = 'inserted';
  select html into body from public.email_queue where idempotency_key = 'organizer_faster/same';
  if rows <> 1 or inserted <> 1 or body <> '<p>Ada</p>' then
    raise exception 'same key was stored more than once: rows % inserted % body %', rows, inserted, body;
  end if;
end $$;

set role cutover_tester;
do $$
declare
  first text;
  second text;
begin
  first := public.email_queue_enqueue(
    'wardsignup', 'notification', 'organizer_report', 'Jonathan <jonathan@wardsignup.com>',
    'organizer@example.com', 'Dinner · Dinner — your report', '<p>click-1</p>', null, null, null, now(),
    'organizer_report/1'
  );
  second := public.email_queue_enqueue(
    'wardsignup', 'notification', 'organizer_report', 'Jonathan <jonathan@wardsignup.com>',
    'organizer@example.com', 'Dinner · Dinner — your report', '<p>click-2</p>', null, null, null, now(),
    'organizer_report/2'
  );
  if first <> 'inserted' or second <> 'inserted' then
    raise exception 'different keys with one subject were collapsed: % %', first, second;
  end if;
end $$;
reset role;
do $$
declare
  rows int;
begin
  select count(*) into rows from public.email_queue
  where subject = 'Dinner · Dinner — your report';
  if rows <> 2 then
    raise exception 'same subject kept % rows', rows;
  end if;
end $$;

-- The drain wrote sent and died before apply. This request settles and does not mint.
set role cutover_tester;
do $$
begin
  if not public.email_operation_mark_queued(
    'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', 'holder-a', 'org_member_invite/crash'
  ) then
    raise exception 'crash lease could not be marked queued before the heal';
  end if;
end $$;
reset role;
update public.email_queue set status = 'sent' where idempotency_key = 'org_member_invite/crash';
set role cutover_tester;
do $$
declare
  taken text;
begin
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:crash@example.com', 'holder-c', 180
  );
  if taken <> 'settled' then
    raise exception 'sent queue row did not settle without minting: %', taken;
  end if;
end $$;
reset role;
do $$
declare
  lease_phase text;
  saved text;
begin
  select phase, token into lease_phase, saved from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:crash@example.com';
  if lease_phase <> 'settled' or saved is not null then
    raise exception 'healed lease minted or stayed queued: % %', lease_phase, saved;
  end if;
end $$;
SQL

# A failed or skipped queue row follows the delivery attempt. It does not mint
# over an acceptance, a message id, or an unfinished HTTP start. A classified
# decline and a pre-HTTP failure still open one link.
"${PSQL[@]}" -d "${DB}" <<'SQL'
insert into public.organization_members (organization_id, invited_email) values
  ('11111111-1111-4111-8111-111111111111', 'capok@example.com'),
  ('11111111-1111-4111-8111-111111111111', 'caphttp@example.com');

insert into public.email_delivery_attempts (
  idempotency_key, brand_id, kind, to_address, recipient_count, tag, phase,
  rejection_class, http_started, provider_message_id, delivery_status, operation_scope, updated_at
) values
  (
    'org_member_invite/capok', 'wardsignup', 'org_member_invite', 'capok@example.com', 1,
    'kcapok001', 'primary_accepted', null, true, 'msg-accepted', 'accepted',
    'org-member:11111111-1111-4111-8111-111111111111:capok@example.com', now()
  ),
  (
    'org_member_invite/caphttp', 'wardsignup', 'org_member_invite', 'caphttp@example.com', 1,
    'kcaphttp1', 'primary_inflight', null, true, null, null,
    'org-member:11111111-1111-4111-8111-111111111111:caphttp@example.com', now()
  ),
  (
    'org_member_invite/capmsg', 'wardsignup', 'org_member_invite', 'capmsg@example.com', 1,
    'kcapmsg01', 'primary_rejected', null, true, 'msg-maybe', null,
    'org-member:11111111-1111-4111-8111-111111111111:capmsg@example.com', now()
  ),
  (
    'org_member_invite/cappre', 'wardsignup', 'org_member_invite', 'cappre@example.com', 1,
    'kcappre01', 'primary_rejected', null, false, null, null,
    'org-member:11111111-1111-4111-8111-111111111111:cappre@example.com', now()
  ),
  (
    'org_member_invite/capskip', 'wardsignup', 'org_member_invite', 'capskip@example.com', 1,
    'kcapskip1', 'primary_ambiguous', null, false, null, null,
    'org-member:11111111-1111-4111-8111-111111111111:capskip@example.com', now()
  ),
  (
    'org_member_invite/capopen', 'wardsignup', 'org_member_invite', 'capopen@example.com', 1,
    'kcapopen1', 'primary_inflight', null, false, null, null,
    'org-member:11111111-1111-4111-8111-111111111111:capopen@example.com', now()
  ),
  (
    'org_member_invite/capterm', 'wardsignup', 'org_member_invite', 'capterm@example.com', 1,
    'kcapterm1', 'primary_rejected', 'permanent', true, null, null,
    'org-member:11111111-1111-4111-8111-111111111111:capterm@example.com', now()
  ),
  (
    'org_member_invite/capbare', 'wardsignup', 'org_member_invite', 'capbare@example.com', 1,
    'kcapbare1', 'primary_rejected', null, true, null, null,
    'org-member:11111111-1111-4111-8111-111111111111:capbare@example.com', now()
  ),
  (
    'org_member_invite/capskipok', 'wardsignup', 'org_member_invite', 'capskipok@example.com', 1,
    'kcapskok1', 'primary_accepted', null, true, 'msg-skipped', 'accepted',
    'org-member:11111111-1111-4111-8111-111111111111:capskipok@example.com', now()
  );

insert into public.email_queue (
  brand_id, category, kind, from_address, to_address, subject, html, send_after, status, attempts, idempotency_key
) values
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capok@example.com', 'Invite', '<p>ok</p>', now(), 'failed', 3, 'org_member_invite/capok'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'caphttp@example.com', 'Invite', '<p>http</p>', now(), 'failed', 3, 'org_member_invite/caphttp'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capmsg@example.com', 'Invite', '<p>msg</p>', now(), 'failed', 3, 'org_member_invite/capmsg'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'cappre@example.com', 'Invite', '<p>pre</p>', now(), 'failed', 3, 'org_member_invite/cappre'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capskip@example.com', 'Invite', '<p>skip</p>', now(), 'skipped', 3, 'org_member_invite/capskip'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capopen@example.com', 'Invite', '<p>open</p>', now(), 'sending', 2, 'org_member_invite/capopen'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capterm@example.com', 'Invite', '<p>term</p>', now(), 'failed', 3, 'org_member_invite/capterm'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capbare@example.com', 'Invite', '<p>bare</p>', now(), 'failed', 3, 'org_member_invite/capbare'),
  ('wardsignup', 'notification', 'org_member_invite', 'Jonathan <jonathan@wardsignup.com>', 'capskipok@example.com', 'Invite', '<p>skipok</p>', now(), 'skipped', 1, 'org_member_invite/capskipok');
SQL

"${PSQL[@]}" -d "${DB}" <<'SQL'
set role cutover_tester;
do $$
declare
  email text;
  scope text;
  taken text;
begin
  foreach email in array array['capok@example.com', 'caphttp@example.com', 'capmsg@example.com', 'cappre@example.com', 'capskip@example.com', 'capopen@example.com', 'capterm@example.com', 'capbare@example.com', 'capskipok@example.com']
  loop
    scope := 'org-member:11111111-1111-4111-8111-111111111111:' || email;
    taken := public.email_operation_acquire(scope, 'holder-a', 180);
    if taken <> 'go' then
      raise exception '% lease did not start: %', email, taken;
    end if;
    if not public.email_operation_remember(scope, 'holder-a', 'token-' || email) then
      raise exception '% lease did not store its token', email;
    end if;
    if not public.email_operation_mark_queued(scope, 'holder-a', 'org_member_invite/' || split_part(email, '@', 1)) then
      raise exception '% lease was not queued', email;
    end if;
  end loop;
end $$;
reset role;

set role cutover_tester;
do $$
declare
  scope text := 'org-member:11111111-1111-4111-8111-111111111111:capok@example.com';
  taken text;
  late text;
begin
  taken := public.email_operation_acquire(scope, 'holder-b', 180);
  if taken <> 'settled' then
    raise exception 'failed queue with an accepted attempt minted: %', taken;
  end if;
  if public.email_operation_remember(scope, 'holder-b', 'brand-new-token') then
    raise exception 'same acquire stored a new token over an acceptance';
  end if;
  late := public.email_operation_apply_queue_result('org_member_invite/capok', 'rejected');
  if late <> 'ignored' and late <> 'accepted' then
    raise exception 'late rejection downgraded an acceptance: %', late;
  end if;
  taken := public.email_operation_acquire(scope, 'holder-c', 180);
  if taken <> 'go' then
    raise exception 'proven acceptance did not open one later reissue: %', taken;
  end if;
  if not public.email_operation_remember(scope, 'holder-c', 'token-reissue') then
    raise exception 'later reissue did not store one token';
  end if;
end $$;
reset role;

do $$
declare
  lease_phase text;
  blocked boolean;
  saved text;
  stamped timestamptz;
begin
  select phase, block_reissue, token into lease_phase, blocked, saved
  from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:capok@example.com';
  if lease_phase <> 'token' or blocked or saved <> 'token-reissue' then
    raise exception 'reissue after acceptance was not one token: % % %', lease_phase, blocked, saved;
  end if;
  select invite_last_sent_at into stamped from public.organization_members
  where invited_email = 'capok@example.com';
  if stamped is null then
    raise exception 'accepted queue failure did not start the cooldown';
  end if;
end $$;

set role cutover_tester;
do $$
declare
  http_scope text := 'org-member:11111111-1111-4111-8111-111111111111:caphttp@example.com';
  msg_scope text := 'org-member:11111111-1111-4111-8111-111111111111:capmsg@example.com';
  skip_scope text := 'org-member:11111111-1111-4111-8111-111111111111:capskip@example.com';
  pre_scope text := 'org-member:11111111-1111-4111-8111-111111111111:cappre@example.com';
  open_scope text := 'org-member:11111111-1111-4111-8111-111111111111:capopen@example.com';
  term_scope text := 'org-member:11111111-1111-4111-8111-111111111111:capterm@example.com';
  bare_scope text := 'org-member:11111111-1111-4111-8111-111111111111:capbare@example.com';
  skipok_scope text := 'org-member:11111111-1111-4111-8111-111111111111:capskipok@example.com';
  taken text;
  saved text;
  late text;
begin
  taken := public.email_operation_acquire(http_scope, 'holder-b', 180);
  if taken <> 'blocked' then
    raise exception 'failed queue with HTTP started minted: %', taken;
  end if;
  if public.email_operation_remember(http_scope, 'holder-b', 'brand-new-token') then
    raise exception 'HTTP-started failure stored a new token';
  end if;
  taken := public.email_operation_acquire(http_scope, 'holder-c', 180);
  if taken <> 'blocked' then
    raise exception 'HTTP-started failure opened a later mint: %', taken;
  end if;
  late := public.email_operation_apply_queue_result('org_member_invite/caphttp', 'rejected');
  if late <> 'ignored' then
    raise exception 'late rejection cleared an HTTP-started block: %', late;
  end if;
  taken := public.email_operation_acquire(msg_scope, 'holder-b', 180);
  if taken <> 'blocked' then
    raise exception 'failed queue with a message id minted: %', taken;
  end if;
  taken := public.email_operation_acquire(skip_scope, 'holder-b', 180);
  if taken <> 'blocked' then
    raise exception 'skipped ambiguous queue minted: %', taken;
  end if;
  late := public.email_operation_apply_queue_result('org_member_invite/capskip', 'rejected');
  if late <> 'ignored' then
    raise exception 'late rejection cleared a skipped ambiguous block: %', late;
  end if;
  taken := public.email_operation_acquire(skip_scope, 'holder-c', 180);
  if taken <> 'blocked' then
    raise exception 'skipped ambiguous queue opened a later mint: %', taken;
  end if;
  taken := public.email_operation_acquire(skipok_scope, 'holder-b', 180);
  if taken <> 'settled' then
    raise exception 'skipped queue with an accepted attempt minted: %', taken;
  end if;
  if public.email_operation_remember(skipok_scope, 'holder-b', 'brand-new-token') then
    raise exception 'skipped acceptance stored a new token';
  end if;
  taken := public.email_operation_acquire(term_scope, 'holder-b', 180);
  if taken <> 'go' then
    raise exception 'classified decline did not allow one new token: %', taken;
  end if;
  if not public.email_operation_remember(term_scope, 'holder-b', 'token-after-terminal') then
    raise exception 'classified decline did not store one token';
  end if;
  taken := public.email_operation_acquire(bare_scope, 'holder-b', 180);
  if taken <> 'blocked' then
    raise exception 'unclassified HTTP rejection minted: %', taken;
  end if;
  if public.email_operation_remember(bare_scope, 'holder-b', 'brand-new-token') then
    raise exception 'unclassified HTTP rejection stored a new token';
  end if;
  taken := public.email_operation_acquire(open_scope, 'holder-b', 180);
  if taken <> 'queued' then
    raise exception 'under-cap sending row minted: %', taken;
  end if;
  saved := public.email_operation_recall(open_scope);
  if saved <> 'token-capopen@example.com' then
    raise exception 'under-cap row dropped its token: %', saved;
  end if;
  taken := public.email_operation_acquire(pre_scope, 'holder-b', 180);
  if taken <> 'go' then
    raise exception 'pre-HTTP failure did not allow one new token: %', taken;
  end if;
  if not public.email_operation_remember(pre_scope, 'holder-b', 'token-after-prehttp') then
    raise exception 'pre-HTTP failure did not store one token';
  end if;
end $$;
reset role;

do $$
declare
  blocked boolean;
  lease_phase text;
  stamped timestamptz;
begin
  select phase, block_reissue into lease_phase, blocked
  from public.email_operation_lease
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:caphttp@example.com';
  if lease_phase <> 'ambiguous' or blocked is not true then
    raise exception 'HTTP-started failure was not blocked: % %', lease_phase, blocked;
  end if;
  select invite_last_sent_at into stamped from public.organization_members
  where invited_email = 'caphttp@example.com';
  if stamped is not null then
    raise exception 'HTTP uncertainty started the cooldown';
  end if;
end $$;

-- A later acceptance on a blocked row upgrades it. A rejection does not.
update public.email_delivery_attempts
  set phase = 'primary_accepted', delivery_status = 'accepted', provider_message_id = 'msg-late'
where idempotency_key = 'org_member_invite/capbare';
set role cutover_tester;
do $$
declare
  late text;
  taken text;
begin
  late := public.email_operation_apply_queue_result('org_member_invite/capbare', 'rejected');
  if late <> 'accepted' then
    raise exception 'late acceptance stayed blocked: %', late;
  end if;
  taken := public.email_operation_acquire(
    'org-member:11111111-1111-4111-8111-111111111111:capbare@example.com', 'holder-d', 180
  );
  if taken <> 'go' then
    raise exception 'upgraded acceptance did not open one later reissue: %', taken;
  end if;
end $$;
reset role;
SQL

# An older draft of this file created the phase check without queued. Re-applying
# the current constraint replace must widen it. Null-key queue rows stay.
"${PSQL[@]}" -d "${DB}" <<'SQL'
insert into public.email_queue (status, idempotency_key)
values ('pending', null), ('ambiguous', null);
update public.email_operation_lease set phase = 'settled' where phase = 'queued';
alter table public.email_operation_lease drop constraint email_operation_lease_phase_check;
alter table public.email_operation_lease
  add constraint email_operation_lease_phase_check
  check (phase in ('acquired', 'token', 'http', 'settled', 'ambiguous', 'failed'));
alter table public.email_operation_lease drop constraint if exists email_operation_lease_phase_check;
alter table public.email_operation_lease
  add constraint email_operation_lease_phase_check
  check (phase in ('acquired', 'token', 'http', 'queued', 'settled', 'ambiguous', 'failed'));
do $$
declare
  null_rows int;
begin
  update public.email_operation_lease
    set phase = 'queued'
  where scope = 'org-member:11111111-1111-4111-8111-111111111111:capopen@example.com';
  if not found then
    raise exception 'widened phase check rejected queued';
  end if;
  select count(*) into null_rows from public.email_queue where idempotency_key is null;
  if null_rows <> 2 then
    raise exception 'null-key queue rows were not kept: %', null_rows;
  end if;
end $$;
SQL

echo "email-cutover postgres proof ok"
