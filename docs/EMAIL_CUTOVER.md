# Brevo cutover (gated, preview does not send)

This is not turned on in production by deploying the code. The live path stays the one in [EMAIL_FAILOVER.md](./EMAIL_FAILOVER.md) until `EMAIL_PROVIDER_CUTOVER=brevo` is set on purpose.

The cutover sends Ward Signup mail through Brevo first, From `jonathan@wardsignup.com` only. Resend is a single fallback after Brevo **definitively rejects** a message for quota or auth, and only inside the existing Resend UTC-day cap (at most 100). A timeout, a 5xx, a 2xx without a message id, or Brevo's `duplicate_request` is ambiguous: the other provider is not called, and the same idempotency key is not sent again.

App code cannot promise the Brevo account will not be charged. The free plan checked on 8 Nov 2026 was $0/month, 300 emails/day shared by marketing and transactional mail, with 288 of 300 still showing at 9:05 AM MST. That 288 figure is a snapshot, not a remaining balance this app stores. Reset time, prepaid balance, and auto-recharge were not shown. There is no saved card or paid plan in that check. This code does not upgrade the plan.

## What the quota guard actually does

- Reservations are atomic per provider and window (database row lock). Each envelope recipient counts, including a batch on one request. One request is refused above 20 recipients.
- Nothing sends until both `BREVO_DAILY_RECIPIENT_CAP` and `BREVO_QUOTA_USED_AT_OPEN` are set. There is no default of 300 and the 8 Nov 2026 snapshot of 288 is not stored. The cap is the ceiling for this window (clamped at 300). The seed is recipients already used on the Brevo account when the window opens, including marketing and other senders. The first reservation writes `seed + this send` in the same transaction. A later change to the seed does not rewind a row that already exists.
- That seed is a point-in-time figure. Mail sent by another Brevo user, campaign, or key after the window opens is invisible until Brevo rejects a send for quota, which latches the window. Freeze those other senders before enabling the gate.
- The window id defaults to `unconfirmed-reset` and does **not** roll forward on a clock. A new `BREVO_QUOTA_WINDOW_ID` opens a new row and applies the seed that is set at that moment. It does not grant a fresh 300. Change the id only after the dashboard shows a reset, and set the seed to the used count you see then (0 only when the dashboard shows zero used).
- If the cap or seed is missing, `unknown`, or the quota functions fail, the send stops and can be retried. Resend is not called.
- HTTP 429 with Brevo's API rate-limit code is a throttle, not the daily plan. The reservation is released and the same provider is retried on the same idempotency key. Urgent mail, reminders, signup confirmations, and sign-in links are not parked until 12:05 AM Arizona. Resend is not called. A reminder is counted sent only after a provider accepts it. If the only result is retryable, `reminder_sent_at` is cleared and a later cron run sends it only while the slot is still inside the existing 0–25 hour window.
- `not_enough_credits`, HTTP 402, and daily-limit wording latch Brevo. A definitive sender or auth rejection also leaves Brevo. Both may use Resend once, and that fallback consumes the same Resend daily counters the live path already uses (`email_resend_daily` and `email_resend_phx_day`). It is not a second counter that starts at 0. If those counters cannot be read, Resend is not called.
- A timeout, a 5xx, a 2xx without a message id, or `duplicate_request` is ambiguous. Resend is not called. A claim or reserve failure before any HTTP request stays retryable. An in-flight row that never started HTTP stays retryable. An in-flight row that did start HTTP is not sent again.

## Preview

`VERCEL_ENV=preview` or `EMAIL_OUTBOUND=off` returns before any provider call and before the email crons touch the database. A preview deploy of this branch still inherits the project's existing Preview Supabase and Resend variables. This change does not read those values and does not replace them with an isolated database.

## Env to set later (not set by this change)

