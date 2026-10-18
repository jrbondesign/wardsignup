/**
 * Timing rules for non urgent mail. Resend's daily quota resets at 00:00 UTC
 * (5pm Phoenix). Non urgent mail sent in the first hours after the reset goes
 * out right away; anything later is queued until 00:05 UTC the next day.
 */
type Env = Record<string, string | undefined>;

/** Hours after 00:00 UTC during which non urgent mail sends immediately. Default 6. */
export function deferSendWindowHours(env: Env = process.env): number {
  const n = Number(env.EMAIL_DEFER_SEND_WINDOW_HOURS);
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : 6;
}

/** EMAIL_DEFER_NON_URGENT=off turns deferral off (sends everything now). */
export function deferEnabled(env: Env = process.env): boolean {
  return env.EMAIL_DEFER_NON_URGENT?.trim().toLowerCase() !== "off";
}

export function inPostResetWindow(now: Date, windowHours: number): boolean {
  const msSinceMidnight =
    now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return msSinceMidnight < windowHours * 60 * 60 * 1000;
}

/** 00:05 UTC on the next UTC day. */
export function nextResetSendAfter(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0),
  );
}
