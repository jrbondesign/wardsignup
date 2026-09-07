-- Fix capacity check: count signups (registrant rows) not total people including guests.
-- "Capacity" means "how many households/families can sign up" not "how many individual people."
-- This prevents a family with guests from being blocked on an empty slot (e.g. missionary
-- dinners with capacity=1 where 1 registrant + 1 guest was triggering SESSION_FULL).

CREATE OR REPLACE FUNCTION public.create_signup_if_capacity(
  p_session_id  uuid,
  p_campaign_id uuid,
  p_member_name text,
  p_member_email text DEFAULT NULL,
  p_member_phone text DEFAULT NULL,
  p_guest_names jsonb DEFAULT '[]'::jsonb
)
RETURNS public.signups
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cap           int;
  sess_campaign uuid;
  current_count int;
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

  -- Count existing signups (one row = one household/family, guests don't consume extra spots)
  SELECT COUNT(*)::int INTO current_count
  FROM public.signups
  WHERE session_id = p_session_id;

  -- Each new signup takes exactly 1 spot, regardless of how many guests they bring
  IF current_count + 1 > cap THEN
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
