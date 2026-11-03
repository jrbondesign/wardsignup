-- Prints every RLS policy in public and storage, one line each, with the
-- (select auth.x()) wrap normalized back to auth.x(). Used by run_initplan.sh
-- to prove the migration changes nothing but the wrap.
\pset tuples_only on
\pset format unaligned
SELECT regexp_replace(schemaname || '.' || tablename || ' | ' || policyname || ' | ' || permissive || ' | ' || cmd
       || ' | ' || roles::text
       || ' | USING ' || coalesce(regexp_replace(qual, '\( SELECT (auth\.(uid|role|jwt|email)\(\)) AS \w+\)', '\1', 'g'), '-')
       || ' | CHECK ' || coalesce(regexp_replace(with_check, '\( SELECT (auth\.(uid|role|jwt|email)\(\)) AS \w+\)', '\1', 'g'), '-'), '\s+', ' ', 'g')
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;
