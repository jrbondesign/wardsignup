-- Add guest_names JSONB column to signups so participants can register family/guests by name.
-- Each element is a guest's name string. Guest count = jsonb_array_length(guest_names).
-- Capacity is now checked against total headcount: 1 (registrant) + guest count.

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS guest_names JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Update the atomic capacity RPC to accept guest names and check headcount instead of signup count.
-- DROP first: the prior migration set NULL defaults for email/phone; CREATE OR REPLACE
-- cannot change parameter defaults. No-op where this migration is already recorded.
DROP FUNCTION IF EXISTS public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_signup_if_capacity(
  p_session_id  uuid,
  p_campaign_id uuid,
  p_member_name text,
  p_member_email text,
  p_member_phone text,
  p_guest_names jsonb DEFAULT '[]'::jsonb
)
RETURNS public.signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap           int;
  sess_campaign uuid;
  current_headcount int;
  new_guests    int;
  new_row       public.signups;
BEGIN
  -- Lock the session row to prevent concurrent over-signup
  SELECT s.capacity, s.campaign_id INTO cap, sess_campaign
  FROM public.sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  IF sess_campaign IS DISTINCT FROM p_campaign_id THEN
    RAISE EXCEPTION 'CAMPAIGN_MISMATCH';
  END IF;

  -- Total people already registered (1 registrant + their guests each)
  SELECT COALESCE(SUM(1 + jsonb_array_length(guest_names)), 0)::int
  INTO current_headcount
  FROM public.signups
  WHERE session_id = p_session_id;

  -- How many people this new signup adds (1 registrant + their guests)
  new_guests := jsonb_array_length(COALESCE(p_guest_names, '[]'::jsonb));

  IF current_headcount + 1 + new_guests > cap THEN
    RAISE EXCEPTION 'SESSION_FULL';
  END IF;

  INSERT INTO public.signups (
    session_id, campaign_id, member_name, member_email, member_phone, guest_names
  )
  VALUES (
    p_session_id,
    p_campaign_id,
    p_member_name,
    NULLIF(trim(COALESCE(p_member_email, '')), ''),
    NULLIF(trim(COALESCE(p_member_phone, '')), ''),
    COALESCE(p_guest_names, '[]'::jsonb)
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text, jsonb) TO anon, authenticated;

-- Keep old 5-arg signature working for any in-flight calls (returns SESSION_FULL if full, same behavior)
-- The new 6-arg version replaces it; old callers without p_guest_names use the DEFAULT '[]'.
-- (PostgreSQL uses the new overload automatically once deployed.)
