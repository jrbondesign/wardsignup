import { isLocalDevelopment } from "@/lib/runtime-env";

const DEV_NOTIFY_FALLBACK = "jon@jrbond.com";
const DEV_REPLY_FALLBACK = "jonathan@wardsignup.com";

/** Founder/ops inbox. Production requires CREATOR_NOTIFY_TO; no personal default. */
export function creatorNotifyAddress(): string | null {
  const fromEnv = process.env.CREATOR_NOTIFY_TO?.trim();
  if (fromEnv) return fromEnv;
  if (isLocalDevelopment()) return DEV_NOTIFY_FALLBACK;
  return null;
}

/** Welcome Reply-To. Production requires WELCOME_REPLY_TO. */
export function welcomeReplyAddress(): string | null {
  const fromEnv = process.env.WELCOME_REPLY_TO?.trim();
  if (fromEnv) return fromEnv;
  if (isLocalDevelopment()) return DEV_REPLY_FALLBACK;
  return null;
}
