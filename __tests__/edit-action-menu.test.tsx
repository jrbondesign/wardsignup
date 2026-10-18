/**
 * Exercises the real shared ActionMenu used by the editor's day and slot menus
 * (and, through SignupOptionsMenu, the Manage page).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ActionMenu, { type ActionMenuItem } from "@/components/ActionMenu";
import SignupOptionsMenu from "@/components/SignupOptionsMenu";

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

const dayItems = (spies: { change: jest.Mock; dup: jest.Mock; remove: jest.Mock }): ActionMenuItem[] => [
  { label: "Change date", onSelect: spies.change, closeOnSelect: false },
  { label: "Duplicate day", onSelect: spies.dup, closeOnSelect: false },
  { label: "Remove day", onSelect: spies.remove, tone: "danger" },
];

describe("ActionMenu", () => {
  it("renders a bottom sheet with 44px rows and a Cancel row under 768px", () => {
    setViewport(390);
    const spies = { change: jest.fn(), dup: jest.fn(), remove: jest.fn() };
    render(<ActionMenu title="Thursday, Oct 8, 2026" items={dayItems(spies)} onClose={jest.fn()} buttonElement={anchorButton()} />);

    const menu = screen.getByRole("menu", { name: "Thursday, Oct 8, 2026" });
    expect(menu.className).toMatch(/bottom-0/);
    const rows = screen.getAllByRole("menuitem");
    expect(rows.map((r) => r.textContent)).toEqual(["Change date", "Duplicate day", "Remove day"]);
    rows.forEach((r) => expect(r).toHaveClass("min-h-[44px]"));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-[44px]");
  });

  it("renders a desktop popover whose rows are at least 44px tall", () => {
    setViewport(1280);
    const spies = { change: jest.fn(), dup: jest.fn(), remove: jest.fn() };
    render(<ActionMenu title="Women's Class" items={dayItems(spies)} onClose={jest.fn()} buttonElement={anchorButton()} />);

    const menu = screen.getByRole("menu", { name: "Women's Class" });
    expect(menu.className).not.toMatch(/bottom-0/);
    screen.getAllByRole("menuitem").forEach((r) => {
      expect(r).toHaveClass("min-h-[44px]");
      expect(r.className).not.toMatch(/min-h-\[36px\]/);
    });
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("only the destructive item is red, and it is last", () => {
    setViewport(390);
    const spies = { change: jest.fn(), dup: jest.fn(), remove: jest.fn() };
    render(<ActionMenu title="Day" items={dayItems(spies)} onClose={jest.fn()} buttonElement={anchorButton()} />);
    const rows = screen.getAllByRole("menuitem");
    const red = rows.filter((r) => /text-red-/.test(r.className));
    expect(red).toEqual([rows[rows.length - 1]]);
  });

  it("closeOnSelect false runs the action without closing (second step)", () => {
    setViewport(390);
    const onClose = jest.fn();
    const spies = { change: jest.fn(), dup: jest.fn(), remove: jest.fn() };
    render(<ActionMenu title="Day" items={dayItems(spies)} onClose={onClose} buttonElement={anchorButton()} />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Change date" }));
    expect(spies.change).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate day" }));
    expect(spies.dup).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("default items close the menu and run their action", () => {
    setViewport(1280);
    const onClose = jest.fn();
    const spies = { change: jest.fn(), dup: jest.fn(), remove: jest.fn() };
    render(<ActionMenu title="Day" items={dayItems(spies)} onClose={onClose} buttonElement={anchorButton()} />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Remove day" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(spies.remove).toHaveBeenCalledTimes(1);
  });

  it("shows second step content in place of the items", () => {
    setViewport(390);
    render(
      <ActionMenu
        title="Change date"
        items={[]}
        onClose={jest.fn()}
        buttonElement={anchorButton()}
        secondStepContent={<p>Every slot on this day moves to the new date.</p>}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Change date" })).toBeInTheDocument();
    expect(screen.getByText("Every slot on this day moves to the new date.")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("Escape closes the menu", () => {
    setViewport(390);
    const onClose = jest.fn();
    render(<ActionMenu title="Day" items={[{ label: "Edit slot", onSelect: jest.fn() }]} onClose={onClose} buttonElement={anchorButton()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("SignupOptionsMenu keeps its old props working through ActionMenu", () => {
    setViewport(390);
    const onRemove = jest.fn();
    const onClose = jest.fn();
    render(
      <SignupOptionsMenu memberName="Ann" contextLabel="the 5:00 PM slot" onRemove={onRemove} onClose={onClose} buttonElement={anchorButton()} />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from the 5:00 PM slot" }));
    expect(onClose).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });
});
