# Email failover (Resend, then Brevo) and routing by type

Every app email goes through `deliverEmail` in `lib/email-deliver.ts`, either directly (sign in links, org invite links) or through `sendGuardedEmail` (everything else, including the hourly queue drain). Supabase Auth does not send any of our mail: sign in and invite links are made with `auth.admin.generateLink` and sent by the app, so this failover covers them too.

## Routing by type (bulk mail goes to Brevo first)

Resend's free plan is 100 emails a day. Sign in links, invites and signup confirmations need that room most, so bulk mail goes to Brevo (free, 300 a day) first once Brevo is set up.

| Mail | Kind (`kind` in logs) | First provider |
| --- | --- | --- |
| Sign in / magic link | `magic_link` | Resend (failover below) |
| Org and event invites | `org_invite_link`, `other` | Resend (failover below) |
| Signup confirmations | `signup_confirmation` | Resend (failover below) |
| Welcome, new creator, feedback received, leader notices, manual reports | various | Resend (failover below) |
| Participant reminders | `reminder` | **Brevo**, then Resend |
| Daily organizer digests | `digest` | **Brevo**, then Resend |
| Feedback asks and summaries | `feedback`, `feedback_summary` | **Brevo**, then Resend |

The list lives in `BULK_KINDS` in `lib/email-deliver.ts`.

- Brevo first sends do not use the Resend daily budget, so they leave room for sign in mail.
- If Brevo refuses or errors (for example its own daily limit), the email takes the normal Resend path: the Resend budget, the one retry, the same `Idempotency-Key`. Brevo is not tried a second time for that email. Each Brevo call times out after 15 seconds (`BREVO_TIMEOUT_MS`), so a hung Brevo request can't stall a reminder or digest batch; a timeout counts as a Brevo failure. Batch mail with no Resend room is queued for the next Arizona day, as before.
- A Brevo first send is routing, not a failover: it logs `[email] sent provider=brevo ... route=bulk`, and does not record `email_failover` or send the alert.
- Residual risk: if Brevo accepts a reminder but the answer is lost in the network (or arrives after the 15 second timeout), the Resend fallback sends a second copy. Brevo has no idempotency guarantee. A duplicate reminder is the safer failure than a missing one.

### Switch: `EMAIL_BULK_PROVIDER`

| Value | Bulk mail goes to |
| --- | --- |
| unset or `auto` (default) | Brevo first when Brevo is configured (the three vars under "Turning it on"); otherwise Resend, exactly as before |
| `brevo` | Same as `auto` |
| `resend` | Resend first, always (the behavior before this switch). Any unknown value also means `resend`. |

Why `auto` is the default: it changes nothing until Brevo is configured, and Brevo being configured is already the switch that turns on the failover, so there is one thing to set up, not two. The lean plan is to keep Resend's free quota for sign in mail. To keep Brevo as a failover only, set `EMAIL_BULK_PROVIDER=resend`.

## When Brevo takes an email (failover)

| Resend answer | What happens |
| --- | --- |
| Accepted | Done. Brevo is never called. |
| Our daily budget is full, or 429 (`daily_quota_exceeded`, `monthly_quota_exceeded`, `rate_limit_exceeded`) | Urgent and near real time mail: Brevo. Batch mail: queued for the next Arizona day (unchanged). |
| 5xx or network error (no response) | One retry on Resend with the same `Idempotency-Key`. If Resend did take the first request it answers with that email, so nothing is sent twice. Still failing: Brevo, any mail class. |
| 401, or a missing, invalid or suspended key | Brevo. |
| 409 `concurrent_idempotent_requests` | Never Brevo. Resend may be sending it right now. |
| 400 / 422 validation and other 4xx | Never Brevo. It would fail there too. |

Residual risk: if Resend accepts a request and both the first answer and the retry are lost in the network, Brevo sends a second copy. That needs two network failures in a row on the same email.

The queue drain passes `email-queue/<row id>` as the key, so a row retried within 24 hours after an attempt Resend actually took is not sent again. Brevo gets the same key in its `IdempotencyKey` header.

## Logs and alert

- Every send logs one line, `[email] sent provider=resend|brevo brand=... kind=...` (no recipient, no subject), plus `failover=<reason>` when Brevo took it.
- Every failover logs `[email-failover] ...` and records the PostHog event `email_failover` (`brand_id`, `kind`, `reason`, `provider`; never the recipient).
- At most one alert email per brand per Arizona day, through Brevo, to `jonathan@wardsignup.com`. Override with `EMAIL_FAILOVER_ALERT_TO`, turn off with `EMAIL_FAILOVER_ALERT=off`. The limit uses the `action_rate_limit` counter `email_failover_alert` and fails closed.
- There is no per email log table, so the provider is recorded in logs and PostHog, not the database. No migration.

## Turning it on

Both the failover and the bulk routing above turn on with these vars.

Brevo stays off (Resend only, exactly as before) until all three are set: `EMAIL_FALLBACK_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (optional `BREVO_SENDER_NAME`). `BREVO_SENDER_EMAIL` must be a sender on a domain authenticated in Brevo. `EMAIL_RESEND_RETRY_MS` (default 400) is the wait before the Resend retry.

## Turning it off (rollback)

- Bulk routing only: set `EMAIL_BULK_PROVIDER=resend` and redeploy. Brevo stays as the failover.
- Brevo completely: remove `EMAIL_FALLBACK_PROVIDER` (or set it to anything other than `brevo`) and redeploy. Everything goes through Resend only, as before Brevo was added.
