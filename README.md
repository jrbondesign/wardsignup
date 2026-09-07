# WardSignup

**Simple, streamlined volunteer signup and coordination for church wards, ministries, and community groups.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

WardSignup helps coordinate volunteers for teaching, potlucks, service projects, and events. Create an event, add sessions with capacity limits, and share a public signup page — no passwords required for participants.

## ⚠️ Disclaimer

**WardSignup is not affiliated with, endorsed by, or sponsored by The Church of Jesus Christ of Latter-day Saints.**

This is an independent open-source project created by individual members to serve ward and ministry communities worldwide. The Church has no involvement in its development, operation, or maintenance.

## 🚀 Try It Free

**Production hosted instance:** [wardsignup.com](https://wardsignup.com)

No setup required — create an account and start coordinating signups in minutes. The free hosted version includes:
- Magic link authentication (no passwords)
- Unlimited events and signups
- Email invitations and reminders
- Multi-brand support (Ward Signup, Ministry Signup, Org Signup)

## 🛠️ Self-Hosting

Want to run your own instance? See **[SELF_HOSTING.md](SELF_HOSTING.md)** for complete setup instructions.

**Tech stack:**
- **Framework:** Next.js 15 (App Router) + TypeScript
- **Database:** PostgreSQL (via Supabase)
- **Authentication:** Supabase Auth (magic links)
- **Email:** Resend (transactional + notifications)
- **Styling:** Tailwind CSS v4

## ✨ Features

- **Passwordless authentication** — magic link sign-in via email
- **Event management** — create events with multiple sessions, dates, times, locations
- **Capacity tracking** — set volunteer limits per session, real-time availability
- **Public signup pages** — shareable links, no login required for participants
- **Email notifications** — invitations, confirmations, 24-hour reminders
- **Admin dashboard** — real-time signup tracking, organizer reports
- **Multi-brand** — white-label support for ward/ministry/org contexts
- **Items/supplies signup** — optional: potluck dishes, equipment, materials
- **Responsive design** — works on desktop, tablet, mobile

## 📚 Documentation

- **[SELF_HOSTING.md](SELF_HOSTING.md)** — complete self-hosting guide (Supabase, Resend, env vars)
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to contribute, code style, PR process
- **[STEWARDSHIP.md](STEWARDSHIP.md)** — project governance, maintainers, decision-making

## 🤝 Contributing

Contributions are welcome! Whether you're fixing bugs, adding translations, improving accessibility, or building new features — we'd love your help.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

**Quick start:**
```bash
git clone https://github.com/jrbondesign/wardsignup.git
cd wardsignup
npm install
# Copy .env.example to .env.local and configure Supabase + Resend
npm run dev
```

## 💖 Support This Project

WardSignup is free and open-source. If the hosted version at [wardsignup.com](https://wardsignup.com) has helped your ward or ministry, consider supporting hosting costs:

**[Sponsor on GitHub](https://github.com/sponsors/jrbondesign)** *(placeholder — update when GitHub Sponsors enabled)*

Your support helps keep the lights on and development moving forward. Every contribution is appreciated, but never required — WardSignup will always be free.

## 🎯 Roadmap

Potential future enhancements:
- Calendar integration (iCal/Google Calendar export)
- SMS notifications via Twilio
- Recurring events (weekly Sunday School, monthly activities)
- Localization (Spanish, Portuguese, French, etc.)
- Enhanced accessibility (WCAG 2.1 AA compliance)
- Waitlist functionality for full sessions
- Conflict detection (same person, multiple signups)

Have an idea? [Open an issue](https://github.com/jrbondesign/wardsignup/issues) or start a [discussion](https://github.com/jrbondesign/wardsignup/discussions).

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) — React framework
- [Supabase](https://supabase.com/) — PostgreSQL + authentication
- [Resend](https://resend.com/) — transactional email
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [shadcn/ui](https://ui.shadcn.com/) — component primitives

## 📧 Contact

- **Issues/bugs:** [GitHub Issues](https://github.com/jrbondesign/wardsignup/issues)
- **Feature requests:** [GitHub Discussions](https://github.com/jrbondesign/wardsignup/discussions)
- **Security concerns:** Email [jon@jrbond.com](mailto:jon@jrbond.com) privately
- **General questions:** [GitHub Discussions](https://github.com/jrbondesign/wardsignup/discussions)

---

**Stewards:** Jonathan Bond ([@jrbondesign](https://github.com/jrbondesign)), Ammon Curtis ([@ammon-ai](https://github.com/ammon-ai))  
**Status:** Production (actively maintained)  
**Hosted at:** [wardsignup.com](https://wardsignup.com) | [ministrysignup.com](https://ministrysignup.com) | [orgsignup.com](https://orgsignup.com)
