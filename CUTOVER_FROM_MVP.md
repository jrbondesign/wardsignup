# Cutover: production Git source `wardsignup-mvp` → `wardsignup`

**Status:** This sync is **merged to `main`**. Remaining: flip Vercel Git (human).

## Already done
- Synced application code from private `wardsignup-mvp` into this repo
- Renamed npm package `wardsignup-mvp` → `wardsignup`
- Kept OSS docs + `.github/FUNDING.yml`; included `vercel.json`
- GitHub Actions workflows still need a manual copy (token needs `workflow` scope)

## Do this now (~15 min)

1. Vercel → project for **wardsignup.com** → Settings → Git → connect **`jrbondesign/wardsignup`**, production branch **`main`**
2. Redeploy Production → verify https://wardsignup.com
3. Rollback = reconnect `jrbondesign/wardsignup-mvp` (DNS unchanged)

## Optional
Copy `.github/workflows/participant-reminders.yml` from the private mvp repo with a token that has the `workflow` scope, plus any Actions secrets.
