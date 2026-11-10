/**
 * QA follow-ups for overnight ranges (PR #141): signup-success calendar
 * fallback, multi-day sync span, "(next day)" consistency, calendar marks for
 * an overnight slot from yesterday, tithing window guards, and no-wrap suffix.
 */
import { act, render, screen } from "@testing-library/react";
import SignupSuccessPage from "@/app/signup-success/[token]/page";
import RescheduleForm from "@/components/edit/sections/RescheduleForm";
import type { EditEventCtx } from "@/components/edit/hooks/useEditEvent";
import { saveSignupSuccessInfo, type SignupSuccessInfo } from "@/lib/signup-success-handoff";
import { hasSignupCalendar, signupGoogleCalendarUrl, signupIcs } from "@/lib/signup-success-calendar";
import { googleDateTimesForSession } from "@/lib/google-calendar-sync-format";
import { buildVeventLines } from "@/lib/ics";
import { formatSessionSlotLabel } from "@/lib/slot-label";
import { buildOrganizerMetricsEmailHtml } from "@/lib/organizer-email";
import { sessionCalendarMarks } from "@/lib/session-calendar-marks";
import { getBrandFromHost } from "@/lib/brand/resolve";
import {
  formatTimeRange,
  NEXT_DAY_SUFFIX,
  nextDaySuffix,
  spansMultipleDays,
  TITHING_END_REQUIRED_ERROR,
  tithingWindowError,
  tithingWindowTooShortError,
} from "@/lib/utils";

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-qa" }),
  useSearchParams: () => new URLSearchParams("event=camp-1"),
}));
jest.mock("posthog-js/react", () => ({ usePostHog: () => null }));

const baseInfo: SignupSuccessInfo = {
  member_name: "Jane",
  guest_names: [],
  campaign_name: "Youth dance",
  slot_label: "Fri, Nov 20, 2026",
  event_url: "https://x.test/e",
  session_date: "2026-11-20",
  session_time: "22:00",
  session_end_time: "01:00",
  event_timezone: "America/Phoenix",
  event_end_date: null,
} as SignupSuccessInfo;

describe("1. signup-success calendar buttons", () => {
  it("plain-text time falls back to an all-day event on that date", () => {
    const info = { ...baseInfo, session_time: "around 7pm", session_end_time: null };
    expect(hasSignupCalendar(info)).toBe(true);
    expect(new URL(signupGoogleCalendarUrl(info)).searchParams.get("dates")).toBe("20261120/20261121");
    const ics = signupIcs(info)!;
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("DTEND;VALUE=DATE:20261121");
    expect(ics).not.toContain("RRULE");
  });

  it("plain-text multi-day event spans every day (end date is exclusive)", () => {
    const info = { ...baseInfo, session_time: null, session_end_time: null, event_end_date: "2026-11-22" };
    expect(new URL(signupGoogleCalendarUrl(info)).searchParams.get("dates")).toBe("20261120/20261123");
    expect(signupIcs(info)).toContain("DTEND;VALUE=DATE:20261123");
  });

  it("exact times keep timed links; no date means no calendar", () => {
    expect(hasSignupCalendar(baseInfo)).toBe(true);
    expect(signupIcs(baseInfo)).toContain("DTEND;TZID=America/Phoenix:20261121T010000");
    const noDate = { ...baseInfo, session_date: null };
    expect(hasSignupCalendar(noDate)).toBe(false);
    expect(signupGoogleCalendarUrl(noDate)).toBe("");
  });

  describe("page", () => {
    beforeEach(() => {
      sessionStorage.clear();
      global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    });

    it("renders a working Google link for a plain-text time", () => {
      saveSignupSuccessInfo("tok-qa", { ...baseInfo, session_time: "7pm", session_end_time: null });
      render(<SignupSuccessPage />);
      const google = screen.getByRole("link", { name: /Google/ });
      expect(google.getAttribute("href")).toMatch(/^https:\/\/calendar\.google\.com\/.*dates=20261120%2F20261121/);
      expect(screen.getByRole("button", { name: /Apple/ })).toBeInTheDocument();
    });

    it("hides the block when there is no date", () => {
      saveSignupSuccessInfo("tok-qa", { ...baseInfo, session_date: null, session_time: null });
      render(<SignupSuccessPage />);
      expect(screen.queryByText("Add to calendar")).toBeNull();
      expect(screen.queryByRole("link", { name: /Google/ })).toBeNull();
    });
  });
});

