# Brevo cutover (gated, preview does not send)

This is not turned on in production by deploying the code. The live path stays the one in [EMAIL_FAILOVER.md](./EMAIL_FAILOVER.md) until `EMAIL_PROVIDER_CUTOVER=brevo` is set on purpose.

The cutover sends Ward Signup mail through Brevo first, From `jonathan@wardsignup.com` only. Resend is a single fallback after Brevo **definitively rejects** a message for quota or auth, and only inside the existing Resend UTC-day cap (at most 100). A timeout, a 5xx, a 2xx without a message id, or Brevo's `duplicate_request` is ambiguous: the other provider is not called, and the same idempotency key is not sent again.

App code cannot promise the Brevo account will not be charged. The free plan checked on 8 Nov 2026 was $0/month, 300 emails/day shared by marketing and transactional mail, with 288 of 300 still showing at 9:05 AM MST. That 288 figure is a snapshot, not a remaining balance this app stores. Reset time, prepaid balance, and auto-recharge were not shown. There is no saved card or paid plan in that check. This code does not upgrade the plan.

## What the quota guard actually does

- Reservations are atomic per provider and window (database row lock). Each envelope recipient counts, including a batch on one request. One request is refused above 20 recipients.
- Nothing sends until both `BREVO_DAILY_RECIPIENT_CAP` and `BREVO_QUOTA_USED_AT_OPEN` are set. There is no default of 300 and the 8 Nov 2026 snapshot of 288 is not stored. `BREVO_DAILY_RECIPIENT_CAP` is the plan ceiling for this window, clamped at 300. It is the total the plan allows, not the dashboard remainder. Do not put 288, or any "remaining" figure, in the cap. `BREVO_QUOTA_USED_AT_OPEN` is the used count, including marketing and other senders. Remaining capacity for this app is cap minus seed. The first reservation writes `seed + this send` in the same transaction. A later change to the seed does not rewind a row that already exists. A release cannot move the counter below that seed, and an exact replay of the same release does not refund a second time.
- That seed is a point-in-time figure. Mail sent by another Brevo user, campaign, or key after the window opens is invisible to this app until Brevo rejects a send for quota, which latches the window. Freeze every other sender on that account for the window, then confirm the used count on the live dashboard before the gate is set. This code does not prove the account cannot be charged. A confirmed reset is the only time to set a new `BREVO_QUOTA_WINDOW_ID`, and the seed must be the used count at that new open.
- The window id defaults to `unconfirmed-reset` and does **not** roll forward on a clock. A new `BREVO_QUOTA_WINDOW_ID` opens a new row and applies the seed that is set at that moment. It does not grant a fresh 300. Change the id only after the dashboard shows a reset, and set the seed to the used count you see then (0 only when the dashboard shows zero used).
- If the cap or seed is missing, `unknown`, or the quota functions fail, the send stops and can be retried. Resend is not called.
- HTTP 429 with Brevo's API rate-limit code is a throttle, not the daily plan. The reservation and the `quota_held` flag are cleared in one database call. If that call fails, the reservation stays and Resend is not called. The next release of the same attempt refunds once. Urgent mail, reminders, and sign-in links are not parked until 12:05 AM Arizona. A signup confirmation has no later cron, so after one same-provider retry the same business key is queued due now for the hourly drain. Resend is not called. A reminder is counted sent only after a provider accepts it. `reminder_sent_at` is a claim, not a receipt. It is cleared only when the result is retryable and the slot is still inside the existing 0–25 hour window. An ambiguous result or a suppression keeps the claim and is not counted sent. A magic-link 429 returns HTTP 503 with `retryable: true` and gives back the 5-minute dedupe slot. An ambiguous magic link keeps that slot and returns `delivery: unconfirmed`. It does not say the link was already sent.
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
| `BREVO_DAILY_RECIPIENT_CAP` | yes | Plan ceiling for this window, 1–300. This is the total the plan allows, not the dashboard remainder. Unset refuses. Do not paste 288 or any remaining-count here. |
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
5. Read the Brevo dashboard at that moment. Set `BREVO_DAILY_RECIPIENT_CAP` to the plan ceiling (300 on the free plan checked 8 Nov 2026) and `BREVO_QUOTA_USED_AT_OPEN` to the used count on screen, including marketing. Remaining room is ceiling minus used. Do not put the remainder, or the stale 288 figure, in the cap. Freeze every other Brevo sender for that window. Do not enable the gate before this migration is applied: a failed uncertainty lookup blocks a new gated sign-in rather than sending a second link.
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
- A new login after the 10-minute uncertainty window is a new magic-link token and a new key. The older ambiguous key is not resent. Two sign-in emails are possible only when the first outcome is still unknown and the person asks again after that window. While the gate is on, a failed uncertainty lookup is treated as uncertain, so the request does not send another link. If the migration is missing, every gated sign-in returns unconfirmed and does not send.
- `error` webhook events do not suppress the address. See the webhook section.
- A blank idempotency key is refused. The cutover does not mint a random key. Welcome, digest, on-demand report, faster alert, event invite, organization invite, feedback ask, feedback response, feedback digest, new-creator notice, and calendar alerts pass a stable business key. Gate off, those keys stay unset and today's path is unchanged. A claim stamp (`welcome_email_sent`, `reminder_sent_at`, a digest watermark, a faster watermark, a cron day claim, `broken_notified_at`) is not a delivery receipt.
- Other Brevo senders after the seed is written stay invisible until Brevo rejects for quota. Exclusive use of the account for that window, plus a live dashboard check at open and at any reset, is an operational gate. It is not something this code can prove.
