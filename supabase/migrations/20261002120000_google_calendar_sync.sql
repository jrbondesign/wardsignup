-- Google Calendar sync tables for PR1
-- One row per connected Google account
create table google_calendar_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  organization_id    uuid not null references organizations(id) on delete cascade,
  google_email       text not null,
  refresh_token_enc  text not null,          -- AES-256-GCM, key in env
  scopes             text not null,
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  last_error         text,
  unique (user_id, organization_id, google_email)
);

-- Per-campaign sync settings
create table campaign_calendar_sync (
  campaign_id     uuid primary key references campaigns(id) on delete cascade,
  connection_id   uuid not null references google_calendar_connections(id) on delete cascade,
  calendar_id     text not null,             -- Google calendarId
  calendar_name   text not null,             -- display only
  enabled         boolean not null default true,
  invite_leader   boolean not null default false,
  last_synced_at  timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

-- Link table: which Google event represents which slot
create table calendar_event_links (
  session_id       uuid primary key references sessions(id) on delete cascade,
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  google_event_id  text not null,
  calendar_id      text not null,
  content_hash     text not null,            -- skip PUT when nothing changed
  synced_at        timestamptz not null default now()
);

-- RLS policies
-- google_calendar_connections: readable by owning user (except refresh_token_enc via view)
-- Service role only for writes
alter table google_calendar_connections enable row level security;

create policy "Users can view own connections metadata"
  on google_calendar_connections for select
  using (auth.uid() = user_id);

-- campaign_calendar_sync: readable by org members, writes service-role only
alter table campaign_calendar_sync enable row level security;

create policy "Org members can view campaign calendar sync"
  on campaign_calendar_sync for select
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_calendar_sync.campaign_id
        and public.is_org_member(c.organization_id)
    )
  );

-- calendar_event_links: readable by org members, writes service-role only
alter table calendar_event_links enable row level security;

create policy "Org members can view calendar event links"
  on calendar_event_links for select
  using (
    exists (
      select 1 from campaigns c
      where c.id = calendar_event_links.campaign_id
        and public.is_org_member(c.organization_id)
    )
  );

-- Safe view that excludes refresh_token_enc
create view google_calendar_connections_safe as
  select
    id,
    user_id,
    organization_id,
    google_email,
    scopes,
    created_at,
    revoked_at,
    last_error
  from google_calendar_connections;

-- Grant access to the safe view
grant select on google_calendar_connections_safe to authenticated;
