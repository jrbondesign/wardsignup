/**
 * Customer facing copy that tells creators and signers that reminder emails
 * are automatic (see app/api/cron/participant-reminders/route.ts: about 24h
 * before dated slots, to signers who entered an email).
 */

/** Creator welcome email line. */
export const WELCOME_REMINDERS_LINE =
  "Reminders are automatic. People who add their email when they sign up get a reminder about a day before their time.";

/** Note on the creator / manager event page (never shown to signers). */
export const CREATOR_REMINDERS_NOTE =
  "Reminders go out automatically, about a day before, to people who add an email.";

/** Signer email hint on events that have dated slots (the only ones reminded). */
export const SIGNER_EMAIL_HINT_DATED =
  "Add your email to get a reminder before your time. We never share or sell your info.";

/** Phrase shown in bold inside the signer email hint (wording unchanged). */
export const SIGNER_EMAIL_HINT_EMPHASIS = "get a reminder";

/**
 * Split hint text around the emphasized phrase so the form can bold it.
 * Text without the phrase comes back as a single plain part.
 */
export function splitEmphasis(
  text: string,
  phrase: string = SIGNER_EMAIL_HINT_EMPHASIS,
): { text: string; emphasis: boolean }[] {
  const at = phrase ? text.indexOf(phrase) : -1;
  if (at < 0) return [{ text, emphasis: false }];
  return [
    { text: text.slice(0, at), emphasis: false },
    { text: phrase, emphasis: true },
    { text: text.slice(at + phrase.length), emphasis: false },
  ].filter((p) => p.text.length > 0);
}

/** Signer email hint on undated / recurring / items events. */
export const SIGNER_EMAIL_HINT_UNDATED =
  "Optional. For updates from the organizer. We never share or sell your info.";

type HintSession = { id: string; session_date?: string | null };

/**
 * Email field hint for the signer form. Reminders only go out for dated slots,
 * so the reminder hint shows only when at least one of the slots being signed
 * up for has a date. With nothing selected yet, falls back to whether the
 * event has any dated slot.
 */
export function signerEmailHint(
  sessions: ReadonlyArray<HintSession>,
  selectedIds: ReadonlyArray<string> = [],
): string {
  const chosen = selectedIds.length > 0 ? sessions.filter((s) => selectedIds.includes(s.id)) : sessions;
  return chosen.some((s) => Boolean(s.session_date)) ? SIGNER_EMAIL_HINT_DATED : SIGNER_EMAIL_HINT_UNDATED;
}

/** Whether the creator reminder note applies. Items events have no slots and
 *  get no reminders, so the note would not be true there. */
export function showCreatorRemindersNote(viewerCanManage: boolean, eventType: string): boolean {
  return viewerCanManage && eventType !== "items";
}
