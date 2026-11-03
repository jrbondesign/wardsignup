# Cloudflare Turnstile on sign in / sign up and public event signups

The login page form (`/login`) posts to `/api/auth/send-magic-link`, which creates the account (if new) with `auth.admin.generateLink` and emails the link. Turnstile guards that route.

It also guards the anonymous signup routes on the public event page:

| Form | Route | Widget `action` |
| --- | --- | --- |
| Slot / RSVP signup (inline form and the modal) | `/api/signups/bulk` | `event_signup` |
| Bring an item | `/api/item-signups` | `item_signup` |
| Add your own contribution | `/api/item-signups` | `custom_item_signup` |
| (no form in the app today, still public) | `/api/signups` | n/a |

Cancel (`/api/signups/cancel`, token in the link) and everything behind sign in are not changed.

## Off until configured
Both must be set in Vercel, or nothing changes (no widget, no check):

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, the widget). A `NEXT_PUBLIC_` var is baked in at build time, so redeploy after setting it.
- `TURNSTILE_SECRET_KEY` (server only)

Requiring both means a secret set without a site key can't lock everyone out.

## Behavior
- Order in the route: body/email validation → Vercel BotID → **Turnstile** → IP rate limit → dedupe → per-recipient cap → generateLink → send.
- No token or a rejected token (invalid, expired, replayed) → 403, nothing created or sent.
- Cloudflare siteverify unreachable / timeout (5s) / 5xx / 429 / an answer that isn't siteverify JSON / `internal-error`, or our own secret rejected (`invalid-input-secret`, `missing-input-secret`) → allowed and logged (BotID and the rate limits still apply), so a Cloudflare outage doesn't block sign in.
- Tokens are single use and expire after 300 s; the page resets the widget after every submit.
- CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src`.

## Event signup forms
- Order in each signup route: input validation → **Turnstile** → IP signup rate limit → `create_signup_if_capacity` / `create_item_signup_if_capacity`. A bot is stopped before it can take a slot or use up a shared network's (ward building wifi) signup allowance.
- The widget uses `appearance: "interaction-only"`: hidden unless Cloudflare needs a click, so most people never see it. Expired tokens refresh on their own.
- A fast click on Sign Up waits up to 8 seconds for the invisible check instead of failing. If no token comes, the form says so and the person can try again; if the widget could not load at all, the message says to refresh (and to allow `challenges.cloudflare.com` in a content blocker).
- A refused token (expired, replayed) gets a 403 with `captcha: true` and a plain message; the widget resets after every submit, so the next try has a fresh token.
- Siteverify down or misconfigured (network, timeout, 5xx, 429, non JSON answer, `internal-error`, `invalid-input-secret`, `missing-input-secret`): the signup goes through and the route logs it (fail open, same as sign in). The IP signup rate limit still applies. Choice: a Cloudflare outage on a Sunday should not stop a ward from signing up.

## Supabase captcha setting: leave it off
Supabase Auth's captcha protection applies to its public auth endpoints (signUp, signInWithOtp, ...). This app doesn't use them for sign in: it uses the service role `generateLink`, which Supabase does not captcha check. Turning on the Supabase setting would add nothing here and could break any client-side auth call that doesn't send a token.

Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
