# Plan: Google Calendar sync for signups

**Status:** draft for review — nothing implemented.
**Goal:** an organizer (or the event's leader) can connect a Google account,
pick a specific calendar, and have signups for an event appear on that
calendar automatically, with the appointment details (who, when, phone, notes)
visible directly in the calendar entry. Changes and cancellations keep the
calendar in sync.

---

## 1. What exists today that this builds on

| Piece | Where | Reuse |
|---|---|---|
| Google sign-in (Supabase OAuth) | `lib/auth.ts:177`, `app/api/auth/oauth-redirect-to` | Same Google Cloud project, but **not** the same token. Supabase does not persist the provider refresh token, and calendar scope cannot be bolted onto sign-in without forcing everyone through consent. A separate, incremental consent flow is needed. |
| Leader notification with `.ics` attachment | `lib/leader-email.ts`, `lib/ics.ts` | Same data shape (`IcsSession`, campaign timezone, admin link). The Google event body is built from the same inputs. |
| Leader fields on campaign | `campaigns.leader_name`, `leader_email` (migration `20260816120000`) | Leader is an email, **not a user account**. See decision D1. |
| Signup write points | `POST /api/signups`, `POST /api/signups/bulk`, `POST /api/signups/cancel`, `DELETE /api/admin/signups/[id]`, `DELETE /api/sessions/[id]` | Sync hooks go here via `after()`. |
| Session edits from the browser | `app/edit/[id]/page.tsx:1134-1174` writes `sessions` directly to Supabase | **Bypasses every API hook.** Time changes, deletions and reschedules would not reach the calendar unless a reconcile job exists. See §5. |
| Timezone handling | `lib/event-timezone.ts` (`resolveEffectiveEventTimezone`) | Google accepts `dateTime` + `timeZone`; pass the IANA zone directly. |
| Secret-at-rest pattern | `mcp_tokens` (hash only, service-role writes, RLS select own rows) | Refresh tokens must be recoverable, so hashing does not work; use AES-256-GCM with a server env key instead. |
| Cron pinger | `.github/workflows/participant-reminders.yml` (hourly) | Add one more curl for the reconcile endpoint. |
| Fire-and-forget + caps | `consumeEmailKeyRate`, `after()` usage in signup routes | Same posture: calendar failures never fail a signup. |

## 2. Decisions to make before building (please answer these)

**D1. Who connects the account?** The leader today is just an email on the
campaign, not a login. Two options:

- **A. Any org member connects their own Google account and picks a calendar
  (recommended for v1).** The leader sees appointments either because they are
  the one who connected (invite them as an org admin via the existing members
  flow), or because the organizer syncs to a calendar the leader is already
  subscribed to (a shared "Bishopric" calendar). Simple, no new identity
  concept.
- **B. Leader-specific connection.** Email the leader a magic link that lets
  them connect Google without being an org member. New identity surface,
  new token ownership rules. Defer unless A proves insufficient.

**D2. Calendar-event granularity.**

- **One Google event per slot that has at least one signup (recommended).**
  Title: `Tithing Declaration — Smith family`. For a slot with capacity > 1
  the title lists names and the description lists everyone. Upsert on every
  change; delete when the slot empties. Cancellations and reschedules are a
  single update. No event explosion on large events.
- One Google event per signup. Cleaner for capacity-1 appointment events, but
  a 40-person RSVP creates 40 overlapping entries. Could be a per-event mode
  later.

**D3. Invite the leader as an attendee?** Adding `leader_email` as an attendee
on each Google event makes Google send its own invitation emails and makes
the leader's response visible. Useful, but doubles the leader's inbox alongside
the existing `.ics` email. Proposal: off by default, toggle in v2.

**D4. What member details go on the calendar?** Name always. Phone, email,
guest names and note are PII landing in a third-party calendar the leader
controls. Proposal: include them (that is the point of the feature), state it
in the toggle's helper text, and never put them in the event **title** so
shared-calendar viewers with "free/busy" access see nothing.

**D5. Google OAuth app verification.** `calendar.events` is a sensitive scope.
Until the Google Cloud project passes verification, users see an "unverified
app" warning and the app is capped at 100 users. Ship behind a feature flag;
start the verification (privacy policy URL, scope justification, demo video)
in parallel because it takes weeks.

**D6. Scope of event types.** Spots and RSVP events have dated slots. Items
events ("bring rolls") have no time; skip them in v1.

## 3. Data model (one migration)

```sql
-- One row per connected Google account. Token is encrypted; the column is
-- never selected by anon/authenticated (service role only via API routes).
create table google_calendar_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  organization_id    uuid not null references organizations(id) on delete cascade,
  google_email       text not null,
  refresh_token_enc  text not null,          -- AES-256-GCM, key in env
  scopes             text not null,
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  last_error         text,
  unique (user_id, organization_id, google_email)
);

-- Per-campaign sync settings.
create table campaign_calendar_sync (
  campaign_id     uuid primary key references campaigns(id) on delete cascade,
  connection_id   uuid not null references google_calendar_connections(id) on delete cascade,
  calendar_id     text not null,             -- Google calendarId
  calendar_name   text not null,             -- display only
  enabled         boolean not null default true,
  invite_leader   boolean not null default false,
  last_synced_at  timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

-- Link table: which Google event represents which slot. Drives diff/upsert.
create table calendar_event_links (
  session_id       uuid primary key references sessions(id) on delete cascade,
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  google_event_id  text not null,
  calendar_id      text not null,
  content_hash     text not null,            -- skip PUT when nothing changed
  synced_at        timestamptz not null default now()
);
```

RLS: `campaign_calendar_sync` and `calendar_event_links` readable by
`is_org_member(campaign.organization_id)` for status display; writes
service-role only. `google_calendar_connections` readable (all columns except
`refresh_token_enc`, via a view) by the owning user; writes service-role only.

Regenerate `lib/types.ts` after the migration (see review doc §5 step 3).

## 4. OAuth connection flow

```
Settings → Integrations → [Connect Google Calendar]
  → GET /api/integrations/google/connect
      builds Google auth URL: scope=calendar.events calendar.calendarlist.readonly,
      access_type=offline, prompt=consent, include_granted_scopes=true,
      state = signed {user_id, org_id, nonce, return_path}
  → Google consent
  → GET /api/integrations/google/callback?code&state
      verify state (HMAC, 10-min expiry) → exchange code → encrypt refresh_token
      → upsert google_calendar_connections → redirect to settings with toast
GET  /api/integrations/google/calendars      → list calendars (writer/owner role only)
DELETE /api/integrations/google/connections/:id → revoke at Google, set revoked_at,
                                                 disable dependent campaign_calendar_sync rows
```

Implementation notes:
- Use raw `fetch` against `oauth2.googleapis.com/token` and
  `www.googleapis.com/calendar/v3`. No `googleapis` dependency (it is large and
  the surface used is four endpoints).
- Reuse the existing Google Cloud OAuth client; add the new callback URL to
  its authorized redirect URIs. New env: `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET` (may equal the Supabase ones),
  `GOOGLE_TOKEN_ENC_KEY` (32 bytes base64), `NEXT_PUBLIC_FEATURE_GCAL_SYNC=1`.
- Access tokens are short-lived; fetch one per sync run from the refresh
  token, never store it. On `invalid_grant`, mark the connection revoked and
  surface it in settings and on the event page.

## 5. Sync engine

One pure-ish function is the core, and everything else calls it:

```ts
// lib/google-calendar-sync.ts
export async function syncCampaignCalendar(campaignId: string): Promise<SyncResult>
```

Algorithm:
1. Load `campaign_calendar_sync` (skip if missing/disabled/connection revoked).
2. Load campaign, all dated sessions, and their signups (service role).
3. For each session with ≥1 signup, build the desired Google event:
   `summary`, `description` (member list with phone/email/guests/note, event
   URL, admin URL), `start/end` with `timeZone`, `extendedProperties.private
   = {wardsignup_session_id}`, optional `attendees` (D3).
4. Diff against `calendar_event_links` by `content_hash`:
   insert → `POST events`; changed → `PATCH events/{id}`; session now empty
   or deleted → `DELETE events/{id}` and drop the link row.
5. Record `last_synced_at` / `last_error`.

Idempotent and safe to run any number of times. That property is what makes
the browser-direct session writes on the edit page tolerable: they are caught
by the next reconcile instead of needing a hook.

Triggers:
- `after(() => syncCampaignCalendar(id))` in the five API write points listed
  in §1, plus `PATCH /api/events/[id]` when timezone or leader changes.
- Hourly `GET /api/cron/calendar-reconcile` (Bearer `CRON_SECRET`, uses
  `claimCronRun`) that syncs every enabled campaign with a future session.
  Bound each run to ~50 campaigns and stagger the rest to stay well under
  Google quota and the 60-second Actions timeout.
- Manual "Sync now" button on the edit page for immediate feedback.

Guardrails:
- Per-campaign hourly cap via `consumeEmailKeyRate`-style counter to prevent a
  signup burst from hammering the API; the reconcile job catches up.
- Never throw into the signup response. Log and store `last_error`.
- Google 403 `rateLimitExceeded` → exponential backoff, max 3 attempts.

## 6. UI

- **Settings → Organization → "Integrations" card.** Connect button, connected
  account email, "Disconnect", warning banner if revoked. Feature-flagged.
- **Create form, Notifications section** (`components/create/sections/NotificationsSection.tsx`):
  "Sync signups to Google Calendar" toggle. When on, a select of calendars
  (fetched from `/api/integrations/google/calendars`), a "Connect Google
  first" link if none. Shown only for spots/RSVP types.
- **Edit page**, same section (both PATCH demux branches, see review doc §6
  row 7): toggle, calendar select, last-synced status, last error, "Sync now".
- **Admin page** header: small "Synced to Google Calendar · 2 min ago" pill.

Copy needs to say plainly that member names, contact details and notes will be
written to that Google calendar.

## 7. Delivery plan

| PR | Scope | Est. |
|---|---|---|
| 0 | Pre-work from the review doc: `@types/jest`, green tests, CI workflow, regenerate `lib/types.ts`. Not strictly required but every step below adds types and tests. | 0.5 day |
| 1 | Migration; `lib/google-oauth.ts` (auth URL, code exchange, refresh, encrypt/decrypt); connect/callback/calendars/disconnect routes; Settings Integrations card; feature flag. Unit tests for state signing and crypto. | 1.5 days |
| 2 | `lib/google-calendar-sync.ts` with event-body builder + diff; `campaign_calendar_sync` PATCH on `/api/events/[id]`; hooks in the five write points; reconcile cron + Actions curl; create/edit UI. Unit tests for the builder and diff against a fake Calendar client. | 2 days |
| 3 | Polish: "Sync now", admin pill, leader-as-attendee toggle (D3), `invalid_grant` recovery UX, PostHog events (`gcal_connected`, `gcal_sync_enabled`, `gcal_sync_error`). | 1 day |
| — | Google OAuth verification submission (parallel, non-code). | weeks of waiting |

Ship PR 1 and 2 behind `NEXT_PUBLIC_FEATURE_GCAL_SYNC`; enable for your own
ward first and watch `last_error` before turning it on globally.

## 8. Risks

- **Unverified-app screen** until Google verification passes (D5). Mitigation:
  flag + early submission.
- **Edit-page direct writes** can leave the calendar stale for up to an hour.
  Mitigation: reconcile cron + "Sync now"; long-term fix is moving those writes
  behind `/api/sessions` (review doc §5 step 5).
- **Token compromise** would expose one calendar's write access. Mitigation:
  AES-GCM at rest, service-role-only column, revoke on disconnect, minimal
  scopes.
- **PII in a third-party system** (D4). Mitigation: explicit consent copy,
  nothing sensitive in titles, delete Google events when a signup is removed.
- **Duplicate events** if a link row is lost. Mitigation: `extendedProperties`
  tag lets the reconcile find and adopt orphans before creating.

## 9. Out of scope for v1

Items events, two-way sync (edits made in Google flowing back), Outlook or
Apple calendars (the existing `.ics` email covers them), per-signup event mode,
leader-only connections without an account (D1 option B).
