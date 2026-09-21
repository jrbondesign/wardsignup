# GSC + SEO hygiene (Ward Signup)

**Repo:** `jrbondesign/wardsignup` (production for wardsignup.com)
**Branch:** `seo/gsc-hygiene` — review / preview only; **do not merge until Jonathan says so.**
**Ward transactional email / cron / send volume:** untouched.

## What this branch ships

| Item | Behavior |
|------|----------|
| `/robots.txt` | Allow `/`; disallow auth/app prefixes; Sitemap + Host for brand apex |
| `/sitemap.xml` | Marketing URLs only: `/`, `/privacy`, `/terms` |
| www → apex | Middleware **301** (`www.wardsignup.com` → `wardsignup.com`) |
| `rel=canonical` | Home `/`; Privacy `/privacy`; Terms `/terms` |
| JSON-LD | Organization + WebSite + WebApplication from existing brand copy (no invented legal entity/address; no FAQPage) |
| Auth/app | noindex on login/create/dashboard/settings/edit/admin/orgs/auth |
| GSC verify prep | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` → HTML meta tag (preferred tonight) |

## Intentionally deferred (follow-up)

- About / FAQ / use-case landing pages (need curated copy)
- Privacy §7 vs PostHog disclosure (**Jonathan / legal** — do not invent policy text here)
- `/favicon.ico` classic path
- Public OSS mirror (`jrbondesign/wardsignup`) — not in this PR

## GSC verification (tonight preferred — no DNS wait)

1. Google Search Console → Add property → URL prefix `https://wardsignup.com` (apex).
2. Choose **HTML tag** verification; copy the `content` TOKEN.
3. Vercel project **wardsignup** → Env → `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=TOKEN` (Preview + later Production).
4. Redeploy preview; confirm meta in page source; click Verify in GSC.
5. Alternate: place Google HTML file under `public/googleXXXXXXXX.html` (also no DNS).

### Morning fallback — DNS TXT

Only if HTML methods fail and Jonathan approves. Do **not** change DNS tonight without need.

1. GSC DNS verification for `wardsignup.com`.
2. Add TXT at registrar; wait; Verify.
3. Optional later: Vercel Domains www → apex redirect (belt-and-suspenders).

## After merge (Jonathan approval)

1. Confirm live robots.txt, sitemap.xml, www 301, canonical + JSON-LD.
2. GSC → submit `https://wardsignup.com/sitemap.xml`.
3. URL Inspection → Request indexing for `/`.
4. CC **Eva** + **SEO Desk**.

## Privacy / PostHog flag (Jonathan)

Privacy §7 claims no advertising cookies or third-party tracking, while the app loads PostHog. Align disclosure with analytics or change analytics — do not invent legal copy in engineering PRs.

## Eva — GSC verify tonight (no DNS)

Prefer **HTML file** or **meta tag** (no DNS TXT required tonight).

1. In GSC, choose HTML file upload OR HTML tag.
2. **HTML file:** save Google's `googleXXXX.html` into this repo's `public/` folder on this branch (Next.js serves `public/` at the site root automatically). Commit/push so the Vercel preview (or production after merge) serves `https://<host>/googleXXXX.html`, then Verify.
3. **HTML meta:** paste the `content=` token into Vercel env `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and redeploy; root layout already emits the meta when set.
4. Do **not** invent a fake verification file. Drop the real Google file/token when Eva pastes it.
5. DNS TXT instructions above are **morning backup only** — not required for tonight.
