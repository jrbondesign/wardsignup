-- Atomic welcome claim: one transaction, reads canonical email from auth.users, survives races.
CREATE OR REPLACE FUNCTION public.try_claim_welcome_email(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF EXISTS (SELECT 1 FROM public.welcome_email_sent WHERE user_id = p_user_id) THEN
    RETURN false;
  END IF;

  IF v_email IS NOT NULL AND length(v_email) > 0 THEN
    IF EXISTS (SELECT 1 FROM public.welcome_email_sent WHERE email_lower = v_email) THEN
      RETURN false;
    END IF;
    INSERT INTO public.welcome_email_sent (user_id, email_lower)
    VALUES (p_user_id, v_email);
  ELSE
    INSERT INTO public.welcome_email_sent (user_id, email_lower)
    VALUES (p_user_id, NULL);
  END IF;

  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.try_claim_welcome_email(uuid) IS
  'Returns true if this request won the welcome-email slot (inserted row). False if already welcomed.';

REVOKE ALL ON FUNCTION public.try_claim_welcome_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_welcome_email(uuid) TO service_role;

-- Atomic founder-notify slot: true = first insert for this email (send founder email).
CREATE OR REPLACE FUNCTION public.try_insert_creator_signup_notification(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := lower(trim(p_email));
  IF v IS NULL OR length(v) = 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.creator_signup_notification_log (email) VALUES (v);
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.try_insert_creator_signup_notification(text) IS
  'Returns true if this email was newly logged (founder should be notified once).';

REVOKE ALL ON FUNCTION public.try_insert_creator_signup_notification(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_insert_creator_signup_notification(text) TO service_role;