describe("2. Google Calendar sync span matches the .ics", () => {
  it("multi-day overnight syncs from the first day's start to the last day's end", () => {
    const session = { session_date: "2026-11-20", time: "18:00:00", end_time: "09:00:00" };
    expect(googleDateTimesForSession(session, "2026-11-22")).toEqual({
      startDateTime: "2026-11-20T18:00:00",
      endDateTime: "2026-11-22T09:00:00",
    });
    const ics = buildVeventLines({
      session,
      campaignName: "Campout",
      eventUrl: "https://x.test/e",
      timezone: null,
      campaignEventEndDate: "2026-11-22",
    });
    expect(ics).toContain("DTEND:20261122T090000");
  });

  it("without an event end date it still ends the next day", () => {
    expect(googleDateTimesForSession({ session_date: "2026-11-20", time: "22:00", end_time: "01:00" }, null).endDateTime).toBe(
      "2026-11-21T01:00:00",
    );
  });
});

describe('3. "(next day)" is left out for multi-day RSVPs', () => {
  const sess = { day_of_week: 5, time: "18:00", end_time: "09:00", session_date: "2026-11-20" };

  it("helpers", () => {
    expect(spansMultipleDays("2026-11-20", "2026-11-22")).toBe(true);
    expect(spansMultipleDays("2026-11-20", "2026-11-20")).toBe(false);
    expect(spansMultipleDays("2026-11-20", null)).toBe(false);
    expect(nextDaySuffix("18:00", "09:00", { multiDay: true })).toBe("");
    expect(formatTimeRange("18:00", "09:00", { multiDay: true })).not.toMatch(/next/);
  });

  it("email slot labels", () => {
    expect(formatSessionSlotLabel(sess, { eventTimezone: "America/Phoenix", eventEndDate: "2026-11-22" })).not.toMatch(/next/);
    expect(formatSessionSlotLabel(sess, { eventTimezone: "America/Phoenix", eventEndDate: null })).toContain(NEXT_DAY_SUFFIX);
  });

  it("organizer email roster", () => {
    const row = { id: "s1", ...sess, location: null, notes: null, label: null, capacity: 5, signups: [] };
    const args = {
      brand: getBrandFromHost("wardsignup.com"),
      campaignName: "Campout",
      eventUrl: "https://x.test/e",
      adminUrl: "https://x.test/a",
      totalCapacity: 5,
      totalSignups: 0,
      remaining: 5,
      fillPct: 0,
      sessions: [row],
      headline: "Update",
      eventTimezone: "America/Phoenix",
    } as unknown as Parameters<typeof buildOrganizerMetricsEmailHtml>[0];
    expect(buildOrganizerMetricsEmailHtml({ ...args, eventEndDate: "2026-11-22" })).not.toMatch(/next(\u00A0|&nbsp;| )day/);
    expect(buildOrganizerMetricsEmailHtml(args)).toMatch(/next(\u00A0|&nbsp;| )day/);
  });
});

describe("4. calendar view marks an overnight slot from yesterday", () => {
  const today = new Date(2026, 10, 21, 0, 30); // Sat Nov 21, 12:30 AM
  const s = (session_date: string, time: string, end_time: string | null) => ({
    session_date,
    day_of_week: 0,
    time,
    end_time,
    capacity: 2,
  });

  it("keeps yesterday marked while its overnight slot runs, not a same-day one", () => {
    const { sessionDays, availableDays } = sessionCalendarMarks(
      [s("2026-11-20", "22:00", "01:00"), s("2026-11-19", "09:00", "10:00"), s("2026-11-21", "09:00", "10:00")],
      2026,
      10,
      today,
      () => 0,
    );
    expect([...sessionDays].sort()).toEqual([20, 21]);
    expect(availableDays.has(20)).toBe(true);
  });

  it("drops it once it has fully ended", () => {
    const { sessionDays } = sessionCalendarMarks([s("2026-11-20", "22:00", "01:00")], 2026, 10, new Date(2026, 10, 22), () => 0);
    expect(sessionDays.size).toBe(0);
  });
});