| Name | Required to send | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER_CUTOVER` | yes, value `brevo` | Any other value, including unset, keeps today's path. |
| `WARDSIGNUP_BREVO_API_KEY` | yes | Regular sending key (`api-key` header). Not `BREVO_API_KEY`, not an MCP token, not the SMTP password. |
| `BREVO_WEBHOOK_TOKEN` | to accept bounces | Bearer token or `X-WardSignup-Webhook-Token`. Separate from the sending key. |
| `BREVO_DAILY_RECIPIENT_CAP` | yes | Explicit ceiling for this window, 1–300. Unset refuses. Not a leftover snapshot. |
| `BREVO_QUOTA_USED_AT_OPEN` | yes | Dashboard used count for this window, including marketing and other senders. Unset refuses. `0` only when the dashboard shows zero used. |
| `BREVO_QUOTA_WINDOW_ID` | no | Default `unconfirmed-reset`. A new id uses the seed above. It does not roll on a clock. |
| `EMAIL_OUTBOUND` | no | `off` stops every provider, including the old path. |

Migration `supabase/migrations/20261108183000_email_provider_cutover.sql` is not applied by this change. The cutover fail-closes if those functions are missing.

Webhook URL, after the token exists: `https://wardsignup.com/api/webhooks/brevo`. Brevo does not sign the body. Freshness uses `ts_event`, then `ts` (seconds in the published samples). `ts_epoch` is the send time; a 10-digit seconds value is not treated as the event time. Millisecond `ts_epoch` is accepted only when no event timestamp is present. Documented names `hard_bounce`, `invalid_email`, and `blocked` suppress the address as a hard bounce and set delivery status `bounced`. `spam` suppresses as a complaint. `unsubscribed` suppresses as an unsubscribe and does not block a later sign-in or signup confirmation. `error` sets status `bounced` and does not suppress the address: Brevo's published sample for that event is a copy of `invalid_email` and does not say the address is invalid. Tags are read from the `tags` array. Message ids are stored without surrounding `<>`. The receipt row is written only after suppress and status succeed, so a crash before that receipt can be retried. A receipt already stored is not applied again.

Hard bounces and complaints are checked before every cutover send, including magic links. Unsubscribes still block notification mail only.

## Cutover

1. Apply the migration to the database you intend to send from. Do not do this against production until you mean to.
2. Confirm the Brevo sender `jonathan@wardsignup.com` is still verified. Do not buy a plan or add a card.
3. Set `WARDSIGNUP_BREVO_API_KEY` to the regular sending key stored for this purpose. Leave `BREVO_API_KEY` as it is.
4. Set `BREVO_WEBHOOK_TOKEN` and register the webhook with bearer auth. Do not point it at a preview URL.
5. Read the Brevo dashboard at that moment. Set `BREVO_DAILY_RECIPIENT_CAP` to the ceiling you are willing to reserve (at most 300) and `BREVO_QUOTA_USED_AT_OPEN` to the used count on screen, including marketing. Do not reuse the 8 Nov 2026 figure of 288. Freeze other senders on that account.
6. Set `EMAIL_PROVIDER_CUTOVER=brevo` on production and redeploy.
7. Watch `[email] cutover` logs and `email_delivery_attempts`. Ambiguous rows are not retried automatically. Pre-HTTP failures are.

## Rollback

1. Remove `EMAIL_PROVIDER_CUTOVER` or set it to `resend`, then redeploy. Sends return to the previous path. The new tables can stay.
2. Emergency stop for every provider, old path included: set `EMAIL_OUTBOUND=off` and redeploy.
3. To stop only the new Brevo window without turning the gate off, unset `BREVO_DAILY_RECIPIENT_CAP` or `BREVO_QUOTA_USED_AT_OPEN`, or set either to `unknown`. That refuses Brevo and does not fall back.

## Known limits

- A crash after Brevo accepts and before the status write leaves the key ambiguous. That copy is not sent again.
- Brevo may queue mail on their side after a 201. We treat 201 with a message id as accepted and do not also send through Resend.
- The old bulk-Brevo path (gate off, `EMAIL_FALLBACK_PROVIDER=brevo`) still falls back to Resend on a Brevo timeout. That path is unchanged on purpose. The new gate is what closes it.
- No live send was made to prove delivery. Jest uses an in-memory lock and a fake HTTP client. `scripts/email-cutover-pg-proof.sh` applies this migration to a disposable local database and drops it. That script is not a production apply.
- A new login after the 10-minute uncertainty window is a new magic-link token and a new key. The older ambiguous key is not resent. Two sign-in emails are possible only when the first outcome is still unknown and the person asks again after that window.
- `error` webhook events do not suppress the address. See the webhook section.
