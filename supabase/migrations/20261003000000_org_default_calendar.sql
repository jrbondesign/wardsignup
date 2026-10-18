-- Add org-level default calendar to google_calendar_connections
-- NOTE: DO NOT APPLY THIS MIGRATION TO PRODUCTION. It is part of PR for review only.

alter table google_calendar_connections
  add column if not exists default_calendar_id text,
  add column if not exists default_calendar_name text;

comment on column google_calendar_connections.default_calendar_id is 'Organization-wide default Google Calendar ID for new events';
comment on column google_calendar_connections.default_calendar_name is 'Display name for the default calendar';

-- Update the safe view to include the new columns
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
    default_calendar_name
  from google_calendar_connections;

grant select on google_calendar_connections_safe to authenticated;
