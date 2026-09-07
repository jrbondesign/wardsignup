-- One welcome per normalized email (not only per user_id), so re-linked OAuth / new auth uid
-- does not re-send welcome or re-trigger founder notify for the same inbox.
ALTER TABLE public.welcome_email_sent
  ADD COLUMN IF NOT EXISTS email_lower text;

UPDATE public.welcome_email_sent w
SET email_lower = lower(trim(u.email))
FROM auth.users u
WHERE u.id = w.user_id
  AND u.email IS NOT NULL
  AND (w.email_lower IS NULL OR btrim(w.email_lower) = '');

CREATE UNIQUE INDEX IF NOT EXISTS welcome_email_sent_email_lower_key
  ON public.welcome_email_sent (email_lower)
  WHERE email_lower IS NOT NULL;

COMMENT ON COLUMN public.welcome_email_sent.email_lower IS
  'Lowercased email; unique when set so one welcome per email across auth user ids.';
