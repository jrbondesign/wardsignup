-- Google Calendar connection health: track broken connections so sync never stops silently.
-- NOTE: DO NOT APPLY TO PRODUCTION until Jonathan gives GO. Idempotent: safe to run twice.

alter table google_calendar_connections
  add column if not exists status text not null default 'active',
  add column if not exists broken_at timestamptz,
  add column if not exists broken_reason text,
  add column if not exists broken_notified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'google_calendar_connections_status_check'
  ) then
    alter table google_calendar_connections
      add constraint google_calendar_connections_status_check
      check (status in ('active', 'broken'));
  end if;
end $$;

comment on column google_calendar_connections.status is 'active or broken. broken = Google rejected the refresh token (invalid_grant / revoked / 401 after refresh).';
comment on column google_calendar_connections.broken_at is 'When the connection was first detected as broken (cleared on reconnect).';
comment on column google_calendar_connections.broken_notified_at is 'When creator + founder were emailed for the current breakage (once per breakage).';

-- Backfill: rows already expired by the legacy invalid_grant path become broken,
-- but are marked notified so deploying this does not blast old breakages.
update google_calendar_connections
set status = 'broken',
    broken_at = coalesce(broken_at, revoked_at, now()),
    broken_reason = coalesce(broken_reason, last_error),
    broken_notified_at = coalesce(broken_notified_at, now())
where status = 'active'
  and revoked_at is not null
  and (last_error ilike '%invalid_grant%' or last_error ilike '%invalid grant%' or last_error ilike '%reauthorization needed%');

-- Expose status on the safe view (keep all existing columns).
drop view if exists google_calendar_connections_safe;

create view google_calendar_connections_safe as
  select
    id,
    user_id,
    organization_id,
    google_email,
    scopes,
    created_at,
    revoked_at,
    last_error,
    default_calendar_id,
    default_calendar_name,
    status,
    broken_at
  from google_calendar_connections;

grant select on google_calendar_connections_safe to authenticated;
