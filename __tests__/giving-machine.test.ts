import { getEventTemplate, getTemplatesForBrand } from "@/lib/event-template-data";
import { applyPreset, buildPreset } from "@/lib/event-presets";
import { INITIAL_FORM_STATE } from "@/lib/create-form-state";
import { generateSpotsSessions } from "@/lib/spots-session-generator";
import { safeReturnPath } from "@/lib/auth-return-path";

const DASHES = /[-\u2010-\u2015]/;

const SHIFT_WINDOWS = [
  { start: "10:00", end: "12:00" },
  { start: "12:00", end: "14:00" },
  { start: "14:00", end: "16:00" },
  { start: "16:00", end: "18:00" },
];

describe("Giving Machine template", () => {
  const t = getEventTemplate("giving-machine")!;

  it("is a ward only Scheduled Sessions template", () => {
    expect(t).toBeDefined();
    expect(t.catId).toBe("sessions");
    expect(t.brands).toEqual(["wardsignup"]);
    expect(t.label).toBe("Giving Machine");
    expect(t.defaultName).toBe("Giving Machine");
    expect(t.defaultCoverAsset).toBeUndefined();
    expect(getTemplatesForBrand("wardsignup").some((x) => x.key === "giving-machine")).toBe(true);
  });

  it("prefills Saturday December 12, 2026 with four shifts of 4 people", () => {
    const { patch } = buildPreset("giving-machine");
    expect(patch.eventType).toBe("spots");
    expect(patch.allowGuests).toBe(false);
    expect(patch.spotsDateMode).toBe("specific");
    expect(patch.spotsAutoSplit).toBe(false);
    expect(patch.spotsCapacity).toBe(4);
    expect(patch.spotsPickedDates).toHaveLength(4);
    expect(patch.spotsPickedDates!.map((p) => p.date)).toEqual([
      "2026-12-12",
      "2026-12-12",
      "2026-12-12",
      "2026-12-12",
    ]);
    expect(new Date(`${patch.spotsPickedDates![0].date}T00:00:00`).getDay()).toBe(6);
    expect(patch.spotsPickedDates!.map((p) => ({ start: p.start, end: p.end }))).toEqual(SHIFT_WINDOWS);
    expect(patch).not.toHaveProperty("showSignupsPublicly", true);
  });

  it("generates four editable shift sessions from the preset", () => {
    const state = applyPreset(INITIAL_FORM_STATE, "giving-machine");
    const sessions = generateSpotsSessions(state);
    expect(sessions).toHaveLength(4);
    expect(sessions.map((s) => ({ date: s.session_date, time: s.time, end: s.end_time, capacity: s.capacity }))).toEqual(
      SHIFT_WINDOWS.map((w) => ({
        date: "2026-12-12",
        time: w.start,
        end: w.end,
        capacity: 4,
      })),
    );
  });

  it("template copy has no dashes, ampersands or 'unit', and calls the jobs shifts", () => {
    const copy = [t.label, t.desc, t.defaultName, t.defaultDescription].join("\n");
    expect(copy).not.toMatch(DASHES);
    expect(copy).not.toMatch(/&/);
    expect(copy).not.toMatch(/\bunits?\b/i);
    expect(copy).toMatch(/shifts/i);
    expect(copy).not.toMatch(/official/i);
    expect(copy).not.toMatch(/Church of Jesus Christ/i);
    expect(copy).toMatch(/always free/i);
  });

  it("public start link keeps the template through the login return path", () => {
    const href = "/create?template=giving-machine";
    expect(safeReturnPath(href)).toBe(href);
    expect(`/login?next=${encodeURIComponent(href)}`).toBe(
      "/login?next=%2Fcreate%3Ftemplate%3Dgiving-machine",
    );
  });
});
