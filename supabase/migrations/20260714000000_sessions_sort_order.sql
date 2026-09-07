-- Add an explicit ordering column to sessions so organizers can drag-reorder
-- classes/slots within a date. Before this, same date+time slots had no stable
-- order (see edit page / public page comments), so display fell back to
-- section-first-appearance + label, and duplicating could reshuffle sections.
--
-- IMPORTANT (multi-brand): this migration must be pushed to EVERY brand's
-- Supabase project (wardsignup, ministrysignup):
--   supabase link --project-ref <ref> && supabase db push

alter table public.sessions
  add column if not exists sort_order integer not null default 0;

-- Backfill each campaign's existing slots in their current display order so the
-- initial order matches what organizers already see.
with ordered as (
  select
    id,
    row_number() over (
      partition by campaign_id
      order by session_date nulls last, day_of_week, "time", created_at, id
    ) - 1 as rn
  from public.sessions
)
update public.sessions s
set sort_order = o.rn
from ordered o
where o.id = s.id;

create index if not exists sessions_campaign_sort_idx
  on public.sessions (campaign_id, sort_order);
