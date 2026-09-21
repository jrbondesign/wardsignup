# Cutover: production Git source `wardsignup-mvp` → `wardsignup`

**Goal:** Deploy `wardsignup.com` from `jrbondesign/wardsignup` with no user-facing downtime.

## Already done in this PR
- Synced application code from private `wardsignup-mvp` (production tip) into this repo
- Renamed npm package `wardsignup-mvp` → `wardsignup`
- Kept OSS docs (`LICENSE`, `README`, `CONTRIBUTING`, `SELF_HOSTING`, `STEWARDSHIP`) and `.github/FUNDING.yml`
- Left private ops-only docs/scripts out of this public tree

## Cutover window (~15–30 minutes) — freeze merges to both repos

Site stays up on the last Vercel production deployment the whole time.

1. **Confirm this branch is merged to `main`** on `jrbondesign/wardsignup`.
2. **Align production branch:** Vercel production branch must match this repo’s default (`main`).
3. **Vercel → project that serves `wardsignup.com`** (today named `wardsignup-mvp`):
   - Settings → Git → **Connected Git Repository** → switch to `jrbondesign/wardsignup`
   - Production Branch: `main`
4. **Redeploy Production** from the new connection (Deployments → … → Redeploy, or empty commit / push).
5. **Verify** `https://wardsignup.com` (home, login, create flow smoke).
6. **If deploy fails:** reconnect Git to `jrbondesign/wardsignup-mvp` and redeploy last known-good — domain/DNS unchanged.
7. **After green:** update local remotes, Cursor Cloud environment repo URL, archive or freeze `wardsignup-mvp`.

## Not required for continuity
- Renaming the Vercel *project* (only changes `*.vercel.app` URLs)
- DNS changes for `wardsignup.com`
- Supabase project changes

## Optional follow-ups
- Copy any GitHub Actions secrets from mvp → this repo before relying on workflows
- Bump PostHog (`posthog-js`) if you still want the public-repo session-replay pin after sync

## Manual step before cutover (workflow scope)
This sync PR intentionally omits `.github/workflows/` because the cutover token lacks the GitHub `workflow` scope.
Copy from private mvp after merge (or recreate in the UI):

```bash
# from a clone of wardsignup-mvp
cp .github/workflows/participant-reminders.yml /path/to/wardsignup/.github/workflows/
# commit on wardsignup with a token that has the workflow scope
```
