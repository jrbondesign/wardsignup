import { INITIAL_FORM_STATE } from "@/lib/create-form-state";

describe("Google Calendar form state", () => {
  it("keeps Google Calendar collapsed by default on create", () => {
    expect(INITIAL_FORM_STATE.expanded.googleCalendar).toBe(false);
    expect(INITIAL_FORM_STATE.calendarSyncEnabled).toBe(false);
  });
});
