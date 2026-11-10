import {
  APPROXIMATE_PARSE_NOTE,
  EMPTY_APPROXIMATE_TIME_MEMORY,
  formatTimeEnUs,
  parseLooseTime,
  startTimePanelError,
  switchApproximateMode,
  subtreeHasInvalidTimeSelect,
} from "@/lib/utils";

describe("formatTimeEnUs", () => {
  it("formats with fixed en-US AM/PM (not locale-dependent)", () => {
    expect(formatTimeEnUs("18:00")).toBe("6:00 PM");
    expect(formatTimeEnUs("18:00:00")).toBe("6:00 PM");
    expect(formatTimeEnUs("00:05")).toBe("12:05 AM");
    expect(formatTimeEnUs("12:30")).toBe("12:30 PM");
  });
});

describe("parseLooseTime a.m./p.m.", () => {
  it("accepts en-CA style p.m. and a.m.", () => {
    expect(parseLooseTime("6:00 p.m.")).toBe("18:00");
    expect(parseLooseTime("6:00p.m.")).toBe("18:00");
    expect(parseLooseTime("12:30 p.m.")).toBe("12:30");
    expect(parseLooseTime("12:05 a.m.")).toBe("00:05");
    expect(parseLooseTime("9 a.m.")).toBe("09:00");
  });

  it("still accepts compact am/pm", () => {
    expect(parseLooseTime("4:30pm")).toBe("16:30");
    expect(parseLooseTime("9am")).toBe("09:00");
  });

  it("returns null for unparseable approximate phrases", () => {
    expect(parseLooseTime("after the meeting")).toBeNull();
    expect(parseLooseTime("around 9am")).toBeNull();
    expect(parseLooseTime("by lunch")).toBeNull();
    expect(parseLooseTime("dinnertime")).toBeNull();
  });
});

