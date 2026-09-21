-- SECURITY FIX: Properly fix PII leak with views (replaces broken 20260908130000 migration)
--
-- Problem with 20260908130000 migration:
-- - It blocked ALL anonymous access to signups/item_signups tables
-- - This breaks public event pages which need to read signup counts and names for capacity
-- - Client code still queries base tables directly (will fail after migration)
--
-- Correct solution:
-- - Create public-safe views exposing only non-PII columns
-- - Keep base table policies org-member-only
-- - Client code must use _public views for anonymous access

-- 1. Create view: signups_public - safe columns only (NO email/phone)
-- Uses security_invoker = false so anon can read despite base table RLS
CREATE OR REPLACE VIEW public.signups_public
WITH (security_invoker = false) AS
SELECT
    id,
    session_id,
    campaign_id,
    member_name,
    signup_note,
    guest_names,
    signed_up_at
FROM public.signups;

-- Grant anon + authenticated SELECT on view
GRANT SELECT ON public.signups_public TO anon, authenticated;

-- 2. Create view: item_signups_public - safe columns only (NO email!)
-- Uses security_invoker = false so anon can read despite base table RLS
CREATE OR REPLACE VIEW public.item_signups_public
WITH (security_invoker = false) AS
SELECT
    id,
    item_id,
    campaign_id,
    member_name,
    custom_label,
    signup_note,
    quantity,
    signed_up_at
FROM public.item_signups;

-- Grant anon + authenticated SELECT on view
GRANT SELECT ON public.item_signups_public TO anon, authenticated;

-- Note: Base table policies from 20260908130000 remain (org-member-only).
-- Public event pages will use these views via client code updates.
--
-- Security model:
-- - Views use security_invoker = false (run as view owner, not caller)
-- - This allows anon to read from views despite base table RLS blocking direct access
-- - Views only expose safe columns (no email/phone)
-- - Organizers/admins query base tables directly via org-member RLS (full PII access)
