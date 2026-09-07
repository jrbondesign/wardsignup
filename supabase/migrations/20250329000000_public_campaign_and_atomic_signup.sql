-- Public-safe campaign metadata (no user_email / created_by) for share links and OG images
CREATE OR REPLACE FUNCTION public.get_public_campaign(campaign_id uuid)
RETURNS TABLE(id uuid, name text, description text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.description
  FROM public.campaigns c
  WHERE c.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign(uuid) TO anon, authenticated;

-- Atomic capacity check + insert (prevents concurrent over-signup)
CREATE OR REPLACE FUNCTION public.create_signup_if_capacity(
  p_session_id uuid,
  p_campaign_id uuid,
  p_member_name text,
  p_member_email text,
  p_member_phone text
)
RETURNS public.signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap int;
  cnt int;
  sess_campaign uuid;
  new_row public.signups;
BEGIN
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

  SELECT COUNT(*)::int INTO cnt FROM public.signups WHERE session_id = p_session_id;
  IF cnt >= cap THEN
    RAISE EXCEPTION 'SESSION_FULL';
  END IF;

  INSERT INTO public.signups (session_id, campaign_id, member_name, member_email, member_phone)
  VALUES (
    p_session_id,
    p_campaign_id,
    p_member_name,
    NULLIF(trim(COALESCE(p_member_email, '')), ''),
    NULLIF(trim(COALESCE(p_member_phone, '')), '')
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_signup_if_capacity(uuid, uuid, text, text, text) TO anon, authenticated;

-- Direct inserts bypassed capacity checks; signups only via RPC
DROP POLICY IF EXISTS "Anyone can insert signups" ON public.signups;