describe("5 and 6. tithing window guards", () => {
  it("messages for each blocked window", () => {
    expect(tithingWindowError("09:00", "09:00", 15)).toBe("End time can't be the same as start time.");
    expect(tithingWindowError("21:00", "01:00", 15)).toMatch(/past midnight/);
    expect(tithingWindowError("09:00", "", 15)).toBe(TITHING_END_REQUIRED_ERROR);
    expect(tithingWindowError("09:00", "09:10", 15)).toBe(tithingWindowTooShortError(15));
    expect(tithingWindowError("09:00", "09:15", 15)).toBeNull();
    expect(tithingWindowError("", "", 15)).toBeNull(); // Start time check handles it
  });

  const ctx = (patch: Record<string, unknown>) =>
    ({
      error: "",
      applyReschedule: jest.fn(),
      customDuration: "",
      isTithingReschedule: true,
      rescheduleCapacity: 1,
      rescheduleCapacityDraft: undefined,
      rescheduleDays: [],
      rescheduleStart: new Date(2026, 10, 16),
      rescheduleEnd: new Date(2026, 10, 22),
      rescheduleEndTime: "12:00",
      rescheduleLocation: "",
      rescheduleNotes: "",
      rescheduleTime: "09:00",
      sessions: [],
      setCustomDuration: jest.fn(),
      setRescheduleCapacity: jest.fn(),
      setRescheduleCapacityDraft: jest.fn(),
      setRescheduleEnd: jest.fn(),
      setRescheduleEndTime: jest.fn(),
      setRescheduleLocation: jest.fn(),
      setRescheduleNotes: jest.fn(),
      setRescheduleStart: jest.fn(),
      setRescheduleTime: jest.fn(),
      setShowReschedule: jest.fn(),
      setTithingCapacity: jest.fn(),
      setTithingCapacityDraft: jest.fn(),
      setTithingDuration: jest.fn(),
      showReschedule: true,
      tithingCapacity: 1,
      tithingCapacityDraft: undefined,
      tithingDays: [0],
      tithingDuration: 15,
      toggleRescheduleDay: jest.fn(),
      toggleTithingDay: jest.fn(),
      ...patch,
    }) as unknown as EditEventCtx;
  const apply = () => screen.getByRole("button", { name: /^Apply/ });
  // The date picker loads lazily; let it settle inside act.
  const renderForm = async (c: EditEventCtx) => {
    await act(async () => {
      render(<RescheduleForm ctx={c} />);
    });
  };

  it("valid window: Apply is enabled with the appointment count", async () => {
    await renderForm(ctx({}));
    expect(apply()).toHaveTextContent("Apply: 12 appointments");
    expect(apply()).toBeEnabled();
  });

  it.each([
    ["equal", "09:00", "End time can't be the same as start time."],
    ["overnight", "01:00", "Appointment hours can't run past midnight. Pick an end time after the start time."],
    ["empty end", "", TITHING_END_REQUIRED_ERROR],
    ["too short", "09:10", tithingWindowTooShortError(15)],
  ])("%s end: inline message and Apply disabled", async (_name, end, message) => {
    await renderForm(ctx({ rescheduleEndTime: end }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(apply()).toBeDisabled();
  });

  it("0 slots (no chosen day in range) keeps Apply disabled", async () => {
    await renderForm(ctx({ rescheduleStart: new Date(2026, 10, 16), rescheduleEnd: new Date(2026, 10, 17), tithingDays: [5] }));
    expect(apply()).toHaveTextContent("Apply: 0 appointments");
    expect(apply()).toBeDisabled();
  });
});

describe('7. "(next day)" does not wrap mid-phrase', () => {
  it("uses a no-break space inside the phrase", () => {
    expect(NEXT_DAY_SUFFIX).toBe(" (next\u00A0day)");
    expect(formatTimeRange("22:00", "01:00").endsWith("(next\u00A0day)")).toBe(true);
  });
});

