# Incident 2026-10-19: Supabase stall took the site down

**Impact:** ~06:20–14:38 UTC (11:20pm–7:38am Phoenix). Pages hung and timed out; sign-in, magic links, bulk signups, cancel lookups and all crons failed.

## Root cause

The Supabase project (`wqmpllurnofdsfditrpo`) runs on **Nano** compute (~0.5 GB RAM). Memory commitment sat above the commit limit and swap stayed at the RAM ceiling around the clock. Swapping counts as disk IO, so it drained the **Disk IO budget**. Once that ran out, the disk was throttled to its 5 MB/s baseline, and auth, PostgREST and Postgres all stalled together.

The app's own load is tiny (database 0.03 GB, ~9 of 60 connections, negligible query IO). This was memory starvation, not too much data.

## Why the whole site went down

Every page ran through `middleware.ts`, which called `supabase.auth.getUser()` with no timeout. When Supabase stalled, every request waited until Vercel's 25s limit.

## Resolution

- Restarted the Supabase project (clears swap; temporary fix only).
- PR #104: middleware skips Supabase for anonymous visitors, caps `getUser()` at 5s, and stops running on `/ingest`. A future stall makes the site slower instead of taking it down.
- PR #105: unrelated `withUtm` fix for relative `/create` links, found in the same logs.
- **Follow-up:** upgrade Supabase compute from Nano to Small (or at least Micro).

## If it happens again

1. Supabase dashboard → Reports → Database: check swap, memory commitment, IOwait, and any "Disk IO Budget" banner.
2. Vercel runtime errors: look for middleware 25s timeouts and `AuthRetryableFetchError` 504s.
3. Restart the project to recover, then size compute up.
