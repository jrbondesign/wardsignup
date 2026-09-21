# Self-Hosting WardSignup

Complete guide to running your own WardSignup instance.

## Overview

WardSignup is a Next.js application that requires:
1. **PostgreSQL database** (via Supabase)
2. **Email service** (via Resend)
3. **Hosting platform** (Vercel recommended, or any Node.js host)

Total cost: **~$0-20/month** depending on usage (Supabase and Resend have generous free tiers).

## Prerequisites

- Node.js 18+
- npm or yarn
- [Supabase account](https://supabase.com) (free tier works great)
- [Resend account](https://resend.com) (free tier: 100 emails/day)
- [Vercel account](https://vercel.com) (optional, but easiest deployment)

## Quick Start (30 minutes)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait ~2 minutes for provisioning
3. Navigate to **Settings → API**
4. Copy these values:
   - `Project URL` → will be your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon/public key` → will be your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` (secret!) → will be your `SUPABASE_SERVICE_ROLE_KEY`

### 2. Run Database Migrations

Clone this repo and install the Supabase CLI:

```bash
git clone https://github.com/jrbondesign/wardsignup.git
cd wardsignup
npm install -g supabase
```

Link to your Supabase project:

```bash
supabase link --project-ref your-project-ref
```

(Find your `project-ref` in the Supabase dashboard URL: `https://supabase.com/dashboard/project/[your-project-ref]`)

Push migrations:

```bash
supabase db push
```

This creates the database schema: `campaigns`, `sessions`, `signups`, `campaign_items`, `item_signups`, `organizations`, `organization_members`, `event_invites`, `feedback_requests`, `email_suppressions`, and sets up Row-Level Security (RLS) policies.

### 3. Configure Supabase Auth

In the Supabase dashboard:

1. Go to **Authentication → Providers**
2. Enable **Email** provider
3. **Disable** "Confirm email" (WardSignup uses magic links, not confirm-then-password)
4. Go to **Authentication → URL Configuration**
5. Set **Site URL** to your production domain (e.g., `https://yourward.com`)
6. Add **Redirect URLs**:
   - `http://localhost:3000/auth/callback` (for local dev)
   - `https://yourward.com/auth/callback` (for production)
   - Add any Vercel preview URLs if needed

### 4. Set Up Resend Email

1. Go to [resend.com](https://resend.com) and create an account
2. **Add and verify your domain** (or use Resend's sandbox for testing)
   - Go to **Domains → Add Domain**
   - Add DNS records (SPF, DKIM, DMARC) at your DNS provider
   - Wait for verification (~5 minutes)
3. Go to **API Keys** and create a new key
4. Copy the key (starts with `re_...`) → will be your `RESEND_API_KEY`

**Testing without a domain:** Resend's sandbox mode sends to your verified email only. Good for development, but you'll need a real domain for production.

### 5. Clone and Configure

```bash
git clone https://github.com/jrbondesign/wardsignup.git
cd wardsignup
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Supabase (from step 1)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Resend (from step 4)
RESEND_API_KEY=re_your_key_here

# Site URL (your production domain, no trailing slash)
NEXT_PUBLIC_SITE_URL=https://yourward.com

# CRON secret (generate a random string for securing cron endpoints)
CRON_SECRET=your-random-secret-string

# Optional: PostHog analytics (leave blank to disable)
# NEXT_PUBLIC_POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_HOST=

# Optional: AI event extraction (leave blank to disable)
# ANTHROPIC_API_KEY=
```

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the WardSignup homepage!

**Test magic link authentication:**
1. Go to `/login`
2. Enter your email
3. Check your inbox for the magic link
4. Click the link → you should be signed in

### 7. Deploy to Vercel

The easiest way to deploy:

```bash
npm install -g vercel
vercel login
vercel
```

Follow the prompts. Vercel will:
- Create a new project
- Deploy your code
- Give you a `.vercel.app` URL

**Set environment variables in Vercel:**

Go to your Vercel project → **Settings → Environment Variables** and add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_SITE_URL` (your production domain)
- `CRON_SECRET` (generate a strong random string)

Redeploy:
```bash
vercel --prod
```

### 8. Configure Custom Domain (Optional)

In Vercel:
1. Go to **Settings → Domains**
2. Add your custom domain (e.g., `yourward.com`)
3. Follow DNS instructions (add A/CNAME records)

In Supabase:
1. Go to **Authentication → URL Configuration**
2. Update **Site URL** to `https://yourward.com`
3. Add `https://yourward.com/auth/callback` to **Redirect URLs**

### 9. Set Up Cron Jobs (Email Reminders)

WardSignup sends reminder emails 24 hours before events. You need to trigger `/api/cron/participant-reminders` hourly.

**Option A: GitHub Actions (free)**

Add `.github/workflows/reminders.yml`:

```yaml
name: Participant Reminders
on:
  schedule:
    - cron: "0 * * * *"  # every hour
  workflow_dispatch:

jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger reminders
        run: |
          curl -sf -X GET https://yourward.com/api/cron/participant-reminders \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to your GitHub repo secrets (**Settings → Secrets → Actions**).

**Option B: Vercel Cron (paid plans only)**

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/participant-reminders",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Option C: External cron service**

Use [cron-job.org](https://cron-job.org), [EasyCron](https://www.easycron.com), or similar to hit your cron endpoints hourly with `Authorization: Bearer YOUR_CRON_SECRET` header.

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret!) | `eyJhbGc...` |
| `RESEND_API_KEY` | Resend API key | `re_abc123...` |
| `CRON_SECRET` | Secret for cron endpoint auth | `random-secure-string` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (no trailing slash) | Auto-detected |
| `NEXT_PUBLIC_BRAND_ID` | Force a specific brand (`wardsignup`, `ministrysignup`, `orgsignup`) | Hostname-based |
| `EMAIL_HOURLY_CEILING` | Max notification emails per brand per hour | `100` |
| `RESEND_API_KEY_MINISTRY` | Separate Resend key for Ministry brand | Falls back to `RESEND_API_KEY` |
| `RESEND_API_KEY_ORG` | Separate Resend key for Org brand | Falls back to `RESEND_API_KEY` |
| `ANTHROPIC_API_KEY` | Enable AI event extraction | Not set (feature disabled) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics project key | Not set (analytics disabled) |

## Multi-Brand (Advanced)

WardSignup supports multiple white-labeled brands on the same codebase:
- **Ward Signup** (`wardsignup.com`) — LDS ward focus
- **Ministry Signup** (`ministrysignup.com`) — broader ministry groups
- **Org Signup** (`orgsignup.com`) — generic volunteer coordination

Each brand has its own:
- Color scheme
- Wording ("ward" vs "ministry" vs "organization")
- Email templates

Brand is auto-detected from the hostname. To force a brand in development:

```env
NEXT_PUBLIC_ACTIVE_BRAND=ministrysignup
```

To deploy multiple brands, create separate Vercel projects pointing at different domains, or use a single Supabase project with all domains configured in Auth → Redirect URLs.

## Database Migrations

Migrations live in `supabase/migrations/*.sql`. To add a new migration:

```bash
supabase migration new my_new_feature
# Edit the generated SQL file
supabase db push
```

**Production:** Apply migrations to your cloud Supabase project:

```bash
supabase link --project-ref your-prod-ref
supabase db push
```

Or paste the SQL directly into the Supabase dashboard (**SQL Editor → New Query → Run**).

## Troubleshooting

### "Failed to create event" (Postgres error 42501)

**Cause:** Missing `organization_members` row for the event creator.

**Fix:** Run this migration:
```bash
supabase db push  # ensures 20260501130000_backfill_owner_memberships.sql is applied
```

Or paste `supabase/migrations/20260501130000_backfill_owner_memberships.sql` into the Supabase SQL Editor.

### Magic links not sending

1. Check Resend dashboard → **Logs** for send errors
2. Verify your domain is verified (green checkmark)
3. Check Supabase logs (**Logs → Edge Functions**) for auth errors
4. Ensure `RESEND_API_KEY` is set correctly in Vercel env vars

### "Invalid token" on magic link click

1. Ensure `NEXT_PUBLIC_SITE_URL` matches your actual domain
2. Check Supabase **Authentication → URL Configuration**:
   - Site URL must match your domain
   - Redirect URLs must include `/auth/callback`
3. Token may have expired (magic links last 1 hour)

### Reminders not sending

1. Verify cron job is running (check GitHub Actions logs or Vercel cron logs)
2. Check `CRON_SECRET` matches in both env vars and cron trigger
3. Check Supabase logs for errors in `participant-reminders` endpoint
4. Ensure `RESEND_API_KEY` is set

## Security Checklist

Before going live:

- [ ] **Rotate secrets** — generate new `CRON_SECRET`, rotate Supabase service role key if you ever committed it
- [ ] **Supabase RLS enabled** — all tables have Row-Level Security policies (migrations handle this)
- [ ] **Service role key is secret** — never commit to git, only in Vercel env vars
- [ ] **HTTPS only** — custom domain must have SSL (Vercel handles this automatically)
- [ ] **CRON endpoints secured** — all `/api/cron/*` routes check `Authorization: Bearer CRON_SECRET`
- [ ] **Email rate limits enabled** — `EMAIL_HOURLY_CEILING` is set (default 100/hour/brand)

## Cost Estimate

| Service | Free Tier | Cost After Free |
|---------|-----------|-----------------|
| Supabase | 500 MB database, 2 GB bandwidth, 50 K auth users | ~$25/month (Pro) |
| Resend | 100 emails/day, 1 verified domain | ~$20/month (unlimited emails) |
| Vercel | 100 GB bandwidth, unlimited deployments | ~$20/month (Pro, for cron) |

**Typical small ward:** Stays within free tiers indefinitely.  
**Large ward (500+ members, weekly events):** ~$0-45/month depending on email volume and database size.

## Alternative Hosting

Don't want to use Vercel? WardSignup runs anywhere that supports Next.js:

- **Docker:** Build with `docker build -t wardsignup .` and run with `docker run -p 3000:3000 wardsignup`
- **Railway:** Connect GitHub repo, set env vars, deploy
- **Render:** Same as Railway
- **Self-hosted VPS:** Install Node.js, clone repo, `npm install && npm run build && npm start`

You'll need to set up your own cron jobs for reminders.

## Getting Help

- **Issues/bugs:** [GitHub Issues](https://github.com/jrbondesign/wardsignup/issues)
- **Setup questions:** [GitHub Discussions](https://github.com/jrbondesign/wardsignup/discussions)
- **Community support:** Check existing issues/discussions first — someone may have already solved your problem!

## Next Steps

Once deployed:
1. Sign in at `/login`
2. Create your first event at `/create`
3. Set up sessions at `/setup/[id]`
4. Share the public signup link with your ward/ministry

Welcome to the WardSignup family! 🎉
