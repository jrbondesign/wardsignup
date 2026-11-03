-- Lists policies that still call auth.uid()/role()/jwt()/email() without the
-- (select ...) wrap. Must print nothing after the initplan migration.
\pset tuples_only on
\pset format unaligned
SELECT schemaname || '.' || tablename || ' | ' || policyname
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                     '\( SELECT auth\.(uid|role|jwt|email)\(\) AS \w+\)', '', 'g') ~ 'auth\.(uid|role|jwt|email)\(\)'
ORDER BY 1;
