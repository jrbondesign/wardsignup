# Supabase RLS and RPC review (periodic)

Run this checklist when you change auth, tables, or API routes—or on a quarterly cadence. **RLS and SECURITY DEFINER functions are the real enforcement layer**; the app assumes they match the behaviors below.

## 1. Migrations inventory

Review SQL in [`supabase/migrations/`](../supabase/migrations/) in chronological order. Pay special attention to:

| Area | Migration(s) | What to verify |
|------|----------------|----------------|
| Public event read + atomic signup | `20250329000000_public_campaign_and_atomic_signup.sql` | `get_public_campaign` exposes only safe columns; `create_signup_if_capacity` enforces capacity and campaign match; no direct signup inserts bypassing RPC. |
| Signup rate limit | `20260329120000_signup_rate_limit.sql` | RPC `try_consume_signup_rate` matches [`app/api/signups/route.ts`](../app/api/signups/route.ts) usage. |
| Organizer email / digest | `20260401120000_organizer_email.sql`, `20260402120000_organizer_digest_default_on.sql` | Defaults align with app expectations. |
| Welcome / creator notify | `20260403120000_creator_signup_notification_log.sql`, `20260404120000_welcome_email_sent.sql` | Tables exist in production; service role used only from API routes. |

## 2. RLS policies (dashboard)

In Supabase: **Authentication → Policies** (or SQL editor). Confirm:

- **campaigns**, **sessions**, **signups**, **event_invites**: policies match how the app queries (organizer JWT vs anon vs service role).
- **No unintended public write** on tables that should be RPC-only (e.g. signups only via `create_signup_if_capacity`).

## 3. RPCs vs app code

Cross-check these against [`lib/types.ts`](../lib/types.ts) `Database.Functions` and call sites:

- `get_public_campaign` — [`lib/supabase.ts`](../lib/supabase.ts), public event pages.
- `create_signup_if_capacity` — [`lib/supabase.ts`](../lib/supabase.ts), [`app/api/signups/route.ts`](../app/api/signups/route.ts).
- `try_consume_signup_rate` — [`app/api/signups/route.ts`](../app/api/signups/route.ts).

## 4. Service role usage

Search the repo for `createServiceRoleClient` and `SUPABASE_SERVICE_ROLE_KEY`. Each use should be **server-only**, behind auth or secrets (e.g. cron `CRON_SECRET`), and never exposed to the browser.

## 5. After schema changes

- Regenerate or update [`lib/types.ts`](../lib/types.ts) `Database` types if tables/functions/RPC signatures change.
- Run `npm run build`, `npm test`, and `npm run lint` locally (or rely on [CI](../.github/workflows/ci.yml)).
