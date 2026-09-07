-- One organizer profile row per (user, brand): same email/login can use Ward + Ministry independently.

-- 1) organizer_profiles: composite primary key
ALTER TABLE public.organizer_profiles
  DROP CONSTRAINT organizer_profiles_pkey;

ALTER TABLE public.organizer_profiles
  ADD PRIMARY KEY (user_id, brand_id);

-- 2) welcome_email_sent: one welcome per user per brand (not globally per email alone)
ALTER TABLE public.welcome_email_sent
  ADD COLUMN IF NOT EXISTS brand_id text NOT NULL DEFAULT 'wardsignup';

UPDATE public.welcome_email_sent SET brand_id = 'wardsignup' WHERE brand_id IS NULL;

ALTER TABLE public.welcome_email_sent DROP CONSTRAINT welcome_email_sent_pkey;

DROP INDEX IF EXISTS public.welcome_email_sent_email_lower_key;

ALTER TABLE public.welcome_email_sent
  ADD PRIMARY KEY (user_id, brand_id);

CREATE UNIQUE INDEX IF NOT EXISTS welcome_email_sent_email_lower_brand_key
  ON public.welcome_email_sent (email_lower, brand_id)
  WHERE email_lower IS NOT NULL;

-- 3) RPC: claim welcome slot per brand
DROP FUNCTION IF EXISTS public.try_claim_welcome_email(uuid);

CREATE OR REPLACE FUNCTION public.try_claim_welcome_email(p_user_id uuid, p_brand_id text)
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

  IF EXISTS (
    SELECT 1 FROM public.welcome_email_sent
    WHERE user_id = p_user_id AND brand_id = p_brand_id
  ) THEN
    RETURN false;
  END IF;

  IF v_email IS NOT NULL AND length(v_email) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.welcome_email_sent
      WHERE email_lower = v_email AND brand_id = p_brand_id
    ) THEN
      RETURN false;
    END IF;
    INSERT INTO public.welcome_email_sent (user_id, email_lower, brand_id)
    VALUES (p_user_id, v_email, p_brand_id);
  ELSE
    INSERT INTO public.welcome_email_sent (user_id, email_lower, brand_id)
    VALUES (p_user_id, NULL, p_brand_id);
  END IF;

  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.try_claim_welcome_email(uuid, text) IS
  'Returns true if this request won the welcome-email slot for this brand.';

REVOKE ALL ON FUNCTION public.try_claim_welcome_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_welcome_email(uuid, text) TO service_role;
