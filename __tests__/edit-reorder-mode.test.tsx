/**
 * Phase 3: reorder mode. Renders the real ReorderPanel wired to the real
 * reorderStep / reorderSessions helpers the editor uses.
 */
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import ReorderPanel from "@/components/edit/ReorderPanel";
import { reorderSessions, reorderStep } from "@/lib/edit-slot-actions";
import { groupSessionsForDisplay, type EditSession } from "@/lib/edit-session-classes";

const s = (over: Partial<EditSession>): EditSession => ({
  day_of_week: 4,
  time: "17:00",
  capacity: 4,
  location: "",
  notes: "",
  session_date: "2026-10-08",
  ...over,
});

/** Mirrors how app/edit/[id]/page.tsx wires the panel for one day. */
function Harness({ initial, onDone = jest.fn() }: { initial: EditSession[]; onDone?: () => void }) {
  const [sessions, setSessions] = useState(initial);
  const group = groupSessionsForDisplay(sessions)[0];
  return (
    <ReorderPanel
      dayLabel="Thursday, Oct 8"
      rows={group.items.map(({ session, index }, pos) => ({
        key: index,
        name: (session.label ?? "").trim() || session.time,
        section: session.section,
        canMoveUp: reorderStep(group, pos, "up") !== null,
        canMoveDown: reorderStep(group, pos, "down") !== null,
      }))}
      onMove={(pos, dir) => {
        const step = reorderStep(group, pos, dir);
        if (step) setSessions((prev) => reorderSessions(prev, step.fromIndex, step.toIndex));
      }}
      onDone={onDone}
    />
  );
}

const names = () =>
  within(screen.getByRole("list"))
    .getAllByRole("button", { name: / up$/ })
    .map((b) => b.getAttribute("aria-label")!.replace(/^Move | up$/g, ""));

describe("ReorderPanel", () => {
  const three = [s({ label: "Class A" }), s({ label: "Class B" }), s({ label: "Class C" })];

  it("shows the doc's header, helper and Done", () => {
    render(<Harness initial={three} />);
    expect(screen.getByRole("heading", { name: "Reorder slots on Thursday, Oct 8" })).toBeInTheDocument();
    expect(screen.getByText("Move slots up or down. Changes apply when you save.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toHaveClass("min-h-[44px]");
  });

  it("disables the first up and the last down, with 44px targets and named labels", () => {
    render(<Harness initial={three} />);
    expect(screen.getByRole("button", { name: "Move Class A up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Class A down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Class B up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Class C down" })).toBeDisabled();
    screen.getAllByRole("button", { name: /^Move / }).forEach((b) => expect(b).toHaveClass("w-11", "h-11"));
  });

  it("moving updates the display order", () => {
    render(<Harness initial={three} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Class C up" }));
    expect(names()).toEqual(["Class A", "Class C", "Class B"]);
    fireEvent.click(screen.getByRole("button", { name: "Move Class A down" }));
    expect(names()).toEqual(["Class C", "Class A", "Class B"]);
    expect(screen.getByRole("button", { name: "Move Class C up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Class B down" })).toBeDisabled();
  });

  it("keeps moves inside a section and shows section labels", () => {
    render(
      <Harness
        initial={[
          s({ label: "M1", section: "Men's Side" }),
          s({ label: "M2", section: "Men's Side" }),
          s({ label: "W1", section: "Women's Side" }),
          s({ label: "W2", section: "Women's Side" }),
        ]}
      />,
    );
    expect(screen.getByText("Men's Side")).toBeInTheDocument();
    expect(screen.getByText("Women's Side")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move M2 down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move W1 up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move W2 up" }));
    expect(names()).toEqual(["M1", "M2", "W2", "W1"]);
  });

  it("Done exits reorder mode", () => {
    const onDone = jest.fn();
    render(<Harness initial={three} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("reorderSessions", () => {
  it("refuses to move a slot to another day", () => {
    const list = [s({ id: "a" }), s({ id: "b", session_date: "2026-10-15" })];
    expect(reorderSessions(list, 1, 0)).toBe(list);
  });

  it("refuses to move between two different recurring weekdays", () => {
    const list = [s({ id: "a", session_date: undefined, day_of_week: 0 }), s({ id: "b", session_date: undefined, day_of_week: 3 })];
    expect(reorderSessions(list, 1, 0)).toBe(list);
  });

  it("does not mutate the input", () => {
    const list = [s({ id: "a" }), s({ id: "b" })];
    const snap = JSON.stringify(list);
    const out = reorderSessions(list, 1, 0);
    expect(JSON.stringify(list)).toBe(snap);
    expect(groupSessionsForDisplay(out)[0].items.map((i) => i.session.id)).toEqual(["b", "a"]);
  });
});
