/**
 * Event More sheet (Manage page and dashboard card): grouped actions,
 * delete confirm, dialog focus handling, and the phone action row.
 */
import { useRef, useState } from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import EventActionsSheet, { eventSheetSubtitle, type EventSheetGroup } from "@/components/event-actions/EventActionsSheet";
import DeleteEventConfirm from "@/components/event-actions/DeleteEventConfirm";
import { useDuplicateEvent } from "@/components/event-actions/DuplicateEventModal";
import AdminEventActions from "@/components/admin/sections/AdminEventActions";
import type { AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

jest.mock("@/lib/download-qr", () => ({ downloadEventQr: jest.fn(() => Promise.resolve()) }));
jest.mock("@/lib/auth", () => ({
  ...jest.requireActual("@/lib/auth"),
  createClientComponentClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } }),
}));

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
    // The dialog itself takes focus; Tab goes to the first control.
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
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
    expect(within(dialog).getByRole("group", { name: "Manage" })).toBeInTheDocument();
    for (const label of ["Edit event", "Event settings", "Copy link", "Preview signup page", "Download QR code", "Print flyer", "Duplicate event", "Delete event"]) {
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

  it("orders the sheet Edit, Share, Manage (Duplicate event), divider, Delete event", () => {
    const { ctx } = makeCtx({ moreMenuOpen: true });
    render(<AdminEventActions ctx={ctx} />);
    const dialog = screen.getByRole("dialog", { name: "Ward Potluck" });
    const headings = within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Edit", "Share", "Manage"]);
    const manage = within(dialog).getByRole("group", { name: "Manage" });
    const dup = within(manage).getByRole("button", { name: /Duplicate event/ });
    expect(dup).toHaveTextContent("Copy it to new dates");
    const sep = within(dialog).getByRole("separator");
    const del = within(dialog).getByRole("button", { name: /Delete event/ });
    const share = within(dialog).getByRole("group", { name: "Share" });
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(share, manage)).toBe(true);
    expect(follows(dup, sep)).toBe(true);
    expect(follows(sep, del)).toBe(true);
  });

  it("Duplicate event uses the shared duplicate flow and lands on the new event's edit page", async () => {
    const push = jest.fn();
    const { ctx } = makeCtx({ moreMenuOpen: true, router: { push } });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ event: { id: "new1" } }) })) as unknown as typeof fetch;
    render(<AdminEventActions ctx={ctx} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Duplicate event/ }));
    expect(ctx.setMoreMenuOpen).toHaveBeenCalledWith(false);
    expect(screen.getByText("Duplicate Event")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Copy of Ward Potluck")).toBeInTheDocument();
    expect(screen.getByText(/The original starts 2026-06-14/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/events/e1/duplicate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Copy of Ward Potluck" }) })
    );
    expect((ctx as unknown as { posthog: { capture: jest.Mock } }).posthog.capture).toHaveBeenCalledWith("event_duplicated", { source_event_id: "e1", event_id: "new1" });
    expect(push).toHaveBeenCalledWith("/edit/new1");
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
  describe("#add-cover from the dashboard sheet", () => {
    const setPhone = (phone: boolean) => {
      window.matchMedia = jest.fn().mockReturnValue({ matches: phone }) as unknown as typeof window.matchMedia;
    };
    afterEach(() => window.history.replaceState(null, "", "/"));

    it("opens the More sheet on a phone and clears the hash", () => {
      setPhone(true);
      window.history.replaceState(null, "", "/admin/e1#add-cover");
      const { ctx } = makeCtx({ coverEnabled: true });
      render(<AdminEventActions ctx={ctx} />);
      expect(ctx.setMoreMenuOpen).toHaveBeenCalledWith(true);
      expect(window.location.hash).toBe("");
    });

    it("opens the sheet on desktop too, and closing returns focus to the toolbar Add cover", () => {
      setPhone(false);
      window.history.replaceState(null, "", "/admin/e1#add-cover");
      const base = makeCtx({ coverEnabled: true }).ctx;
      function Stateful() {
        const [open, setOpen] = useState(false);
        return <AdminEventActions ctx={{ ...base, moreMenuOpen: open, setMoreMenuOpen: setOpen } as AdminEventView} />;
      }
      render(<Stateful />);
      const dialog = screen.getByRole("dialog", { name: "Ward Potluck" });
      expect(within(dialog).getByRole("button", { name: /Add cover photo/ })).toBeInTheDocument();
      expect(window.location.hash).toBe("");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add cover" })).toHaveFocus();
    });

    it("clears the hash and does nothing else when the event already has a cover", () => {
      setPhone(true);
      window.history.replaceState(null, "", "/admin/e1#add-cover");
      const { ctx } = makeCtx({ coverEnabled: true, coverUrl: "https://x/cover.jpg" });
      render(<AdminEventActions ctx={ctx} />);
      expect(ctx.setMoreMenuOpen).not.toHaveBeenCalled();
      expect(window.location.hash).toBe("");
    });

    it("clears the hash when the org is not on the cover allowlist", () => {
      setPhone(true);
      window.history.replaceState(null, "", "/admin/e1#add-cover");
      const { ctx } = makeCtx({ coverEnabled: false });
      render(<AdminEventActions ctx={ctx} />);
      expect(ctx.setMoreMenuOpen).not.toHaveBeenCalled();
      expect(window.location.hash).toBe("");
    });
  });

  it("phone row fits 320 to 374: Copy link and Edit shrink, drop icons and use px-3 below 375", () => {
    const { ctx } = makeCtx();
    render(<AdminEventActions ctx={ctx} />);
    const copy = screen.getAllByRole("button", { name: "Copy link" }).pop()!;
    const edit = screen.getAllByRole("link", { name: "Edit" }).pop()!;
    for (const el of [copy, edit]) {
      expect(el.className).toMatch(/\bmin-w-0\b/);
      expect(el.className).toMatch(/\bpx-3\b/);
      expect(el.className).toContain("min-[375px]:px-4");
      const icon = el.querySelector("svg")!;
      expect(icon.getAttribute("class")).toMatch(/\bhidden\b/);
      expect(icon.getAttribute("class")).toContain("min-[375px]:block");
    }
    const more = screen.getByRole("button", { name: "More actions for Ward Potluck" });
    expect(more.className).toMatch(/\bsize-11\b/);
    expect(more.className).toMatch(/\bflex-shrink-0\b/);
  });

  it("phone bottom sheet pads past the iPhone home indicator", () => {
    render(
      <EventActionsSheet title="T" subtitle="S" groups={[]} onDelete={jest.fn()} onClose={jest.fn()} triggerRef={{ current: null }} />
    );
    expect(screen.getByRole("dialog").className).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });
});

