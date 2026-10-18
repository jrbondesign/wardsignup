import {
  isEventSettingsActive,
  isGoogleCalendarActive,
  isNotificationsActive,
  isRegistrationActive,
  isVisibilityActive,
} from "@/lib/optional-event-settings";

describe("optional event setting active flags", () => {
  it("marks visibility on when the signup list or directory is enabled", () => {
    expect(isVisibilityActive({ showSignupsPublicly: false, listOnDirectory: false })).toBe(false);
    expect(isVisibilityActive({ showSignupsPublicly: true, listOnDirectory: false })).toBe(true);
    expect(isVisibilityActive({ showSignupsPublicly: false, listOnDirectory: true })).toBe(true);
  });

  it("marks notifications on when digest or instant alerts are enabled", () => {
    expect(isNotificationsActive({ organizerDigestEnabled: false, organizerInstantNotifyEnabled: false })).toBe(false);
    expect(isNotificationsActive({ organizerDigestEnabled: true, organizerInstantNotifyEnabled: false })).toBe(true);
    expect(isNotificationsActive({ organizerDigestEnabled: false, organizerInstantNotifyEnabled: true })).toBe(true);
  });

  it("marks Google Calendar on only when sync is enabled", () => {
    expect(isGoogleCalendarActive({ calendarSyncEnabled: false })).toBe(false);
    expect(isGoogleCalendarActive({ calendarSyncEnabled: true })).toBe(true);
  });

  it("marks event settings on when a leader is assigned", () => {
    expect(isEventSettingsActive({ leaderName: "", leaderEmail: "" })).toBe(false);
    expect(isEventSettingsActive({ leaderName: "Bishop", leaderEmail: "" })).toBe(true);
    expect(isEventSettingsActive({ leaderName: "  ", leaderEmail: "lead@example.com" })).toBe(true);
  });

  it("marks registration on when guests or public capacity is enabled", () => {
    expect(isRegistrationActive({ allowGuests: false, showCapacityPublicly: false })).toBe(false);
    expect(isRegistrationActive({ allowGuests: true, showCapacityPublicly: false })).toBe(true);
    expect(isRegistrationActive({ allowGuests: false, showCapacityPublicly: true })).toBe(true);
  });
});
