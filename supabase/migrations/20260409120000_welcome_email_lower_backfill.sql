-- Re-backfill email_lower if any rows were missed (NULL breaks per-email dedupe).
UPDATE public.welcome_email_sent w
SET email_lower = lower(trim(u.email))
FROM auth.users u
WHERE u.id = w.user_id
  AND u.email IS NOT NULL
  AND (w.email_lower IS NULL OR btrim(w.email_lower) = '');
