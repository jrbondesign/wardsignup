import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import TimeInput from "@/components/TimeInput";
import TimeSection from "@/components/create/sections/TimeSection";
import SlotEditor from "@/components/create/SlotEditor";
import {
  INITIAL_FORM_STATE,
  CREATE_EVENT_TIMES_ROW_ID,
  CREATE_SPOTS_TIMES_ROW_ID,
  cleanExtraTimesForSave,
  createSpotsWindowRowId,
  createTimeOrderIssue,
  type CreateFormState,
} from "@/lib/create-form-state";
import { formatTimeRange, isEndNotAfterStart, TIME_ORDER_ERROR } from "@/lib/utils";

const DASHES = /[–—]/;

function st(patch: Partial<CreateFormState>): CreateFormState {
  return { ...INITIAL_FORM_STATE, ...patch };
}

describe("cleanExtraTimesForSave (unlabeled additional times)", () => {
  it("keeps a time with no label, saving an empty label", () => {
    expect(cleanExtraTimesForSave([{ label: "", time: "07:30" }])).toEqual([
      { label: "", time: "07:30" },
    ]);
  });

  it("trims labels and times, keeps labeled rows", () => {
    expect(cleanExtraTimesForSave([{ label: "  Meet at church ", time: " 07:30 " }])).toEqual([
      { label: "Meet at church", time: "07:30" },
    ]);
  });

  it("drops rows with no time (label only or fully blank)", () => {
    expect(
      cleanExtraTimesForSave([
        { label: "Meet at church", time: "" },
        { label: "   ", time: "  " },
      ]),
    ).toEqual([]);
  });
});

describe("isEndNotAfterStart", () => {
  it.each([
    ["10:00", "09:00", true],
    ["10:00", "10:00", true],
    ["10:00", "10:05", false],
    ["10:00", "", false],
    ["", "09:00", false],
    ["10:00", "9am", false],
    ["10:00:00", "09:30:00", true],
  ])("start %s end %s -> %s", (s, e, want) => {
    expect(isEndNotAfterStart(s, e)).toBe(want);
  });
});

describe("createTimeOrderIssue", () => {
  it("flags rsvp/items when end is not after start", () => {
    for (const eventType of ["rsvp", "items"] as const) {
      expect(
        createTimeOrderIssue(st({ eventType, hasTime: true, startTime: "18:00", endTime: "17:00" })),
      ).toEqual({ rowId: CREATE_EVENT_TIMES_ROW_ID });
    }
  });

  it("passes when end is after start, empty, or time is off / plain text", () => {
    expect(createTimeOrderIssue(st({ eventType: "rsvp", hasTime: true, startTime: "18:00", endTime: "19:00" }))).toBeNull();
    expect(createTimeOrderIssue(st({ eventType: "rsvp", hasTime: true, startTime: "18:00", endTime: "" }))).toBeNull();
    expect(createTimeOrderIssue(st({ eventType: "rsvp", hasTime: false, startTime: "18:00", endTime: "17:00" }))).toBeNull();
    expect(
      createTimeOrderIssue(st({ eventType: "rsvp", hasTime: true, approximateTime: true, startTime: "18:00", endTime: "17:00" })),
    ).toBeNull();
  });

  it("skips multi-day rsvp where end can be earlier on a later day", () => {
    expect(
      createTimeOrderIssue(
        st({ eventType: "rsvp", hasTime: true, multiDay: true, date: "2026-11-06", endDate: "2026-11-07", startTime: "18:00", endTime: "09:00" }),
      ),
    ).toBeNull();
  });

  it("flags the spots range and the first bad specific window", () => {
    expect(
      createTimeOrderIssue(st({ eventType: "spots", spotsDateMode: "range", spotsStartTime: "12:00", spotsEndTime: "09:00" })),
    ).toEqual({ rowId: CREATE_SPOTS_TIMES_ROW_ID });
    expect(
      createTimeOrderIssue(
        st({
          eventType: "spots",
          spotsDateMode: "specific",
          spotsPickedDates: [
            { id: "a", date: "2026-11-06", start: "09:00", end: "12:00" },
            { id: "b", date: "2026-11-07", start: "12:00", end: "12:00" },
          ] as CreateFormState["spotsPickedDates"],
        }),
      ),
    ).toEqual({ rowId: createSpotsWindowRowId("b") });
  });
});

describe("TimeInput error prop", () => {
  it("shows the message, marks the selects invalid and describes them", () => {
    render(<TimeInput value="09:00" onChange={() => {}} label="End time" error={TIME_ORDER_ERROR} />);
    const msg = screen.getByText(TIME_ORDER_ERROR);
    for (const part of ["hour", "minute", "AM or PM"]) {
      const sel = screen.getByLabelText(`End time ${part}`);
      expect(sel).toHaveAttribute("aria-invalid", "true");
      expect(sel.getAttribute("aria-describedby")).toContain(msg.id);
    }
  });

  it("renders no error state without the prop", () => {
    render(<TimeInput value="09:00" onChange={() => {}} label="End time" />);
    expect(screen.getByLabelText("End time hour")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(TIME_ORDER_ERROR)).toBeNull();
  });
});

describe("create TimeSection inline order error", () => {
  it("shows the message next to End time when End is before Start", () => {
    render(
      <TimeSection
        state={st({ eventType: "rsvp", hasTime: true, startTime: "18:00", endTime: "17:00" })}
        set={() => {}}
      />,
    );
    expect(screen.getByText(TIME_ORDER_ERROR)).toBeInTheDocument();
    expect(screen.getByLabelText("End time hour")).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(CREATE_EVENT_TIMES_ROW_ID)).not.toBeNull();
  });

  it("stays quiet when End is after Start", () => {
    render(
      <TimeSection
        state={st({ eventType: "rsvp", hasTime: true, startTime: "18:00", endTime: "19:00" })}
        set={() => {}}
      />,
    );
    expect(screen.queryByText(TIME_ORDER_ERROR)).toBeNull();
  });
});

describe("time copy without dashes", () => {
  it("formatTimeRange joins with 'to'", () => {
    const out = formatTimeRange("09:07", "12:00");
    expect(out).toMatch(/ to /);
    expect(out).not.toMatch(DASHES);
  });

  it("SlotEditor empty state has no dash", () => {
    render(<SlotEditor rows={[]} onChange={() => {}} heading="Items" />);
    const el = screen.getByText(/None yet/);
    expect(el.textContent).toContain("None yet. Add one below.");
    expect(el.textContent).not.toMatch(DASHES);
  });

  it.each([
    "app/w/[slug]/page.tsx",
    "app/event/[id]/flyer/page.tsx",
    "components/event/sections/EventHeaderCard.tsx",
    "components/event/sections/SessionsBrowser.tsx",
    "components/event/sections/SingleSessionSignup.tsx",
    "components/event/sections/SignupFormModal.tsx",
    "components/admin/sections/AdminSessionsSignups.tsx",
  ])("%s has no dash time range separator", (file) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src).not.toMatch(/[–—] \$\{(formatTime|fmtTime)\(/);
  });

  it("reschedule summary and apply button have no dashes", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/edit/sections/RescheduleForm.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/will be created [–—]/);
    expect(src).not.toMatch(/Apply [–—]/);
  });
});

describe("public /w page with an unlabeled additional time", () => {
  it("falls back to the formatted time when the label is empty", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/w/[slug]/page.tsx"), "utf8");
    expect(src).toContain("event.event_times[0].label || formatTime(event.event_times[0].time)");
  });
});
