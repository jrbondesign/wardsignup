import { MS_DAY, phoenixDayStartUtc } from "@/lib/phoenix-time";

/**
 * Timing rules for non urgent mail. Our daily email budget resets at midnight
 * Arizona time (00:00 America/Phoenix = 07:00 UTC). Non urgent mail sent in the
 * first hours of the Arizona day goes out right away; anything later is queued
 * until 12:05 AM Arizona the next day, when the email-queue cron drains it.
 *
 * Resend's own quota still resets at 00:00 UTC (5 PM Arizona). That mismatch
 * is handled by the UTC day safety cap in lib/email-deliver.ts, not here.
 */
type Env = Record<string, string | undefined>;

/** Hours after Arizona midnight during which non urgent mail sends immediately. Default 6. */
export function deferSendWindowHours(env: Env = process.env): number {
  const n = Number(env.EMAIL_DEFER_SEND_WINDOW_HOURS);
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : 6;
}

/** EMAIL_DEFER_NON_URGENT=off turns deferral off (sends everything now). */
export function deferEnabled(env: Env = process.env): boolean {
  return env.EMAIL_DEFER_NON_URGENT?.trim().toLowerCase() !== "off";
}

/** True during the first `windowHours` of the Arizona day. */
export function inPostResetWindow(now: Date, windowHours: number): boolean {
  const msSinceMidnight = now.getTime() - phoenixDayStartUtc(now).getTime();
  return msSinceMidnight < windowHours * 60 * 60 * 1000;
}

/** 12:05 AM Arizona on the next Arizona day (07:05 UTC). */
export function nextResetSendAfter(now: Date): Date {
  return new Date(phoenixDayStartUtc(now).getTime() + MS_DAY + 5 * 60 * 1000);
}
