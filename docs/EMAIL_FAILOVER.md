# Email failover (Resend, then Brevo)

Every app email goes through `deliverEmail` in `lib/email-deliver.ts`, either directly (sign in links, org invite links) or through `sendGuardedEmail` (everything else, including the hourly queue drain). Supabase Auth does not send any of our mail: sign in and invite links are made with `auth.admin.generateLink` and sent by the app, so this failover covers them too.

## When Brevo takes an email

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

Brevo stays off (Resend only, exactly as before) until all three are set: `EMAIL_FALLBACK_PROVIDER=brevo`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (optional `BREVO_SENDER_NAME`). `BREVO_SENDER_EMAIL` must be a sender on a domain authenticated in Brevo. `EMAIL_RESEND_RETRY_MS` (default 400) is the wait before the Resend retry.
