# Contributing to WardSignup

Thank you for your interest in contributing to WardSignup! This project helps Latter-day Saint wards, ministries, and other groups coordinate volunteer signups, potlucks, and service events.

## Quick Start

1. **Fork and clone** this repository
2. **Set up your development environment** — see [SELF_HOSTING.md](SELF_HOSTING.md) for Supabase + Resend setup
3. **Create a feature branch** — `git checkout -b feature/your-feature-name`
4. **Make your changes** — follow the code style you see in the project
5. **Test your changes** — run `npm test` and manually test the UI
6. **Submit a pull request** — describe what you changed and why

## Code of Conduct

**Be kind, respectful, and constructive.** WardSignup serves faith communities worldwide. Contributors and maintainers should treat everyone with dignity, assume good intent, and focus on solving problems together.

Unacceptable behavior includes harassment, discrimination, trolling, or any conduct that creates an unwelcoming environment. If you see a problem, reach out to the maintainers privately.

## What We're Looking For

Contributions are welcome in these areas:

- **Bug fixes** — especially around Supabase RLS, email sending, or authentication
- **Localization** — translations for Spanish, Portuguese, French, or other languages
- **Accessibility improvements** — WCAG compliance, screen reader support, keyboard navigation
- **Documentation** — setup guides, troubleshooting tips, architecture notes
- **Tests** — unit tests, integration tests, E2E Playwright tests
- **Performance** — query optimization, caching, bundle size reduction
- **New features** — discuss first in an issue before building something large

## Development Workflow

### Running Locally

```bash
npm install
npm run dev
```

See [SELF_HOSTING.md](SELF_HOSTING.md) for Supabase and Resend configuration.

### Code Style

- **TypeScript** — all new code should be typed
- **Prettier/ESLint** — run `npm run lint` before committing
- **Descriptive names** — prefer clarity over brevity
- **Comments** — only when intent isn't obvious from the code itself

### Testing

- **Unit tests** — Jest for utility functions
- **Integration tests** — API routes, database queries
- **E2E tests** — Playwright for critical user flows (signup, create event, claim item)

Run tests:
```bash
npm test                    # Jest unit tests
npm run test:e2e           # Playwright E2E tests (requires local Supabase)
```

### Pull Request Process

1. **One PR = one feature or fix** — keep changes focused
2. **Write a clear description** — what problem does this solve? How did you test it?
3. **Link related issues** — use "Fixes #123" or "Closes #456"
4. **Expect feedback** — maintainers may request changes or ask questions
5. **Be patient** — reviews happen when maintainers have time (both Jonathan and Ammon have day jobs)

## Maintainers

**Co-stewards:**
- **Jonathan Bond** ([@jrbondesign](https://github.com/jrbondesign)) — original creator, primary maintainer
- **Ammon Curtis** — co-steward (contact details TBD)

### Merge Authority

Either steward can merge PRs and ship fixes independently. For major architectural changes or new features, both stewards should review if possible.

### Who Holds What

- **Domain/DNS** — Jonathan manages wardsignup.com, ministrysignup.com, orgsignup.com
- **Email (Resend)** — Jonathan manages Resend accounts for all brands
- **Supabase** — Jonathan manages the shared Supabase project
- **Vercel** — Jonathan manages Vercel deployments and environment variables
- **GitHub** — Jonathan is the primary GitHub admin; Ammon is a collaborator

If one steward is unavailable for >6 months, the other has authority to make necessary operational decisions (domain renewals, critical bug fixes, etc.).

## Security

**Do not** open public issues for security vulnerabilities. Instead, email Jonathan directly at [jon@jrbond.com](mailto:jon@jrbond.com) with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We'll work with you privately to fix it before public disclosure.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

- **Technical questions** — open a GitHub issue or discussion
- **Stewardship/operational questions** — email Jonathan at [jon@jrbond.com](mailto:jon@jrbond.com)
- **Feature requests** — open a GitHub issue with the `enhancement` label

Thank you for helping make WardSignup better! 🙌
