import type { PublicBrand } from "./types";

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/**
 * When set, applies to Ward Signup. Prefer unset to use brand.email.*.
 */
export function organizerEmailFrom(brand: PublicBrand): string {
  return env("ORGANIZER_EMAIL_FROM") ?? brand.email.organizerFrom;
}

export function inviteEmailFrom(brand: PublicBrand): string {
  return env("INVITES_EMAIL_FROM") ?? env("ORGANIZER_EMAIL_FROM") ?? brand.email.inviteFrom;
}

export function welcomeEmailFrom(brand: PublicBrand): string {
  return env("WELCOME_EMAIL_FROM") ?? brand.email.welcomeFrom;
}

export function creatorNotifyEmailFrom(brand: PublicBrand): string {
  return env("CREATOR_NOTIFY_FROM") ?? brand.email.creatorNotifyFrom;
}

/**
 * Creator feedback ask + founder feedback digest. Personal-sounding, so it
 * defaults to the brand's welcome address rather than the noreply organizer one.
 */
export function feedbackEmailFrom(brand: PublicBrand): string {
  return env("FEEDBACK_EMAIL_FROM") ?? env("WELCOME_EMAIL_FROM") ?? brand.email.welcomeFrom;
}

/**
 * Magic-link sign-in emails (Resend).
 */
export function magicLinkEmailFrom(brand: PublicBrand): string {
  return env("MAGIC_LINK_EMAIL_FROM") ?? brand.email.organizerFrom;
}

/**
 * Participant signup confirmation + ~24h reminder.
 */
export function participantEmailFrom(brand: PublicBrand): string {
  return env("PARTICIPANT_EMAIL_FROM") ?? brand.email.organizerFrom;
}

/**
 * Per-signup notification to the event's assigned leader.
 */
export function leaderEmailFrom(brand: PublicBrand): string {
  return env("LEADER_EMAIL_FROM") ?? brand.email.organizerFrom;
}
