-- Creator feedback survey v2: adopt the Sean Ellis / Superhuman PMF format.
-- Adds a benchmark tap (Q1), a retention-intent tap (Q2), and a "most valuable"
-- open text (Q3). The existing answer_blocker column is reused for the friction
-- question (Q4). answer_next_event is retained for historical rows but no longer
-- written. Idempotent: safe to re-run.

alter table public.feedback_requests
  add column if not exists answer_pmf text,
  add column if not exists answer_retention text,
  add column if not exists answer_value text;

-- Whitelisted values for the two scale questions (guarded so re-runs don't error).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'feedback_requests_answer_pmf_check'
  ) then
    alter table public.feedback_requests
      add constraint feedback_requests_answer_pmf_check
      check (answer_pmf is null or answer_pmf in ('very', 'somewhat', 'not'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'feedback_requests_answer_retention_check'
  ) then
    alter table public.feedback_requests
      add constraint feedback_requests_answer_retention_check
      check (answer_retention is null or answer_retention in ('definitely', 'maybe', 'no'));
  end if;
end $$;

-- Reporting: fast filter/rollup of the PMF benchmark per brand.
create index if not exists feedback_requests_brand_pmf_idx
  on public.feedback_requests (brand_id, answer_pmf);
