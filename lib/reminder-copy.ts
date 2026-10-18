/**
 * Customer facing copy that tells creators and signers that reminder emails
 * are automatic (see app/api/cron/participant-reminders/route.ts: about 24h
 * before dated slots, to signers who entered an email).
 */

/** Creator welcome email line. */
export const WELCOME_REMINDERS_LINE =
  "Reminders are automatic. Anyone who adds their email when they sign up gets a reminder before their time.";

/** Note on the creator / manager event page (never shown to signers). */
export const CREATOR_REMINDERS_NOTE = "Reminders go out automatically to everyone who adds an email.";

/** Signer email hint on events that have dated slots (the only ones reminded). */
export const SIGNER_EMAIL_HINT_DATED = "Add your email to get a reminder before your time.";

/** Signer email hint on undated / recurring / items events. Unchanged copy. */
export const SIGNER_EMAIL_HINT_UNDATED =
  "Optional — for updates from the organizer. We never share or sell your info.";

/** Email field hint for the signer form. Reminders only go out for dated slots. */
export function signerEmailHint(sessions: ReadonlyArray<{ session_date?: string | null }>): string {
  return sessions.some((s) => Boolean(s.session_date)) ? SIGNER_EMAIL_HINT_DATED : SIGNER_EMAIL_HINT_UNDATED;
}

/** Whether the creator reminder note applies. Items events have no slots and
 *  get no reminders, so the note would not be true there. */
export function showCreatorRemindersNote(viewerCanManage: boolean, eventType: string): boolean {
  return viewerCanManage && eventType !== "items";
}
