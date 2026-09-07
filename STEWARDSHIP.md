# Stewardship & Governance

How WardSignup is maintained, who makes decisions, and what happens if a steward is unavailable.

## Co-Steward Model

WardSignup uses a **co-steward** model with two primary maintainers who share responsibility for the project's health and direction.

### Current Stewards

- **Jonathan Bond** ([@jrbondesign](https://github.com/jrbondesign))
  - Original creator
  - Primary contact: [jon@jrbond.com](mailto:jon@jrbond.com)
  - Manages: Domain/DNS, Supabase, Resend, Vercel, GitHub admin
  
- **Ammon Curtis** ([@ammon-ai](https://github.com/ammon-ai))
  - Co-steward
  - GitHub: [@ammon-ai](https://github.com/ammon-ai) — collaborator invite **not granted yet** (Jonathan holding)
  - Contact: *(Placeholder — Ammon to provide preferred contact method)*
  - Manages: *(Placeholder — TBD with Ammon)*

## Decision-Making

### Day-to-Day Maintenance

Either steward can:
- Merge pull requests (bug fixes, small features, documentation)
- Ship critical security patches
- Release new versions
- Respond to issues and discussions
- Update dependencies

**Principle:** Trust and autonomy. Both stewards have merge authority and can act independently for routine maintenance.

### Major Decisions

For significant changes, both stewards should review when possible:
- Breaking API changes
- Database schema migrations affecting existing data
- Major feature additions (new signup types, authentication changes, etc.)
- Changes to pricing or hosting strategy
- Changes to licensing or project governance

**Process:** Open an issue or discussion, tag both stewards, give reasonable time for review (72 hours minimum unless urgent).

### Emergency Authority

If a security vulnerability or production outage requires immediate action and one steward is unreachable, the available steward has full authority to:
- Deploy emergency fixes
- Rotate compromised credentials
- Take services offline if necessary to prevent harm

Document the decision and notify the other steward as soon as possible.

## Operational Ownership

### Infrastructure (as of September 2026)

| Asset | Owner | Access |
|-------|-------|--------|
| **Domains** (wardsignup.com, ministrysignup.com, orgsignup.com) | Jonathan | *(TBD: Ammon backup access?)* |
| **DNS** | Jonathan | *(TBD: Ammon backup access?)* |
| **Supabase project** | Jonathan (primary) | *(TBD: Ammon collaborator access?)* |
| **Resend accounts** (3 brands) | Jonathan | *(TBD: Ammon backup access?)* |
| **Vercel project** | Jonathan (owner) | *(TBD: Ammon collaborator access?)* |
| **GitHub repository** | Jonathan (admin) | Ammon — **not granted yet** (Jonathan holding collaborator invites) |
| **GitHub Actions secrets** | Jonathan | *(Both stewards can edit)* |

**Todo:** Grant Ammon collaborator access to Supabase, Vercel, and backup access to domain registrar.

### Who Can Deploy

Both stewards should have:
- Write access to the GitHub repository (**TBD** — Jonathan holding collaborator invites for Ammon)
- Collaborator access to Vercel (deploy previews, manage env vars)
- Collaborator access to Supabase (run migrations, view logs, manage RLS)
- Emergency domain/DNS credentials (password manager share or documented recovery process)

**Current gap:** Ammon may need additional access — this should be resolved before the 90-day public OSS launch.

## Long-Term Availability

### Steward Unavailability (< 6 months)

If one steward is unavailable for a short period (vacation, sabbatical, busy season):
- The other steward continues normal operations
- Non-urgent major decisions can wait until both are available
- Emergency decisions follow the emergency authority process above

### Steward Unavailability (> 6 months)

If one steward is unavailable for >6 months with no expected return date:
- The remaining steward has full authority to make all decisions (including major ones)
- The remaining steward may recruit a new co-steward from trusted contributors
- Operational assets should be transferred or shared to prevent single points of failure

**Operational continuity:**
- Domain renewals must not lapse (auto-renew enabled, backup payment methods)
- Hosting costs must be covered (backup payment method, or remaining steward takes over)
- Critical credentials should be in a shared password manager accessible to both stewards

### Succession Plan

If both stewards become unavailable:
- The project is MIT-licensed — anyone can fork and continue development
- Hosted services (wardsignup.com, etc.) may go offline if hosting costs aren't paid
- Community should be notified via a pinned GitHub issue

**Recommendation:** Set up a "dead man's switch" — if neither steward has logged into GitHub for 12 months, auto-post a pinned issue: "Looking for new maintainer(s)."

## Funding & Hosting Costs

### Current Funding Model

- **Free tier:** Production hosting is currently within Supabase/Resend/Vercel free tiers (zero cost)
- **If costs arise:** Jonathan covers hosting costs personally (as of September 2026)
- **Tip jar:** GitHub Sponsors link in README (optional donations, never required)

### If Hosting Costs Grow

If WardSignup outgrows free tiers (>500 MB database, >100 emails/day, etc.):
1. **First:** Optimize queries, add caching, reduce email volume
2. **Second:** Split costs between stewards (50/50 or by agreement)
3. **Third:** Accept GitHub Sponsors donations to offset costs
4. **Last resort:** Sunset the hosted instance, remain OSS for self-hosters

**Principle:** WardSignup should never become a paid service or require users to pay. Hosting costs are a steward responsibility, optionally supported by voluntary donations.

## Nonprofit Status

**Current status:** No nonprofit entity.

**Rationale (per Jonathan, September 2026):**
- Overhead not justified for current scale
- Complicates taxes, governance, and decision-making
- MIT license + GitHub Sponsors is sufficient for now

**Future:** If the project grows significantly (thousands of wards, substantial hosting costs, full-time maintainer), revisit forming a nonprofit. Requires unanimous agreement from both stewards.

## Code of Conduct Enforcement

Both stewards share responsibility for enforcing the Code of Conduct (see [CONTRIBUTING.md](CONTRIBUTING.md)):
- Either steward can moderate issues/discussions (hide spam, lock unproductive threads)
- For serious violations (harassment, hate speech), both stewards should agree on bans or permanent blocks
- Appeal process: contact the other steward if you believe a moderation action was unfair

## Changes to Governance

This document can be updated by either steward via pull request. For major governance changes (e.g., adding a third steward, changing decision-making rules), both stewards should review and approve.

**Version:** 1.0 (September 2026)  
**Last updated:** 2026-09-06  
**Next review:** 2027-03-06 (6 months)

## Open Questions / Action Items

- [ ] Grant Ammon GitHub collaborator (write) on wardsignup + mvp — currently **on hold** by Jonathan
- [ ] Grant Ammon collaborator access to Vercel
- [ ] Grant Ammon collaborator access to Supabase project
- [ ] Decide on backup domain/DNS access mechanism
- [ ] Set up shared password manager (1Password, Bitwarden, etc.) for critical credentials
- [ ] Document Ammon's preferred contact method
- [ ] Clarify Ammon's operational responsibilities (if different from Jonathan's)
- [ ] Set up auto-renew on domain registrations
- [ ] Consider GitHub Sponsors setup (if tip jar is enabled)

---

**Questions?** Email Jonathan at [jon@jrbond.com](mailto:jon@jrbond.com) or open a discussion on GitHub.