describe("switchApproximateMode", () => {
  it("converts exact to en-US text then restores remembered exact on toggle back", () => {
    let memory = { ...EMPTY_APPROXIMATE_TIME_MEMORY };
    const toApprox = switchApproximateMode({
      toApproximate: true,
      startTime: "18:00:00",
      endTime: "20:00",
      memory,
    });
    expect(toApprox.startTime).toBe("6:00 PM");
    expect(toApprox.endTime).toBe("8:00 PM");
    memory = toApprox.memory;

    const toExact = switchApproximateMode({
      toApproximate: false,
      startTime: toApprox.startTime,
      endTime: toApprox.endTime,
      memory,
    });
    expect(toExact.startTime).toBe("18:00:00");
    expect(toExact.endTime).toBe("20:00");
    expect(toExact.note).toBe("");
  });

  it("keeps unparseable approx text in memory and shows a note when switching to exact", () => {
    let memory = { ...EMPTY_APPROXIMATE_TIME_MEMORY };
    const toExact = switchApproximateMode({
      toApproximate: false,
      startTime: "after the meeting",
      endTime: "by lunch",
      memory,
    });
    expect(toExact.startTime).toBe("");
    expect(toExact.endTime).toBe("");
    expect(toExact.note).toBe(APPROXIMATE_PARSE_NOTE);
    expect(toExact.note).toMatch(/\.$/);
    expect(toExact.note).not.toMatch(/[\u2013\u2014]/);
    memory = toExact.memory;

    const back = switchApproximateMode({
      toApproximate: true,
      startTime: "",
      endTime: "",
      memory,
    });
    expect(back.startTime).toBe("after the meeting");
    expect(back.endTime).toBe("by lunch");
  });

  it("uses a newer text edit that parses instead of the remembered exact time", () => {
    const toApprox = switchApproximateMode({
      toApproximate: true,
      startTime: "19:00",
      endTime: "21:00:00",
      memory: { ...EMPTY_APPROXIMATE_TIME_MEMORY },
    });
    expect(toApprox.startTime).toBe("7:00 PM");
    const toExact = switchApproximateMode({
      toApproximate: false,
      startTime: "8pm",
      endTime: toApprox.endTime,
      memory: toApprox.memory,
    });
    expect(toExact.startTime).toBe("20:00");
    // Untouched end keeps the saved value exactly, seconds included.
    expect(toExact.endTime).toBe("21:00:00");
    expect(toExact.note).toBe("");
  });

  it("keeps the remembered exact time and shows the note when the edit does not parse", () => {
    const toApprox = switchApproximateMode({
      toApproximate: true,
      startTime: "19:00",
      endTime: "",
      memory: { ...EMPTY_APPROXIMATE_TIME_MEMORY },
    });
    const toExact = switchApproximateMode({
      toApproximate: false,
      startTime: "after dinner",
      endTime: "",
      memory: toApprox.memory,
    });
    expect(toExact.startTime).toBe("19:00");
    expect(toExact.note).toBe(APPROXIMATE_PARSE_NOTE);
    const back = switchApproximateMode({
      toApproximate: true,
      startTime: toExact.startTime,
      endTime: toExact.endTime,
      memory: toExact.memory,
    });
    expect(back.startTime).toBe("after dinner");
  });

  it("shows a newly picked time instead of the old plain text", () => {
    const toApprox = switchApproximateMode({
      toApproximate: true,
      startTime: "19:00",
      endTime: "21:00",
      memory: { ...EMPTY_APPROXIMATE_TIME_MEMORY },
    });
    const toExact = switchApproximateMode({
      toApproximate: false,
      startTime: "8pm",
      endTime: toApprox.endTime,
      memory: toApprox.memory,
    });
    expect(toExact.startTime).toBe("20:00");
    // User then picks 9 PM for Start and leaves End alone.
    const again = switchApproximateMode({
      toApproximate: true,
      startTime: "21:00",
      endTime: toExact.endTime,
      memory: toExact.memory,
    });
    expect(again.startTime).toBe("9:00 PM");
    expect(again.endTime).toBe("9:00 PM");
  });

  it("restores the old plain text when the picked time is unchanged", () => {
    const toExact = switchApproximateMode({
      toApproximate: false,
      startTime: "around 8pm",
      endTime: "by lunch",
      memory: { ...EMPTY_APPROXIMATE_TIME_MEMORY },
    });
    const back = switchApproximateMode({
      toApproximate: true,
      startTime: toExact.startTime,
      endTime: toExact.endTime,
      memory: toExact.memory,
    });
    expect(back.startTime).toBe("around 8pm");
    expect(back.endTime).toBe("by lunch");
  });

  it("parses en-CA style text when there is no remembered exact", () => {
    const result = switchApproximateMode({
      toApproximate: false,
      startTime: "6:00 p.m.",
      endTime: "8:00 p.m.",
      memory: { ...EMPTY_APPROXIMATE_TIME_MEMORY },
    });
    expect(result.startTime).toBe("18:00");
    expect(result.endTime).toBe("20:00");
    expect(result.note).toBe("");
  });
});

describe("startTimePanelError", () => {
  it("prefers the partial message over empty", () => {
    expect(startTimePanelError("", true)).toBe(
      "Finish choosing hour, minute, and AM or PM.",
    );
    expect(startTimePanelError("19:00", true)).toBe(
      "Finish choosing hour, minute, and AM or PM.",
    );
  });

  it("reports empty start when not partial", () => {
    expect(startTimePanelError("", false)).toBe("Choose a start time.");
    expect(startTimePanelError("   ", false)).toBe("Choose a start time.");
    expect(startTimePanelError("", false, "appointment")).toBe("Choose a start time for this appointment.");
    expect(startTimePanelError("", false, "shift")).toBe("Choose a start time for this shift.");
  });

  it("returns null when start is complete", () => {
    expect(startTimePanelError("19:00", false)).toBeNull();
  });
});

describe("subtreeHasInvalidTimeSelect", () => {
  it("detects data-time-partial for incomplete panel times", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-time-partial="true"></div>`;
    expect(subtreeHasInvalidTimeSelect(root)).toBe(true);
  });

  it("is false when nothing is incomplete", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div role="group"></div>`;
    expect(subtreeHasInvalidTimeSelect(root)).toBe(false);
    expect(subtreeHasInvalidTimeSelect(null)).toBe(false);
  });
});
