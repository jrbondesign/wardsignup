# Time zones

WardSignup runs on **Arizona time (America/Phoenix, UTC-7 all year, no DST)**.

- A **day** is 00:00 to 23:59:59 Phoenix (07:00Z to 06:59:59Z).
- A **week** is **Monday 00:00 through Sunday 23:59:59 Phoenix**. Labels show the Monday to Sunday dates, e.g. "Oct 12 to Oct 18".
- Shared helper: `lib/phoenix-time.ts` (`phoenixDateKey`, `phoenixDayStartUtc`, `phoenixWeekKey`, `phoenixWeekStartUtc`, `phoenixWeekEndUtc`, `formatPhoenixWeekRange`, ...). Use it instead of `toISOString().slice(0, 10)` or `getUTCDay()` for anything a person reads as "today" or "this week".

## Scheduled jobs (schedules are UTC by nature)

`vercel.json` can't hold comments, so the Phoenix times live here.

| Job | Where | Schedule (UTC) | Phoenix time | Once per |
|---|---|---|---|---|
| `/api/cron/organizer-digest` (+ feedback ask) | vercel.json | `5 0 * * *` | 5:05 PM daily | UTC day (on purpose, see below) |
| `/api/cron/geography-refresh` | vercel.json | `0 15 * * *` | 8:00 AM daily | Phoenix day (PR #90) |
| `/api/cron/email-queue` | vercel.json | `7 0 * * *` | 5:07 PM daily | each run (row claims) |
| `/api/cron/participant-reminders` | vercel.json + email-pingers.yml | `0 * * * *`, `35 * * * *` | hourly at :00 and :35 | hour |
| `/api/cron/organizer-faster` | email-pingers.yml | `35 * * * *` | hourly at :35 | hour |
| `/api/cron/calendar-reconcile` | calendar-reconcile.yml | `5 * * * *` | hourly at :05 | hour |

## Deliberately still UTC

- **Resend's daily quota resets at 00:00 UTC (5 PM Phoenix).** `lib/email-deliver.ts` (daily send budget), `lib/email-queue-time.ts` (the "5 PM hold": non urgent mail sent late in the UTC day waits for 00:05 UTC) and the email-queue cron follow Resend's clock, not ours.
- **Organizer digest and feedback ask daily claim** (`dayBucketDate()`): tied to the 5 PM Phoenix reset so digests go out right after it. A Phoenix-day claim would move them to the first ping after midnight Arizona time.
- **Hour buckets** (`hourBucketDate()`): Arizona is a whole-hour offset, so an hour is the same instant either way.
- **Participant reminder SQL prefilter and calendar reconcile lower bound**: deliberately wide UTC date windows (±1 to 2 days); the exact per-row check uses each event's own timezone.
- **Event times** use the event's own `event_timezone` (default America/Phoenix), never the server zone.
- **Browser "today"** checks on the public sheet and create form use the visitor's local time, which is right for people outside Arizona.
