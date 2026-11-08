-- Durable quota, idempotency, and webhook receipts for the gated Brevo cutover.
-- The app does not call these functions until EMAIL_PROVIDER_CUTOVER=brevo.
-- Today's Resend path does not write these tables.
-- Service role only. Brevo's reset clock is not stored; a window id is.

create table if not exists public.email_provider_quota (
  provider text not null check (provider in ('brevo', 'resend')),
  window_key text not null,
  reserved_recipients integer not null default 0 check (reserved_recipients >= 0),
  -- Dashboard usage captured when this window opened, including marketing.
  -- Releases of our own reservations cannot go below it.
  seed_recipients integer not null default 0 check (seed_recipients >= 0),
  exhausted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (provider, window_key)
);

create table if not exists public.email_delivery_attempts (
  idempotency_key text primary key,
  brand_id text not null,
  kind text,
  to_address text not null,
  recipient_count integer not null check (recipient_count > 0 and recipient_count <= 20),
  tag text not null,
  phase text not null check (phase in (
    'primary_inflight', 'primary_accepted', 'primary_ambiguous', 'primary_rejected',
    'fallback_inflight', 'fallback_accepted', 'fallback_ambiguous', 'fallback_rejected'
  )),
  rejection_class text check (rejection_class in ('quota', 'auth', 'rate_limited', 'permanent', 'unknown')),
  provider text check (provider in ('brevo', 'resend')),
  provider_message_id text,
  http_started boolean not null default false,
  quota_held boolean not null default false,
  operation_scope text,
  last_error text,
  delivery_status text check (delivery_status in (
    'accepted', 'deferred', 'delivered', 'bounced', 'complained', 'suppressed'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_delivery_attempts_message_idx
  on public.email_delivery_attempts (provider_message_id)
  where provider_message_id is not null;

create index if not exists email_delivery_attempts_tag_idx
  on public.email_delivery_attempts (tag);

create index if not exists email_delivery_attempts_scope_idx
  on public.email_delivery_attempts (operation_scope, updated_at desc)
  where operation_scope is not null;

create table if not exists public.email_webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'email_queue'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.email_queue drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.email_queue add constraint email_queue_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'ambiguous'));

alter table public.email_provider_quota enable row level security;
alter table public.email_delivery_attempts enable row level security;
alter table public.email_webhook_events enable row level security;

revoke all on public.email_provider_quota from public, anon, authenticated;
revoke all on public.email_delivery_attempts from public, anon, authenticated;
revoke all on public.email_webhook_events from public, anon, authenticated;

grant select, insert, update, delete on public.email_provider_quota to service_role;
grant select, insert, update, delete on public.email_delivery_attempts to service_role;
grant select, insert, update, delete on public.email_webhook_events to service_role;

create or replace function public.reserve_email_provider_quota(
  p_provider text,
  p_window_key text,
  p_recipients integer,
  p_cap integer,
  p_seed integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_reserved integer;
  row_exhausted boolean;
begin
  if p_recipients is null or p_recipients < 1 or p_recipients > 20 then
    return jsonb_build_object('result', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtext('email-quota'), hashtext(p_provider || ':' || p_window_key));

  select reserved_recipients, exhausted
    into row_reserved, row_exhausted
  from public.email_provider_quota
  where provider = p_provider and window_key = p_window_key;

  if found and row_exhausted then
    return jsonb_build_object('result', 'exhausted', 'reserved', row_reserved);
  end if;

  if p_cap is null or p_cap < 1 then
    return jsonb_build_object('result', 'unknown');
  end if;

  if not found then
    -- No row is not "zero used". The seed is dashboard usage, including
    -- marketing and other senders, written in this same transaction.
    if p_seed is null or p_seed < 0 then
      return jsonb_build_object('result', 'unknown');
    end if;
    row_reserved := p_seed;
    if row_reserved + p_recipients > p_cap then
      insert into public.email_provider_quota (
        provider, window_key, reserved_recipients, seed_recipients, exhausted
      ) values (
        p_provider, p_window_key, row_reserved, row_reserved, false
      )
      on conflict (provider, window_key) do nothing;
      return jsonb_build_object('result', 'full', 'reserved', row_reserved, 'cap', p_cap);
    end if;
  end if;

  if row_reserved + p_recipients > p_cap then
    return jsonb_build_object('result', 'full', 'reserved', row_reserved, 'cap', p_cap);
  end if;

  insert into public.email_provider_quota (
    provider, window_key, reserved_recipients, seed_recipients, exhausted
  ) values (
    p_provider, p_window_key, row_reserved + p_recipients, coalesce(p_seed, 0), false
  )
  on conflict (provider, window_key) do update
    set reserved_recipients = excluded.reserved_recipients,
        updated_at = now();

  return jsonb_build_object('result', 'reserved', 'reserved', row_reserved + p_recipients);
end;
$$;

create or replace function public.release_email_provider_quota(
  p_provider text,
  p_window_key text,
  p_recipients integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipients is null or p_recipients < 1 then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('email-quota'), hashtext(p_provider || ':' || p_window_key));
  update public.email_provider_quota
    set reserved_recipients = greatest(seed_recipients, reserved_recipients - p_recipients),
        updated_at = now()
  where provider = p_provider and window_key = p_window_key;
end;
$$;

-- Clears quota_held and refunds this attempt in one transaction.
-- A second call sees the flag clear and does not decrement again.
-- The counter cannot fall below seed_recipients.
create or replace function public.email_delivery_release_held(
  p_key text,
  p_provider text,
  p_window_key text,
  p_recipients integer,
  p_now timestamptz
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  held boolean;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return 'missing';
  end if;
  perform pg_advisory_xact_lock(hashtext('email-delivery'), hashtext(p_key));
  select quota_held into held
  from public.email_delivery_attempts
  where idempotency_key = p_key
  for update;
  if not found then
    return 'missing';
  end if;
  if not held then
    return 'already_released';
  end if;
  if p_recipients is not null and p_recipients > 0 then
    perform pg_advisory_xact_lock(hashtext('email-quota'), hashtext(p_provider || ':' || p_window_key));
    update public.email_provider_quota
      set reserved_recipients = greatest(seed_recipients, reserved_recipients - p_recipients),
          updated_at = p_now
    where provider = p_provider and window_key = p_window_key;
  end if;
  update public.email_delivery_attempts
    set quota_held = false,
        updated_at = p_now
  where idempotency_key = p_key;
  return 'released';
end;
$$;

create or replace function public.exhaust_email_provider_quota(
  p_provider text,
  p_window_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('email-quota'), hashtext(p_provider || ':' || p_window_key));
  insert into public.email_provider_quota (provider, window_key, reserved_recipients, exhausted)
  values (p_provider, p_window_key, 0, true)
  on conflict (provider, window_key) do update
    set exhausted = true,
        updated_at = now();
end;
$$;

create or replace function public.email_delivery_row(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'key', idempotency_key,
    'brandId', brand_id,
    'kind', kind,
    'toAddress', to_address,
    'recipientCount', recipient_count,
    'tag', tag,
    'phase', phase,
    'rejectionClass', rejection_class,
    'provider', provider,
    'messageId', provider_message_id,
    'httpStarted', http_started,
    'quotaHeld', quota_held,
    'lastError', last_error,
    'updatedAt', floor(extract(epoch from updated_at) * 1000),
    'deliveryStatus', delivery_status
  )
  from public.email_delivery_attempts
  where idempotency_key = p_key;
$$;

create or replace function public.email_delivery_claim(
  p_key text,
  p_brand_id text,
  p_kind text,
  p_to_address text,
  p_recipient_count integer,
  p_now timestamptz,
  p_scope text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.email_delivery_attempts%rowtype;
  next_phase text;
  tag text;
begin
  if p_recipient_count is null or p_recipient_count < 1 or p_recipient_count > 20 then
    raise exception 'invalid recipient count';
  end if;
  tag := 'k' || left(regexp_replace(p_key, '[^A-Za-z0-9]', '', 'g'), 40);

  perform pg_advisory_xact_lock(hashtext('email-delivery'), hashtext(p_key));

  select * into rec from public.email_delivery_attempts where idempotency_key = p_key for update;

  if not found then
    insert into public.email_delivery_attempts (
      idempotency_key, brand_id, kind, to_address, recipient_count, tag, phase, operation_scope, updated_at
    ) values (
      p_key, p_brand_id, p_kind, p_to_address, p_recipient_count, tag, 'primary_inflight', nullif(p_scope, ''), p_now
    );
    return jsonb_build_object('action', 'send_primary', 'row', public.email_delivery_row(p_key));
  end if;

  if rec.phase in ('primary_inflight', 'fallback_inflight') then
    if rec.http_started then
      if rec.updated_at <= p_now - interval '60 seconds' then
        next_phase := case when rec.phase = 'primary_inflight' then 'primary_ambiguous' else 'fallback_ambiguous' end;
        update public.email_delivery_attempts
          set phase = next_phase,
              last_error = coalesce(last_error, 'inflight closed as ambiguous'),
              updated_at = p_now
        where idempotency_key = p_key;
      end if;
      return jsonb_build_object('action', 'stop', 'row', public.email_delivery_row(p_key));
    end if;
    update public.email_delivery_attempts
      set updated_at = p_now
    where idempotency_key = p_key;
    return jsonb_build_object(
      'action', case when rec.phase = 'fallback_inflight' then 'send_fallback' else 'send_primary' end,
      'row', public.email_delivery_row(p_key)
    );
  end if;

  if rec.phase = 'primary_rejected' and rec.rejection_class = 'rate_limited' then
    update public.email_delivery_attempts
      set phase = 'primary_inflight', http_started = false, updated_at = p_now
    where idempotency_key = p_key;
    return jsonb_build_object('action', 'send_primary', 'row', public.email_delivery_row(p_key));
  end if;

  if rec.phase = 'primary_rejected' and rec.rejection_class = 'unknown' and not rec.http_started then
    update public.email_delivery_attempts
      set phase = 'primary_inflight', http_started = false, updated_at = p_now
    where idempotency_key = p_key;
    return jsonb_build_object('action', 'send_primary', 'row', public.email_delivery_row(p_key));
  end if;

  if rec.phase = 'primary_rejected' and rec.rejection_class in ('quota', 'auth') then
    update public.email_delivery_attempts
      set phase = 'fallback_inflight', http_started = false, provider = 'resend', updated_at = p_now
    where idempotency_key = p_key;
    return jsonb_build_object('action', 'send_fallback', 'row', public.email_delivery_row(p_key));
  end if;

  if rec.phase = 'fallback_rejected' and rec.rejection_class = 'unknown' and not rec.http_started then
    update public.email_delivery_attempts
      set phase = 'fallback_inflight', http_started = false, provider = 'resend', updated_at = p_now
    where idempotency_key = p_key;
    return jsonb_build_object('action', 'send_fallback', 'row', public.email_delivery_row(p_key));
  end if;

  return jsonb_build_object('action', 'stop', 'row', public.email_delivery_row(p_key));
end;
$$;

create or replace function public.email_delivery_mark_http_started(
  p_key text,
  p_now timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated text;
begin
  update public.email_delivery_attempts
    set http_started = true, updated_at = p_now
  where idempotency_key = p_key
  returning idempotency_key into updated;
  return updated is not null;
end;
$$;

create or replace function public.email_delivery_mark_quota_held(
  p_key text,
  p_held boolean,
  p_now timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated text;
begin
  update public.email_delivery_attempts
    set quota_held = coalesce(p_held, false), updated_at = p_now
  where idempotency_key = p_key
  returning idempotency_key into updated;
  return updated is not null;
end;
$$;

create or replace function public.email_delivery_clear_http(
  p_key text,
  p_now timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated text;
begin
  update public.email_delivery_attempts
    set http_started = false, updated_at = p_now
  where idempotency_key = p_key
    and phase in ('primary_inflight', 'fallback_inflight')
  returning idempotency_key into updated;
  return updated is not null;
end;
$$;

create or replace function public.email_delivery_finish(
  p_key text,
  p_phase text,
  p_rejection_class text,
  p_provider text,
  p_message_id text,
  p_error text,
  p_delivery_status text,
  p_http_started boolean,
  p_now timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  keep_status text;
  updated text;
begin
  select delivery_status into current_status
  from public.email_delivery_attempts
  where idempotency_key = p_key
  for update;

  if not found then
    return false;
  end if;

  keep_status := current_status;
  if p_delivery_status is not null then
    if current_status is null then
      keep_status := p_delivery_status;
    elsif public.email_status_rank(p_delivery_status) > public.email_status_rank(current_status) then
      keep_status := p_delivery_status;
    end if;
  end if;

  update public.email_delivery_attempts
    set phase = p_phase,
        rejection_class = coalesce(p_rejection_class, rejection_class),
        provider = coalesce(p_provider, provider),
        provider_message_id = coalesce(public.normalize_email_message_id(p_message_id), provider_message_id),
        http_started = coalesce(p_http_started, http_started),
        last_error = p_error,
        delivery_status = keep_status,
        updated_at = p_now
  where idempotency_key = p_key
  returning idempotency_key into updated;
  return updated is not null;
end;
$$;

create or replace function public.normalize_email_message_id(p_message_id text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(both '<>' from btrim(coalesce(p_message_id, '')))), '');
$$;

create or replace function public.email_status_rank(p_status text)
returns integer
language sql
immutable
as $$
  select case p_status
    when 'accepted' then 1
    when 'deferred' then 2
    when 'delivered' then 3
    when 'bounced' then 4
    when 'complained' then 4
    when 'suppressed' then 4
    else 0
  end;
$$;

create or replace function public.record_email_webhook_event(
  p_provider text,
  p_event_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted text;
begin
  insert into public.email_webhook_events (provider, event_id)
  values (p_provider, p_event_id)
  on conflict do nothing
  returning event_id into inserted;
  return inserted is not null;
end;
$$;

create or replace function public.forget_email_webhook_event(
  p_provider text,
  p_event_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.email_webhook_events
  where provider = p_provider and event_id = p_event_id;
end;
$$;

create or replace function public.apply_email_provider_event(
  p_message_id text,
  p_tag text,
  p_delivery_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.email_delivery_attempts%rowtype;
  keep_status text;
begin
  if p_delivery_status is null then
    return;
  end if;

  if p_message_id is not null and public.normalize_email_message_id(p_message_id) is not null then
    select * into rec from public.email_delivery_attempts
    where public.normalize_email_message_id(provider_message_id) = public.normalize_email_message_id(p_message_id)
    order by updated_at desc
    limit 1
    for update;
  end if;

  if not found and p_tag is not null then
    select * into rec from public.email_delivery_attempts
    where tag = p_tag
    order by updated_at desc
    limit 1
    for update;
  end if;

  if not found then
    return;
  end if;

  keep_status := rec.delivery_status;
  if rec.delivery_status is null
     or public.email_status_rank(p_delivery_status) > public.email_status_rank(rec.delivery_status) then
    keep_status := p_delivery_status;
  end if;

  update public.email_delivery_attempts
    set delivery_status = keep_status,
        provider_message_id = coalesce(provider_message_id, nullif(trim(p_message_id), '')),
        updated_at = now()
  where idempotency_key = rec.idempotency_key;
end;
$$;

create or replace function public.email_webhook_event_seen(
  p_provider text,
  p_event_id text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.email_webhook_events
    where provider = p_provider and event_id = p_event_id
  );
$$;

create or replace function public.email_delivery_has_recent_uncertainty(
  p_scope text,
  p_within_seconds integer
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.email_delivery_attempts
    where operation_scope = p_scope
      and updated_at > now() - make_interval(secs => greatest(coalesce(p_within_seconds, 0), 0))
      and (
        phase in ('primary_ambiguous', 'fallback_ambiguous')
        or (phase in ('primary_inflight', 'fallback_inflight') and http_started)
      )
  );
$$;

revoke all on function public.reserve_email_provider_quota(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.release_email_provider_quota(text, text, integer) from public, anon, authenticated;
revoke all on function public.exhaust_email_provider_quota(text, text) from public, anon, authenticated;
revoke all on function public.email_delivery_row(text) from public, anon, authenticated;
revoke all on function public.email_delivery_claim(text, text, text, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.email_delivery_mark_http_started(text, timestamptz) from public, anon, authenticated;
revoke all on function public.email_delivery_mark_quota_held(text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.email_delivery_clear_http(text, timestamptz) from public, anon, authenticated;
revoke all on function public.email_delivery_finish(text, text, text, text, text, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.normalize_email_message_id(text) from public, anon, authenticated;
revoke all on function public.email_status_rank(text) from public, anon, authenticated;
revoke all on function public.record_email_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.email_webhook_event_seen(text, text) from public, anon, authenticated;
revoke all on function public.forget_email_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.apply_email_provider_event(text, text, text) from public, anon, authenticated;
revoke all on function public.email_delivery_has_recent_uncertainty(text, integer) from public, anon, authenticated;

-- Both Resend windows move together. A full Arizona bucket does not keep a UTC slot.
create table if not exists public.action_rate_limit (
  action text not null,
  ip_hash text not null,
  bucket_start timestamptz not null,
  request_count int not null default 0,
  holder text,
  primary key (action, ip_hash, bucket_start)
);

alter table public.action_rate_limit add column if not exists holder text;

create or replace function public.try_consume_resend_pair(
  p_utc_hash text,
  p_utc_bucket timestamptz,
  p_utc_max integer,
  p_phx_hash text,
  p_phx_bucket timestamptz,
  p_phx_max integer,
  p_amount integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  utc_count integer;
  phx_count integer;
begin
  if p_amount is null or p_amount < 1 or p_amount > 20 then
    return 'invalid';
  end if;
  if p_utc_max is null or p_utc_max < 1 or p_phx_max is null or p_phx_max < 1 then
    return 'unknown';
  end if;
  perform pg_advisory_xact_lock(hashtext('resend-pair'), hashtext(p_utc_hash || ':' || p_utc_bucket::text));
  select request_count into utc_count
  from public.action_rate_limit
  where action = 'email_resend_daily' and ip_hash = p_utc_hash and bucket_start = p_utc_bucket
  for update;
  if not found then utc_count := 0; end if;
  select request_count into phx_count
  from public.action_rate_limit
  where action = 'email_resend_phx_day' and ip_hash = p_phx_hash and bucket_start = p_phx_bucket
  for update;
  if not found then phx_count := 0; end if;
  if utc_count + p_amount > p_utc_max or phx_count + p_amount > p_phx_max then
    return 'full';
  end if;
  insert into public.action_rate_limit (action, ip_hash, bucket_start, request_count)
  values ('email_resend_daily', p_utc_hash, p_utc_bucket, utc_count + p_amount)
  on conflict (action, ip_hash, bucket_start) do update
    set request_count = excluded.request_count;
  insert into public.action_rate_limit (action, ip_hash, bucket_start, request_count)
  values ('email_resend_phx_day', p_phx_hash, p_phx_bucket, phx_count + p_amount)
  on conflict (action, ip_hash, bucket_start) do update
    set request_count = excluded.request_count;
  return 'reserved';
end;
$$;

-- Retired. A blind decrement can take a slot a later request owns.
-- Callers release with release_owned_slot, which matches the holder.
create or replace function public.release_action_rate_slot(
  p_action text,
  p_ip_hash text,
  p_bucket timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

-- One holder owns the slot. A second release, or another holder's release,
-- does not change the count.
create or replace function public.try_consume_owned_slot(
  p_action text,
  p_ip_hash text,
  p_bucket timestamptz,
  p_max integer,
  p_holder text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  if p_holder is null or length(trim(p_holder)) = 0 or p_max is null or p_max < 1 then
    return false;
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_action || ':' || p_ip_hash),
    hashtext(p_bucket::text)
  );
  select request_count into current_count
  from public.action_rate_limit
  where action = p_action and ip_hash = p_ip_hash and bucket_start = p_bucket
  for update;
  if not found then
    insert into public.action_rate_limit (action, ip_hash, bucket_start, request_count, holder)
    values (p_action, p_ip_hash, p_bucket, 1, p_holder);
    return true;
  end if;
  if current_count >= p_max then
    return false;
  end if;
  update public.action_rate_limit
    set request_count = request_count + 1,
        holder = p_holder
  where action = p_action and ip_hash = p_ip_hash and bucket_start = p_bucket;
  return true;
end;
$$;

create or replace function public.release_owned_slot(
  p_action text,
  p_ip_hash text,
  p_bucket timestamptz,
  p_holder text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_holder is null or length(trim(p_holder)) = 0 then
    return false;
  end if;
  update public.action_rate_limit
    set request_count = request_count - 1,
        holder = null
  where action = p_action
    and ip_hash = p_ip_hash
    and bucket_start = p_bucket
    and holder = p_holder
    and request_count > 0;
  return found;
end;
$$;

-- Same lock as try_consume_action_rate. Returns the new count, or null when full.
create or replace function public.try_consume_action_rate_count(
  p_action text,
  p_ip_hash text,
  p_bucket timestamptz,
  p_max integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  if p_max is null or p_max < 1 then
    return null;
  end if;
  perform pg_advisory_xact_lock(
    hashtext(p_action || ':' || p_ip_hash),
    hashtext(p_bucket::text)
  );
  select request_count into current_count
  from public.action_rate_limit
  where action = p_action and ip_hash = p_ip_hash and bucket_start = p_bucket
  for update;
  if not found then
    insert into public.action_rate_limit (action, ip_hash, bucket_start, request_count)
    values (p_action, p_ip_hash, p_bucket, 1);
    return 1;
  end if;
  if current_count >= p_max then
    return null;
  end if;
  update public.action_rate_limit
    set request_count = request_count + 1
  where action = p_action and ip_hash = p_ip_hash and bucket_start = p_bucket
  returning request_count into current_count;
  return current_count;
end;
$$;

-- One invite row per address and event inside 24 hours. The row id is the
-- operation. A later day is a new row. A retry of the same row is not.
alter table public.event_invites
  add column if not exists email_outcome text,
  add column if not exists email_holder text,
  add column if not exists email_held_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_invites_email_outcome_check'
  ) then
    alter table public.event_invites
      add constraint event_invites_email_outcome_check
      check (email_outcome is null or email_outcome in ('pending', 'retryable', 'settled'));
  end if;
end $$;

create or replace function public.claim_event_invite(
  p_campaign_id uuid,
  p_email text,
  p_inviter_id uuid,
  p_name text,
  p_message text,
  p_holder text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.event_invites%rowtype;
  new_id uuid;
begin
  if p_holder is null or length(trim(p_holder)) = 0
     or p_email is null or length(trim(p_email)) = 0
     or p_campaign_id is null or p_inviter_id is null then
    return jsonb_build_object('result', 'unavailable');
  end if;
  perform pg_advisory_xact_lock(
    hashtext('event-invite'),
    hashtext(p_campaign_id::text || ':' || lower(trim(p_email)))
  );
  select * into rec
  from public.event_invites
  where campaign_id = p_campaign_id
    and lower(invitee_email) = lower(trim(p_email))
    and sent_at > now() - interval '24 hours'
  order by sent_at desc
  limit 1
  for update;
  if found then
    if rec.email_outcome is null
       or rec.email_outcome = 'settled'
       or rec.email_outcome not in ('pending', 'retryable') then
      return jsonb_build_object('result', 'recent', 'id', rec.id);
    end if;
    if rec.email_outcome = 'pending'
       and rec.email_holder is not null
       and rec.email_holder <> p_holder
       and rec.email_held_at is not null
       and rec.email_held_at > now() - interval '90 seconds' then
      return jsonb_build_object('result', 'busy', 'id', rec.id);
    end if;
    update public.event_invites
      set email_outcome = 'pending',
          email_holder = p_holder,
          email_held_at = now()
    where id = rec.id;
    return jsonb_build_object('result', 'retry', 'id', rec.id);
  end if;
  insert into public.event_invites (
    campaign_id, inviter_id, invitee_email, invitee_name, message,
    sent_at, email_outcome, email_holder, email_held_at
  ) values (
    p_campaign_id, p_inviter_id, lower(trim(p_email)),
    nullif(p_name, ''), nullif(p_message, ''),
    now(), 'pending', p_holder, now()
  )
  returning id into new_id;
  return jsonb_build_object('result', 'created', 'id', new_id);
end;
$$;

create or replace function public.finish_event_invite(
  p_id uuid,
  p_holder text,
  p_outcome text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outcome is null or p_outcome not in ('settled', 'retryable') then
    return false;
  end if;
  update public.event_invites
    set email_outcome = p_outcome
  where id = p_id
    and email_holder = p_holder
    and email_outcome is distinct from 'settled';
  return found;
end;
$$;

-- One in-flight org invite per address. A settled or failed lease can be
-- taken again. A fresh sending lease held by someone else is busy.
-- Stale is at least 90s, longer than the 60s pre-HTTP inflight window, so a
-- takeover cannot start a second provider call for an attempt that already
-- reached HTTP.
create table if not exists public.email_operation_lease (
  scope text primary key,
  holder text not null,
  state text not null check (state in ('sending', 'settled', 'failed')),
  token text,
  updated_at timestamptz not null default now()
);

alter table public.email_operation_lease add column if not exists token text;

alter table public.email_operation_lease enable row level security;
revoke all on public.email_operation_lease from public, anon, authenticated;

create or replace function public.email_operation_acquire(
  p_scope text,
  p_holder text,
  p_stale_seconds integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.email_operation_lease%rowtype;
  stale_seconds integer;
begin
  if p_scope is null or length(trim(p_scope)) = 0
     or p_holder is null or length(trim(p_holder)) = 0 then
    return 'invalid';
  end if;
  stale_seconds := p_stale_seconds;
  if stale_seconds is null or stale_seconds < 90 then
    stale_seconds := 180;
  end if;
  perform pg_advisory_xact_lock(hashtext('email-op'), hashtext(p_scope));
  select * into rec from public.email_operation_lease where scope = p_scope for update;
  if not found then
    insert into public.email_operation_lease (scope, holder, state, updated_at)
    values (p_scope, p_holder, 'sending', now());
    return 'go';
  end if;
  if rec.state = 'sending'
     and rec.holder <> p_holder
     and rec.updated_at > now() - make_interval(secs => stale_seconds) then
    return 'busy';
  end if;
  update public.email_operation_lease
    set holder = p_holder, state = 'sending', updated_at = now()
  where scope = p_scope;
  return 'go';
end;
$$;

create or replace function public.email_operation_finish(
  p_scope text,
  p_holder text,
  p_state text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state is null or p_state not in ('settled', 'failed') then
    return false;
  end if;
  update public.email_operation_lease
    set state = p_state, updated_at = now()
  where scope = p_scope
    and holder = p_holder
    and state = 'sending';
  return found;
end;
$$;

-- The accept link stays here, not on organization_members, until the attempt
-- settles. Authenticated callers cannot read this table.
create or replace function public.email_operation_remember(
  p_scope text,
  p_holder text,
  p_token text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.email_operation_lease
    set token = nullif(p_token, '')
  where scope = p_scope and holder = p_holder;
  return found;
end;
$$;

create or replace function public.email_operation_recall(p_scope text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  saved text;
begin
  select token into saved from public.email_operation_lease where scope = p_scope;
  return saved;
end;
$$;

alter table public.email_queue add column if not exists idempotency_key text;

revoke all on function public.email_delivery_release_held(text, text, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.try_consume_resend_pair(text, timestamptz, integer, text, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.release_action_rate_slot(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.try_consume_owned_slot(text, text, timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.release_owned_slot(text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.try_consume_action_rate_count(text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_event_invite(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.finish_event_invite(uuid, text, text) from public, anon, authenticated;
revoke all on function public.email_operation_acquire(text, text, integer) from public, anon, authenticated;
revoke all on function public.email_operation_finish(text, text, text) from public, anon, authenticated;
revoke all on function public.email_operation_remember(text, text, text) from public, anon, authenticated;
revoke all on function public.email_operation_recall(text) from public, anon, authenticated;

grant execute on function public.reserve_email_provider_quota(text, text, integer, integer, integer) to service_role;
grant execute on function public.release_email_provider_quota(text, text, integer) to service_role;
grant execute on function public.exhaust_email_provider_quota(text, text) to service_role;
grant execute on function public.email_delivery_row(text) to service_role;
grant execute on function public.email_delivery_claim(text, text, text, text, integer, timestamptz, text) to service_role;
grant execute on function public.email_delivery_mark_http_started(text, timestamptz) to service_role;
grant execute on function public.email_delivery_mark_quota_held(text, boolean, timestamptz) to service_role;
grant execute on function public.email_delivery_clear_http(text, timestamptz) to service_role;
grant execute on function public.email_delivery_finish(text, text, text, text, text, text, text, boolean, timestamptz) to service_role;
grant execute on function public.normalize_email_message_id(text) to service_role;
grant execute on function public.email_status_rank(text) to service_role;
grant execute on function public.record_email_webhook_event(text, text) to service_role;
grant execute on function public.email_webhook_event_seen(text, text) to service_role;
grant execute on function public.forget_email_webhook_event(text, text) to service_role;
grant execute on function public.apply_email_provider_event(text, text, text) to service_role;
grant execute on function public.email_delivery_has_recent_uncertainty(text, integer) to service_role;
grant execute on function public.email_delivery_release_held(text, text, text, integer, timestamptz) to service_role;
grant execute on function public.try_consume_resend_pair(text, timestamptz, integer, text, timestamptz, integer, integer) to service_role;
grant execute on function public.release_action_rate_slot(text, text, timestamptz) to service_role;
grant execute on function public.try_consume_owned_slot(text, text, timestamptz, integer, text) to service_role;
grant execute on function public.release_owned_slot(text, text, timestamptz, text) to service_role;
grant execute on function public.try_consume_action_rate_count(text, text, timestamptz, integer) to service_role;
grant execute on function public.claim_event_invite(uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.finish_event_invite(uuid, text, text) to service_role;
grant execute on function public.email_operation_acquire(text, text, integer) to service_role;
grant execute on function public.email_operation_finish(text, text, text) to service_role;
grant execute on function public.email_operation_remember(text, text, text) to service_role;
grant execute on function public.email_operation_recall(text) to service_role;

comment on table public.email_provider_quota is
  'App-side recipient reservations for the gated email cutover. A window does not reset on a timer; Brevo reset time is unconfirmed.';
comment on table public.email_delivery_attempts is
  'One row per idempotency key. Ambiguous or accepted rows block a second provider.';