const zOf = (el: Element | null) => Number(/(?:^|\s)z-\[(\d+)\]/.exec(el?.getAttribute("class") ?? "")?.[1] ?? 0);
const NAV_Z = 1000; // components/Navigation.tsx sticky nav

describe("Layering above the sticky nav", () => {
  it("sheet scrim and panel, delete confirm and duplicate dialog all sit above the nav", () => {
    const { unmount } = render(
      <EventActionsSheet title="T" subtitle="S" groups={[]} onDelete={jest.fn()} onClose={jest.fn()} triggerRef={{ current: null }} />
    );
    const panel = screen.getByRole("dialog");
    const scrim = panel.previousElementSibling;
    expect(zOf(scrim)).toBeGreaterThan(NAV_Z);
    expect(zOf(panel)).toBeGreaterThan(zOf(scrim));
    unmount();

    const c = render(<DeleteEventConfirm eventName="Ward Potluck" onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(zOf(screen.getByRole("alertdialog").parentElement)).toBeGreaterThan(zOf(panel));
    c.unmount();

    const { ctx } = (() => {
      const push = jest.fn();
      return { ctx: { push } };
    })();
    function Dup() {
      const { openDuplicate, duplicateDialog } = useDuplicateEvent({ router: ctx, posthog: null });
      return (
        <>
          <button type="button" onClick={() => openDuplicate({ id: "e1", name: "Ward Potluck", anchorDate: null })}>open</button>
          {duplicateDialog}
        </>
      );
    }
    render(<Dup />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(zOf(screen.getByRole("dialog", { name: "Duplicate Event" }).parentElement)).toBeGreaterThan(NAV_Z);
  });
});

describe("Duplicate dialog focus", () => {
  it("is a labelled modal dialog, focuses the name, Escape cancels and focus returns", () => {
    function Dup() {
      const { openDuplicate, duplicateDialog } = useDuplicateEvent({ router: { push: jest.fn() }, posthog: null });
      return (
        <>
          <button type="button" onClick={() => openDuplicate({ id: "e1", name: "Ward Potluck", anchorDate: null })}>open</button>
          {duplicateDialog}
        </>
      );
    }
    render(<Dup />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Duplicate Event" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("textbox", { name: "New event name" })).toHaveFocus();
    expect(dialog.textContent).not.toMatch(/[\u2013\u2014]/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("Delete confirm while deleting", () => {
  it("keeps focus on the dialog and Tab cannot leave it", () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    const props = { eventName: "Ward Potluck", onConfirm: jest.fn(), onCancel: jest.fn() };
    const { rerender } = render(<DeleteEventConfirm {...props} />);
    rerender(<DeleteEventConfirm {...props} deleting />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onCancel).not.toHaveBeenCalled();
    outside.remove();
  });
});

describe("useAdminEventState cleanup", () => {
  it("no longer carries the old More popover ref or listeners", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../components/admin/hooks/useAdminEventState.ts"), "utf8");
    expect(src).not.toMatch(/moreMenuRef/);
    expect(src).not.toMatch(/addEventListener\("mousedown"/);
  });
});

