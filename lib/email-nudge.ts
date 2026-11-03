/**
 * Email nudge experiment (flag `email-capture-next`). Spec:
 * /workspace/reports/email-nudge-experiment-spec.md, locked by Priya Oct 18, 2026.
 *
 * Control: the live #89 form and hint, unchanged.
 * Test: the #89 form plus a one time nudge when a signer submits a dated slot
 * with no email. "Add email" focuses the email field; "Skip" submits right away.
 *
 * Fails closed: no PostHog, flags not loaded, a PostHog error, or any value
 * other than "test" means control, and no exposure is recorded when flags
 * aren't loaded.
 *
 * PRIVACY: nudge events carry ids and the variant only, never the email.
 */

export const EMAIL_NUDGE_FLAG = "email-capture-next";

export type EmailNudgeVariant = "control" | "test";

/** All signer facing copy in one place so it can be swapped. No dashes. */
export const EMAIL_NUDGE_COPY = {
  title: "Want a reminder before your time?",
  body: "Add your email and we'll send one. We never share or sell your info.",
  addButton: "Add email",
  skipButton: "Skip",
} as const;

/** Timing and frequency rules, in one place so they can be swapped. */
export const EMAIL_NUDGE_TIMING = {
  /** When the nudge appears: on submit, before the signup is sent. */
  trigger: "on_submit",
  /** At most this many nudges per signup (per submit flow on one page view). */
  maxPerSignup: 1,
  /** After Skip, never show it again in this browser. */
  rememberSkip: true,
} as const;

export const EMAIL_NUDGE_EVENTS = {
  shown: "email_nudge_shown",
  add: "email_nudge_add",
  skip: "email_nudge_skip",
} as const;

export const EMAIL_NUDGE_SKIP_STORAGE_KEY = "ws_email_nudge_skipped_v1";

type FlagClient = {
  getFeatureFlag?: (key: string) => boolean | string | undefined;
  featureFlags?: { hasLoadedFlags?: boolean };
} | null | undefined;

/**
 * Reads the flag (this call is what sends `$feature_flag_called`, the
 * exposure). Returns null when flags aren't loaded or PostHog throws: treat
 * that as control and record nothing. Call it only on eligible sheets, on
 * signup_form_started.
 */
export function readEmailNudgeVariant(client: FlagClient): EmailNudgeVariant | null {
  try {
    if (!client || typeof client.getFeatureFlag !== "function") return null;
    // Don't call before flags load: that would log an exposure with no value.
    if (client.featureFlags && client.featureFlags.hasLoadedFlags === false) return null;
    const raw = client.getFeatureFlag(EMAIL_NUDGE_FLAG);
    if (raw === undefined || raw === null) return null;
    return raw === "test" ? "test" : "control";
  } catch {
    return null;
  }
}

/** Spots and rsvp sheets only. Items (bring a dish) are excluded. */
export function isEmailNudgeEligibleSheet(sheetType: string): boolean {
  return sheetType === "spots" || sheetType === "rsvp";
}

type NudgeSession = { id: string; session_date?: string | null };

export function hasDatedSlot(sessions: ReadonlyArray<NudgeSession>, selectedIds: ReadonlyArray<string>): boolean {
  return sessions.some((s) => selectedIds.includes(s.id) && Boolean(s.session_date));
}

export function shouldShowEmailNudge(opts: {
  variant: EmailNudgeVariant | null;
  sheetType: string;
  email: string;
  sessions: ReadonlyArray<NudgeSession>;
  selectedIds: ReadonlyArray<string>;
  shownThisSignup: number;
  skippedBefore: boolean;
}): boolean {
  if (opts.variant !== "test") return false;
  if (!isEmailNudgeEligibleSheet(opts.sheetType)) return false;
  if (opts.email.trim() !== "") return false;
  if (!hasDatedSlot(opts.sessions, opts.selectedIds)) return false;
  if (opts.shownThisSignup >= EMAIL_NUDGE_TIMING.maxPerSignup) return false;
  if (EMAIL_NUDGE_TIMING.rememberSkip && opts.skippedBefore) return false;
  return true;
}

type StorageLike = Pick<Storage, "getItem" | "setItem"> | null | undefined;

function browserStorage(): StorageLike {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function hasSkippedEmailNudge(storage: StorageLike = browserStorage()): boolean {
  try {
    return storage?.getItem(EMAIL_NUDGE_SKIP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberEmailNudgeSkip(storage: StorageLike = browserStorage()): void {
  try {
    storage?.setItem(EMAIL_NUDGE_SKIP_STORAGE_KEY, "1");
  } catch {
    // Private mode or storage full: the nudge may show again next time. Fine.
  }
}
