-- Durable quota, idempotency, and webhook receipts for the gated Brevo cutover.
-- The app does not call these functions until EMAIL_PROVIDER_CUTOVER=brevo.
-- Today's Resend path does not write these tables.
-- Service role only. Brevo's reset clock is not stored; a window id is.

create table if not exists public.email_provider_quota (
  provider text not null check (provider in ('brevo', 'resend')),
  window_key text not null,
  reserved_recipients integer not null default 0 check (reserved_recipients >= 0),
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
      insert into public.email_provider_quota (provider, window_key, reserved_recipients, exhausted)
      values (p_provider, p_window_key, row_reserved, false);
      return jsonb_build_object('result', 'full', 'reserved', row_reserved, 'cap', p_cap);
    end if;
  end if;

  if row_reserved + p_recipients > p_cap then
    return jsonb_build_object('result', 'full', 'reserved', row_reserved, 'cap', p_cap);
  end if;

  insert into public.email_provider_quota (provider, window_key, reserved_recipients, exhausted)
  values (p_provider, p_window_key, row_reserved + p_recipients, false)
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
    set reserved_recipients = greatest(0, reserved_recipients - p_recipients),
        updated_at = now()
  where provider = p_provider and window_key = p_window_key;
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

comment on table public.email_provider_quota is
  'App-side recipient reservations for the gated email cutover. A window does not reset on a timer; Brevo reset time is unconfirmed.';
comment on table public.email_delivery_attempts is
  'One row per idempotency key. Ambiguous or accepted rows block a second provider.';
