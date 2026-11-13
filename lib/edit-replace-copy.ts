/** Neutral "slot" copy for a staged Replace all on the Edit page. */

export function slotWord(count: number): string {
  return count === 1 ? "slot" : "slots";
}

export function stagedReplaceBanner(count: number): string {
  return count === 1
    ? "Not saved yet. Save to make this 1 slot live."
    : `Not saved yet. Save to make these ${count} slots live.`;
}

export function saveSlotsButtonLabel(count: number): string {
  return `Save ${count} ${slotWord(count)}`;
}

export function savedSlotsToast(count: number): string {
  return count === 1
    ? "Saved. 1 slot is live."
    : `Saved. ${count} slots are live.`;
}
