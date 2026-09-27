-- Build-next creator vote: extend feedback_requests to capture what to build
-- next. Independent of the PMF survey — users can vote even if they already
-- submitted feedback. The vote choice is required; additional notes are optional.
-- Idempotent: safe to re-run.

alter table public.feedback_requests
  add column if not exists vote_choice text,
  add column if not exists vote_other_text text,
  add column if not exists vote_additional_notes text,
  add column if not exists vote_submitted_at timestamptz;

-- Whitelisted values for the primary vote choice (guarded so re-runs don't error).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'feedback_requests_vote_choice_check'
  ) then
    alter table public.feedback_requests
      add constraint feedback_requests_vote_choice_check
      check (vote_choice is null or vote_choice in ('photos', 'calendar_sync', 'tithing_sheets', 'something_else'));
  end if;
end $$;

-- Reporting: fast filter/rollup of the vote choice per brand.
create index if not exists feedback_requests_brand_vote_idx
  on public.feedback_requests (brand_id, vote_choice);
