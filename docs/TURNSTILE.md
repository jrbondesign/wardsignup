# Cloudflare Turnstile on sign in / sign up

The login page form (`/login`) posts to `/api/auth/send-magic-link`, which creates the account (if new) with `auth.admin.generateLink` and emails the link. Turnstile guards that route.

## Off until configured
Both must be set in Vercel, or nothing changes (no widget, no check):

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, the widget). A `NEXT_PUBLIC_` var is baked in at build time, so redeploy after setting it.
- `TURNSTILE_SECRET_KEY` (server only)

Requiring both means a secret set without a site key can't lock everyone out.

## Behavior
- Order in the route: body/email validation → Vercel BotID → **Turnstile** → IP rate limit → dedupe → per-recipient cap → generateLink → send.
- No token or a rejected token (invalid, expired, replayed) → 403, nothing created or sent.
- Cloudflare siteverify unreachable / 5xx / `internal-error` → allowed and logged (BotID and the rate limits still apply), so a Cloudflare outage doesn't block sign in.
- Tokens are single use and expire after 300 s; the page resets the widget after every submit.
- CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src`.

## Supabase captcha setting: leave it off
Supabase Auth's captcha protection applies to its public auth endpoints (signUp, signInWithOtp, ...). This app doesn't use them for sign in: it uses the service role `generateLink`, which Supabase does not captcha check. Turning on the Supabase setting would add nothing here and could break any client-side auth call that doesn't send a token.

Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
