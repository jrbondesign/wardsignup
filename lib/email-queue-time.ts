import { MS_DAY, phoenixDayStartUtc } from "@/lib/phoenix-time";

/**
 * Timing rules for queued mail.
 *
 * Near real time mail (welcome, new creator notice, feedback received) is not
 * held: it sends right away. Only if Resend is out of budget AND Brevo can't
 * take it is it queued, due immediately, for the hourly email-queue drain
 * (vercel.json "7 * * * *").
 *
 * Batch mail (digests, feedback asks, the weekly summary). Our daily email budget resets at midnight
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

/**
 * Kinds that must go out promptly. They are never held for 12:05 AM; when
 * they have to queue they are due at once, and the drain sends them first.
 */
export const REALTIME_KINDS = ["welcome", "new_creator", "feedback_response"] as const;

export function isRealtimeKind(kind: string | null | undefined): boolean {
  return (REALTIME_KINDS as readonly string[]).includes(kind ?? "");
}

/** Attempts the drain makes for a queued email before marking it failed. */
export const MAX_QUEUE_ATTEMPTS = 3;

/**
 * When a near real time row may be retried after a failed attempt (Brevo
 * refused or errored). The drain runs hourly at :07, so:
 * after attempt 1, the next run (about 1 hour); after attempt 2, wait about
 * 2 hours (115 minutes so cron jitter can't push it a further hour). After
 * attempt 3 the row is failed and never retried.
 */
export function realtimeRetrySendAfter(now: Date, attemptsMade: number): Date {
  const minutes = attemptsMade >= 2 ? 115 : 0;
  return new Date(now.getTime() + minutes * 60 * 1000);
}
