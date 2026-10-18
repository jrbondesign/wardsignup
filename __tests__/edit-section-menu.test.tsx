/**
 * Phase 2: section menu and desktop matching, using the real components and
 * helpers the editor renders.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ActionMenu from "@/components/ActionMenu";
import MenuStepForm from "@/components/edit/MenuStepForm";
import MenuTrigger from "@/components/edit/MenuTrigger";
import SectionHeader from "@/components/edit/SectionHeader";
import {
  removeSection,
  removeSectionConfirmBody,
  renameSection,
  sessionGroupKey as sectionGroupKey,
  sectionSlotIndices,
} from "@/lib/edit-slot-actions";
import type { EditSession } from "@/lib/edit-session-classes";

function setViewport(width: number, height = 800) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

function anchorButton() {
  const btn = document.createElement("button");
  btn.getBoundingClientRect = () =>
    ({ top: 100, bottom: 144, left: 900, right: 944, width: 44, height: 44, x: 900, y: 100, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(btn);
  return btn;
}

const s = (over: Partial<EditSession>): EditSession => ({
  day_of_week: 4,
  time: "17:00",
  capacity: 4,
  location: "",
  notes: "",
  session_date: "2026-10-08",
  ...over,
});

describe("MenuTrigger", () => {
  it("is a 44px quiet grey three dots button with no red at rest", () => {
    const onOpen = jest.fn();
    render(<MenuTrigger label="Options for Women's Side" onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: "Options for Women's Side" });
    expect(btn).toHaveClass("w-11", "h-11", "text-gray-500");
    expect(btn.className).not.toMatch(/red/);
    expect(btn).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(btn);
  });

  it("does not let the click reach the slot card underneath", () => {
    const cardClick = jest.fn();
    render(
      <div onClick={cardClick}>
        <MenuTrigger label="Options for 5:00 PM" onOpen={jest.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Options for 5:00 PM" }));
    expect(cardClick).not.toHaveBeenCalled();
  });
});

describe("SectionHeader", () => {
  it("shows the section name, its three dots and no red text", () => {
    const onOpenMenu = jest.fn();
    const { container } = render(<SectionHeader name="Women's Side" onOpenMenu={onOpenMenu} />);
    expect(screen.getByText("Women's Side")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Options for Women's Side" });
    expect(btn).toHaveClass("w-11", "h-11");
    expect(container.innerHTML).not.toMatch(/text-red-/);
    expect(screen.queryByText("Duplicate section")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(onOpenMenu).toHaveBeenCalledWith(btn);
  });

  it("shows a shared section location once, truncated", () => {
    render(<SectionHeader name="Men's Side" sharedLocation="Room A, 1155 N Pinal Parkway" onOpenMenu={jest.fn()} />);
    const loc = screen.getByText("Room A, 1155 N Pinal Parkway");
    expect(loc).toHaveClass("truncate");
  });

  it("uses the same right edge padding as the slot cards", () => {
    const { container } = render(<SectionHeader name="Men's Side" onOpenMenu={jest.fn()} />);
    expect(container.firstElementChild).toHaveClass("pr-[17px]", "md:pr-[21px]");
  });
});

describe("Section menu items", () => {
  const items = (spies: Record<string, jest.Mock>) => [
    { label: "Duplicate section", onSelect: spies.dup },
    { label: "Rename section", onSelect: spies.rename, closeOnSelect: false },
    { label: "Remove section", onSelect: spies.remove, tone: "danger" as const },
  ];

  it.each([
    ["mobile sheet", 390],
    ["desktop popover", 1280],
  ])("renders the same three items as a %s, Remove last and red", (_label, width) => {
    setViewport(width);
    const spies = { dup: jest.fn(), rename: jest.fn(), remove: jest.fn() };
    render(<ActionMenu title="Women's Side" items={items(spies)} onClose={jest.fn()} buttonElement={anchorButton()} />);
    const rows = screen.getAllByRole("menuitem");
    expect(rows.map((r) => r.textContent)).toEqual(["Duplicate section", "Rename section", "Remove section"]);
    rows.forEach((r) => expect(r).toHaveClass("min-h-[44px]"));
    expect(rows.filter((r) => /text-red-/.test(r.className))).toEqual([rows[2]]);
    expect(screen.getByRole("menu").className.includes("bottom-0")).toBe(width < 768);
  });
});

describe("Second step (MenuStepForm inside ActionMenu)", () => {
  const step = (onConfirm = jest.fn(), onCancel = jest.fn(), disabled = false) => (
    <MenuStepForm
      title="Rename section"
      helper="Every slot in this section on this day gets the new name."
      confirmLabel="Save"
      confirmDisabled={disabled}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <input aria-label="Section name" defaultValue="Women's Side" />
    </MenuStepForm>
  );

  it("opens as a popover anchored to the button on desktop", () => {
    setViewport(1280);
    render(<ActionMenu title="Rename section" items={[]} onClose={jest.fn()} buttonElement={anchorButton()} secondStepContent={step()} />);
    const dialog = screen.getByRole("dialog", { name: "Rename section" });
    expect(dialog.className).not.toMatch(/bottom-0/);
    expect(dialog.style.width).toBe("320px");
    expect(dialog.style.top).not.toBe("");
  });

  it("opens as a bottom sheet on mobile", () => {
    setViewport(390);
    render(<ActionMenu title="Rename section" items={[]} onClose={jest.fn()} buttonElement={anchorButton()} secondStepContent={step()} />);
    expect(screen.getByRole("dialog", { name: "Rename section" }).className).toMatch(/bottom-0/);
  });

  it("Save and Cancel call their handlers, and submit does not bubble to the editor form", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const outerSubmit = jest.fn((e) => e.preventDefault());
    // A wrapper listening for submit stands in for the editor form (React submit events bubble).
    render(<div onSubmit={outerSubmit}>{step(onConfirm, onCancel)}</div>);
    expect(screen.getByText("Every slot in this section on this day gets the new name.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(outerSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Save is disabled when the field is blank", () => {
    const onConfirm = jest.fn();
    render(step(onConfirm, jest.fn(), true));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("renameSection / removeSection", () => {
  const list = [
    s({ id: "w1", section: "Women's Side" }),
    s({ id: "m1", section: "Men's Side" }),
    s({ id: "w2", section: "Women's Side ", time: "18:00" }),
    s({ id: "w3", section: "Women's Side", session_date: "2026-10-15" }),
    s({ id: "r1", section: "Women's Side", session_date: undefined, day_of_week: 0 }),
  ];
  const day = "2026-10-08";

  it("renames only that section on that day", () => {
    const out = renameSection(list, day, "Women's Side", "Sisters");
    expect(out.map((x) => x.section)).toEqual(["Sisters", "Men's Side", "Sisters", "Women's Side", "Women's Side"]);
  });

  it("renames a recurring weekday section by its dow key", () => {
    const out = renameSection(list, sectionGroupKey(list[4]), "Women's Side", "Sisters");
    expect(sectionGroupKey(list[4])).toBe("dow-0");
    expect(out.map((x) => x.section)).toEqual(["Women's Side", "Men's Side", "Women's Side ", "Women's Side", "Sisters"]);
  });

  it("ignores a blank or unchanged name", () => {
    expect(renameSection(list, day, "Women's Side", "   ")).toBe(list);
    expect(renameSection(list, day, "Women's Side", "Women's Side")).toBe(list);
  });

  it("removes only that section on that day", () => {
    expect(sectionSlotIndices(list, day, "Women's Side")).toEqual([0, 2]);
    expect(removeSection(list, day, "Women's Side").map((x) => x.id)).toEqual(["m1", "w3", "r1"]);
  });

  it("confirm copy names the slot and signup counts", () => {
    expect(removeSectionConfirmBody(2, 3)).toBe("This removes 2 slots and 3 signups in this section. Changes apply when you save.");
    expect(removeSectionConfirmBody(1, 1)).toBe("This removes 1 slot and 1 signup in this section. Changes apply when you save.");
    expect(removeSectionConfirmBody(3, 0)).toBe(
      "This removes the 3 slots in this section. No one has signed up yet, and nothing changes until you save.",
    );
    expect(removeSectionConfirmBody(1, 0)).toBe(
      "This removes the 1 slot in this section. No one has signed up yet, and nothing changes until you save.",
    );
  });
});
