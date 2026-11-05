/**
 * Event More sheet (Manage page and dashboard card): grouped actions,
 * delete confirm, dialog focus handling, and the phone action row.
 */
import { useRef, useState } from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import EventActionsSheet, { eventSheetSubtitle, type EventSheetGroup } from "@/components/event-actions/EventActionsSheet";
import DeleteEventConfirm from "@/components/event-actions/DeleteEventConfirm";
import AdminEventActions from "@/components/admin/sections/AdminEventActions";
import type { AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

jest.mock("@/lib/download-qr", () => ({ downloadEventQr: jest.fn(() => Promise.resolve()) }));

const groups = (onCopy = jest.fn()): EventSheetGroup[] => [
  {
    heading: "Edit",
    actions: [
      { key: "edit", label: "Edit event", helper: "Name, dates, times and slots", icon: null, href: "/edit/e1" },
      { key: "settings", label: "Event settings", helper: "Visibility, reminders and Google Calendar", icon: null, href: "/edit/e1#event-settings" },
    ],
  },
  {
    heading: "Share",
    actions: [
      { key: "copy", label: "Copy link", helper: "Send it to your ward by email or text", icon: null, onSelect: onCopy },
      { key: "preview", label: "Preview signup page", helper: "See what ward members see", icon: null, href: "/event/e1" },
    ],
  },
  { heading: "Manage", actions: [] },
];

const DASH = /[\u2010-\u2015]/;

describe("EventActionsSheet", () => {
  it("renders a labelled modal dialog with grouped headings and Delete last", () => {
    render(
      <EventActionsSheet title="Ward Potluck" subtitle="Sunday, June 15 · 5 of 12 spots filled" groups={groups()} onDelete={jest.fn()} onClose={jest.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Ward Potluck" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Sunday, June 15 · 5 of 12 spots filled");

    const edit = screen.getByRole("group", { name: "Edit" });
    expect(within(edit).getByRole("link", { name: /Edit event/ })).toHaveAttribute("href", "/edit/e1");
    expect(within(edit).getByRole("link", { name: /Event settings/ })).toHaveAttribute("href", "/edit/e1#event-settings");
    const share = screen.getByRole("group", { name: "Share" });
    expect(within(share).getByRole("button", { name: /Copy link/ })).toBeInTheDocument();
    // Empty groups are not rendered.
    expect(screen.queryByRole("group", { name: "Manage" })).not.toBeInTheDocument();

    const buttons = within(dialog).getAllByRole("button");
    expect(buttons[buttons.length - 1]).toHaveAccessibleName(/^Delete event/);
    expect(dialog.textContent).not.toMatch(DASH);
    expect(dialog.textContent).not.toMatch(/\bunit\b/i);
  });

  it("runs the action and closes; Delete closes then opens the confirm", () => {
    const onCopy = jest.fn();
    const onDelete = jest.fn();
    const onClose = jest.fn();
    render(<EventActionsSheet title="Ward Potluck" groups={groups(onCopy)} onDelete={onDelete} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Delete event/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and the close button, traps Tab, and returns focus to the trigger", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} onClick={() => setOpen(true)}>More actions for Ward Potluck</button>
          {open && <EventActionsSheet title="Ward Potluck" groups={groups()} onDelete={jest.fn()} onClose={() => setOpen(false)} triggerRef={ref} />}
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "More actions for Ward Potluck" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    // First focusable is the close button.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    // Shift+Tab from the first wraps to the last (Delete event).
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: /Delete event/ })).toHaveFocus();
    // Tab from the last wraps to the first.
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("DeleteEventConfirm", () => {
  it("names the event, offers Keep event and Delete event, and focuses Keep first", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<DeleteEventConfirm eventName="Ward Potluck" onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole("alertdialog", { name: "Delete Ward Potluck?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This deletes every slot, signup and invite for this event. You can't undo this.");
    const keep = screen.getByRole("button", { name: "Keep event" });
    expect(keep).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(keep);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("blocks Keep and Escape while deleting", () => {
    const onCancel = jest.fn();
    render(<DeleteEventConfirm eventName="Ward Potluck" deleting onConfirm={jest.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Keep event" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("eventSheetSubtitle", () => {
  it("formats date and counts", () => {
    expect(eventSheetSubtitle({ ymd: "2026-06-14", isItems: false, filled: 5, total: 12 })).toBe("Sunday, June 14 · 5 of 12 spots filled");
    expect(eventSheetSubtitle({ ymd: null, isItems: true, filled: 3, total: 8 })).toBe("3 of 8 items claimed");
    expect(eventSheetSubtitle({ ymd: null, isItems: false, filled: 40, total: 999 })).toBe("40 signed up");
  });
});

describe("AdminEventActions phone row", () => {
  function makeCtx(overrides: Partial<Record<string, unknown>> = {}) {
    const state = { moreMenuOpen: false };
    const ctx = {
      calendarLastSyncedAt: null,
      calendarSyncEnabled: false,
      coverEnabled: false,
      coverInputRef: { current: null },
      coverPreview: null,
      coverUploading: false,
      coverUrl: null,
      event: { id: "e1", name: "Ward Potluck", description: null, event_date: "2026-06-14", event_dates: [] },
      eventId: "e1",
      eventType: "spots",
      isWardBrand: true,
      items: [],
      moreMenuOpen: false,
      posthog: { capture: jest.fn() },
      sessions: [],
      setMoreMenuOpen: jest.fn(),
      setShowDeleteModal: jest.fn(),
      setShowToast: jest.fn(),
      setToastMessage: jest.fn(),
      shareableLink: "https://wardsignup.com/event/e1",
      totalCapacity: 12,
      totalSignups: 5,
      ...overrides,
    };
    return { ctx: ctx as unknown as AdminEventView, state };
  }

  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.resolve()) } });
  });

  it("shows Copy link, Edit and a labelled 44px More button", () => {
    const { ctx } = makeCtx();
    render(<AdminEventActions ctx={ctx} />);
    const more = screen.getByRole("button", { name: "More actions for Ward Potluck" });
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more.className).toMatch(/\bsize-11\b/);
    expect(more.className).toMatch(/\bml-auto\b/);
    // The phone row's Copy link toasts "Link copied".
    const copyButtons = screen.getAllByRole("button", { name: "Copy link" });
    fireEvent.click(copyButtons[copyButtons.length - 1]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://wardsignup.com/event/e1");
    expect(ctx.setToastMessage).toHaveBeenCalledWith("Link copied");
    fireEvent.click(more);
    expect(ctx.setMoreMenuOpen).toHaveBeenCalled();
  });

  it("opens the grouped sheet with subtitle; Add cover photo only when covers are on and none is set", () => {
    const { ctx } = makeCtx({ moreMenuOpen: true });
    const { rerender } = render(<AdminEventActions ctx={ctx} />);
    const dialog = screen.getByRole("dialog", { name: "Ward Potluck" });
    expect(dialog).toHaveAccessibleDescription("Sunday, June 14 · 5 of 12 spots filled");
    expect(within(dialog).getByRole("group", { name: "Edit" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Share" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Add cover photo")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Duplicate/)).not.toBeInTheDocument();
    for (const label of ["Edit event", "Event settings", "Copy link", "Preview signup page", "Download QR code", "Print flyer", "Delete event"]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }

    const click = jest.fn();
    const withCover = makeCtx({ moreMenuOpen: true, coverEnabled: true, coverInputRef: { current: { click } } }).ctx;
    rerender(<AdminEventActions ctx={withCover} />);
    fireEvent.click(screen.getByRole("button", { name: /Add cover photo/ }));
    expect(click).toHaveBeenCalled();

    const hasCover = makeCtx({ moreMenuOpen: true, coverEnabled: true, coverUrl: "https://x/cover.jpg" }).ctx;
    rerender(<AdminEventActions ctx={hasCover} />);
    expect(screen.queryByText("Add cover photo")).not.toBeInTheDocument();
  });

  it("Delete event in the sheet closes it and opens the delete confirm", () => {
    const { ctx } = makeCtx({ moreMenuOpen: true });
    render(<AdminEventActions ctx={ctx} />);
    act(() => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete event/ }));
    });
    expect(ctx.setMoreMenuOpen).toHaveBeenCalledWith(false);
    expect(ctx.setShowDeleteModal).toHaveBeenCalledWith(true);
  });
});
