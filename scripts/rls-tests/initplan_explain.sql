-- Shows the planner now evaluates auth.uid() once per statement (InitPlan)
-- for a policy the migration rewrote.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"a0000000-0000-0000-0000-00000000000a"}', true) \g /dev/null
EXPLAIN (COSTS OFF) SELECT user_id FROM public.organizer_profiles;
ROLLBACK;
