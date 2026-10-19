# Time zones

WardSignup runs on **Arizona time (America/Phoenix, UTC-7 all year, no DST)**.

- A **day** is 00:00 to 23:59:59 Phoenix (07:00Z to 06:59:59Z).
- A **week** is **Monday 00:00 through Sunday 23:59:59 Phoenix**. Labels show the Monday to Sunday dates, e.g. "Oct 12 to Oct 18".
- Shared helper: `lib/phoenix-time.ts` (`phoenixDateKey`, `phoenixDayStartUtc`, `phoenixWeekKey`, `phoenixWeekStartUtc`, `phoenixWeekEndUtc`, `formatPhoenixWeekRange`, ...). Use it instead of `toISOString().slice(0, 10)` or `getUTCDay()` for anything a person reads as "today" or "this week".

## Scheduled jobs (schedules are UTC by nature)

`vercel.json` can't hold comments, so the Phoenix times live here.

| Job | Where | Schedule (UTC) | Phoenix time | Once per |
|---|---|---|---|---|
| `/api/cron/organizer-digest` (+ feedback ask) | vercel.json | `5 12 * * *` (was `5 0 * * *`, 5:05 PM) | 5:05 AM daily | Phoenix day |
| `/api/cron/geography-refresh` | vercel.json | `0 15 * * *` | 8:00 AM daily | Phoenix day (PR #90) |
| `/api/cron/email-queue` | vercel.json | `7 * * * *` (was `7 0 * * *`, 5:07 PM daily) | hourly at :07 (the 12:07 AM run sends the batch rows) | each run (row claims) |
| `/api/cron/participant-reminders` | vercel.json + email-pingers.yml | `0 * * * *`, `35 * * * *` | hourly at :00 and :35 | hour |
| `/api/cron/organizer-faster` | email-pingers.yml | `35 * * * *` | hourly at :35 | hour |
| `/api/cron/calendar-reconcile` | calendar-reconcile.yml | `5 * * * *` | hourly at :05 | hour |

## Email budget and hold (Phoenix day)

- **Daily send budget**: `RESEND_DAILY_SOFT_LIMIT` (default 90) per Phoenix day, counted under `email_resend_phx_day`. A Resend send needs room in **both** this budget and the UTC day cap (the old `email_resend_daily` counter, same key, so nothing resets on deploy). Either one full means urgent and near real time mail goes to Brevo (if configured) and batch mail is queued.
- **Near real time mail, no hold** (welcome, new creator notice, feedback received; `REALTIME_KINDS` in `lib/email-queue-time.ts`): sent right away at any hour. If Resend is out of budget it goes through Brevo. Only if Brevo isn't configured or is also refused is it queued, due now, and the hourly drain sends it first (Brevo again if Resend is still full). It never goes past either Resend counter.
- **Hold for batch mail** (digests, reports, feedback asks): sent right away during the first `EMAIL_DEFER_SEND_WINDOW_HOURS` (default 6) of the Phoenix day, so 12 AM to 6 AM Arizona. Otherwise queued with `send_after` 12:05 AM Arizona next day, sent by the 12:07 AM run of `/api/cron/email-queue`.
- **Organizer digest and feedback ask**: once per Phoenix day, run at 5:05 AM Arizona, inside the send window, so they go out immediately.
- Tradeoff: the 12:07 AM drain lands 7 hours into Resend's UTC day. If 5 PM to midnight Arizona already used most of it, the cap stops the drain and the rest stay pending. The hourly runs retry them, so they go out at 5:07 PM when the UTC cap resets (if Arizona budget is left), else the next 12:07 AM. Nothing gets refused by Resend.

## Deliberately still UTC

- **Resend's own quota still resets at 00:00 UTC (5 PM Phoenix).** We can't move that. Our daily email budget, the "hold" for non urgent mail and the queue drain are on the Phoenix day now (see below), and `lib/email-deliver.ts` keeps a **UTC day safety cap** (`RESEND_UTC_DAY_CAP`, default = `RESEND_DAILY_SOFT_LIMIT`, max 100) so no Resend day ever gets more than Resend allows.

- **Hour buckets** (`hourBucketDate()`): Arizona is a whole-hour offset, so an hour is the same instant either way.
- **Participant reminder SQL prefilter and calendar reconcile lower bound**: deliberately wide UTC date windows (±1 to 2 days); the exact per-row check uses each event's own timezone.
- **Event times** use the event's own `event_timezone` (default America/Phoenix), never the server zone.
- **Browser "today"** checks on the public sheet and create form use the visitor's local time, which is right for people outside Arizona.
