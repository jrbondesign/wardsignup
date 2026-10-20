-- Public event page in one round trip (perf, Oct 20 2026).
-- NOTE: DO NOT APPLY TO PRODUCTION until Jonathan gives GO.
-- Idempotent: safe to run more than once. The app falls back to the old
-- three query path when this function is missing, so code can ship first.
--
-- get_public_event_page(campaign_id) returns one jsonb object:
--   event         the get_public_campaign row, unchanged (same columns)
--   sessions      sessions rows for spots / rsvp events ([] for items)
--   signups       signups_public: id, session_id, member_name, signup_note, guest_names
--   items         campaign_items rows for items events ([] otherwise)
--   item_signups  item_signups_public: id, item_id, member_name, custom_label, signup_note, quantity
-- or NULL when the event does not exist.
--
-- Exposure is exactly what the anon key can already read on the public page
-- today, and nothing more:
--   * event comes from get_public_campaign (existing public RPC)
--   * signups come only from the signups_public / item_signups_public views,
--     which null names and notes when show_signups_publicly is off and never
--     carry email, phone or cancel tokens
--   * sessions and campaign_items are publicly readable tables
-- SECURITY INVOKER: the caller's own grants and RLS apply to every read, so
-- this cannot reach anything the caller could not already read directly. The
-- cover image stays on /api/events/[id]/cover because its feature flag is an
-- app side org allowlist the database cannot see.

CREATE OR REPLACE FUNCTION public.get_public_event_page(campaign_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH ev AS (
    SELECT pc.*
    FROM public.get_public_campaign(get_public_event_page.campaign_id) pc
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'event', to_jsonb(ev),
    'sessions', CASE WHEN ev.event_type = 'items' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.session_date ASC NULLS LAST, s.created_at ASC, s.id ASC)
      FROM public.sessions s
      WHERE s.campaign_id = get_public_event_page.campaign_id
    ), '[]'::jsonb) END,
    'signups', CASE WHEN ev.event_type = 'items' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', sp.id,
               'session_id', sp.session_id,
               'member_name', sp.member_name,
               'signup_note', sp.signup_note,
               'guest_names', sp.guest_names
             ) ORDER BY sp.signed_up_at ASC, sp.id ASC)
      FROM public.signups_public sp
      WHERE sp.campaign_id = get_public_event_page.campaign_id
    ), '[]'::jsonb) END,
    'items', CASE WHEN ev.event_type = 'items' THEN COALESCE((
      SELECT jsonb_agg(to_jsonb(ci) ORDER BY ci.sort_order ASC, ci.created_at ASC)
      FROM public.campaign_items ci
      WHERE ci.campaign_id = get_public_event_page.campaign_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'item_signups', CASE WHEN ev.event_type = 'items' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', isp.id,
               'item_id', isp.item_id,
               'member_name', isp.member_name,
               'custom_label', isp.custom_label,
               'signup_note', isp.signup_note,
               'quantity', isp.quantity
             ) ORDER BY isp.signed_up_at ASC, isp.id ASC)
      FROM public.item_signups_public isp
      WHERE isp.campaign_id = get_public_event_page.campaign_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  FROM ev;
$function$;

COMMENT ON FUNCTION public.get_public_event_page(uuid) IS
  'Public event page payload in one call. SECURITY INVOKER; reads only get_public_campaign, sessions, campaign_items, signups_public and item_signups_public.';

-- Supabase default privileges grant EXECUTE to anon and authenticated
-- explicitly, so revoke from every role first, then grant only what the
-- public page needs.
REVOKE ALL ON FUNCTION public.get_public_event_page(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_event_page(uuid) TO anon, authenticated, service_role;
