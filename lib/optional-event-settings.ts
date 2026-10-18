import type { CreateFormState } from "@/lib/create-form-state";

export function isVisibilityActive(state: Pick<CreateFormState, "showSignupsPublicly" | "listOnDirectory">): boolean {
  return state.showSignupsPublicly || state.listOnDirectory;
}

export function isNotificationsActive(
  state: Pick<CreateFormState, "organizerDigestEnabled" | "organizerInstantNotifyEnabled">,
): boolean {
  return state.organizerDigestEnabled || state.organizerInstantNotifyEnabled;
}

export function isGoogleCalendarActive(state: Pick<CreateFormState, "calendarSyncEnabled">): boolean {
  return state.calendarSyncEnabled;
}

export function isEventSettingsActive(state: Pick<CreateFormState, "leaderName" | "leaderEmail">): boolean {
  return Boolean(state.leaderName.trim() || state.leaderEmail.trim());
}

export function isRegistrationActive(state: Pick<CreateFormState, "allowGuests" | "showCapacityPublicly">): boolean {
  return state.allowGuests || state.showCapacityPublicly;
}
