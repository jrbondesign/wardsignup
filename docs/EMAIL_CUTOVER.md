# Brevo cutover (gated, preview does not send)

This is not turned on in production by deploying the code. The live path stays the one in [EMAIL_FAILOVER.md](./EMAIL_FAILOVER.md) until `EMAIL_PROVIDER_CUTOVER=brevo` is set on purpose.

The cutover sends Ward Signup mail through Brevo first, From `jonathan@wardsignup.com` only. Resend is a single fallback after Brevo **definitively rejects** a message for quota or auth, and only inside the existing Resend UTC-day cap (at most 100). A timeout, a 5xx, a 2xx without a message id, or Brevo's `duplicate_request` is ambiguous: the other provider is not called, and the same idempotency key is not sent again.

App code cannot promise the Brevo account will not be charged. The free plan checked on 8 Nov 2026 was $0/month, 300 emails/day shared by marketing and transactional mail, with 288 of 300 still showing at 9:05 AM MST. That 288 figure is a snapshot, not a remaining balance this app stores. Reset time, prepaid balance, and auto-recharge were not shown. There is no saved card or paid plan in that check. This code does not upgrade the plan.

## What the quota guard actually does

- Reservations are atomic per provider and window (database row lock). Each envelope recipient counts, including a batch on one request. One request is refused above 20 recipients.
- The default ceiling is 300 of **our** reservations for the current window id, not "288 left". Other Brevo activity is invisible here. A provider quota or credit error latches that window shut.
- The window id defaults to `unconfirmed-reset` and does **not** roll forward on a clock. Passing time is not treated as a reset. Open a new window only by setting `BREVO_QUOTA_WINDOW_ID` after the Brevo dashboard shows the quota has reset.
- If the cap is `unknown`, missing, or the quota functions fail, the send stops. Resend is not called.
- HTTP 429 with Brevo's API rate-limit code is a throttle, not the daily plan. The reservation is released and the same provider can be retried later. Resend is not called.
- `not_enough_credits`, HTTP 402, and daily-limit wording latch Brevo and may use the capped Resend fallback once.

## Preview

`VERCEL_ENV=preview` or `EMAIL_OUTBOUND=off` returns before any provider call and before the email crons touch the database. A preview deploy of this branch still inherits the project's existing Preview Supabase and Resend variables. This change does not read those values and does not replace them with an isolated database.

## Env to set later (not set by this change)

| Name | Required to send | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER_CUTOVER` | yes, value `brevo` | Any other value, including unset, keeps today's path. |
| `WARDSIGNUP_BREVO_API_KEY` | yes | Regular sending key (`api-key` header). Not `BREVO_API_KEY`, not an MCP token, not the SMTP password. |
| `BREVO_WEBHOOK_TOKEN` | to accept bounces | Bearer token or `X-WardSignup-Webhook-Token`. Separate from the sending key. |
| `BREVO_DAILY_RECIPIENT_CAP` | no | Default 300. `unknown` refuses sends. Cannot be set above 300. |
| `BREVO_QUOTA_WINDOW_ID` | no | Default `unconfirmed-reset`. Change it only after a confirmed reset. |
| `EMAIL_OUTBOUND` | no | `off` stops every provider, including the old path. |

Migration `supabase/migrations/20261108183000_email_provider_cutover.sql` is not applied by this change. The cutover fail-closes if those functions are missing.

Webhook URL, after the token exists: `https://wardsignup.com/api/webhooks/brevo`. Events that suppress: hard bounce, blocked, invalid, spam, unsubscribed. Soft bounce and deferred only update delivery status. The same event id is stored once; a repeat is acknowledged and not applied again. Events older than 24 hours or more than 5 minutes in the future are refused. Brevo does not sign the body.

## Cutover

1. Apply the migration to the database you intend to send from. Do not do this against production until you mean to.
2. Confirm the Brevo sender `jonathan@wardsignup.com` is still verified. Do not buy a plan or add a card.
3. Set `WARDSIGNUP_BREVO_API_KEY` to the regular sending key stored for this purpose. Leave `BREVO_API_KEY` as it is.
4. Set `BREVO_WEBHOOK_TOKEN` and register the webhook with bearer auth. Do not point it at a preview URL.
5. Set `EMAIL_PROVIDER_CUTOVER=brevo` on production and redeploy.
6. Watch `[email] cutover` logs and `email_delivery_attempts`. Ambiguous rows are not retried automatically.

## Rollback

1. Remove `EMAIL_PROVIDER_CUTOVER` or set it to `resend`, then redeploy. Sends return to the previous path. The new tables can stay.
2. Emergency stop for every provider, old path included: set `EMAIL_OUTBOUND=off` and redeploy.
3. To stop only the new Brevo window without turning the gate off, set `BREVO_DAILY_RECIPIENT_CAP=unknown`. That refuses Brevo and does not fall back.

## Known limits

- A crash after Brevo accepts and before the status write leaves the key ambiguous. That copy is not sent again.
- Brevo may queue mail on their side after a 201. We treat 201 with a message id as accepted and do not also send through Resend.
- The old bulk-Brevo path (gate off, `EMAIL_FALLBACK_PROVIDER=brevo`) still falls back to Resend on a Brevo timeout. That path is unchanged on purpose. The new gate is what closes it.
- No live send was made to prove delivery. Tests use an in-memory lock and a fake HTTP client.
