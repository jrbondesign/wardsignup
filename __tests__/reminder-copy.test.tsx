/**
 * Reminder visibility copy: the signer email hint switch (dated vs undated
 * events) and the creator only reminder note on the Manage page.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorRemindersNote from "@/components/CreatorRemindersNote";
import {
  CREATOR_REMINDERS_NOTE,
  SIGNER_EMAIL_HINT_DATED,
  SIGNER_EMAIL_HINT_UNDATED,
  WELCOME_REMINDERS_LINE,
  signerEmailHint,
} from "@/lib/reminder-copy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("reminder copy text", () => {
  it("matches the agreed wording", () => {
    expect(WELCOME_REMINDERS_LINE).toBe(
      "Reminders are automatic. Anyone who adds their email when they sign up gets a reminder before their time.",
    );
    expect(CREATOR_REMINDERS_NOTE).toBe("Reminders go out automatically to everyone who adds an email.");
    expect(SIGNER_EMAIL_HINT_DATED).toBe("Add your email to get a reminder before your time.");
  });

  it("new lines contain no dashes", () => {
    for (const line of [WELCOME_REMINDERS_LINE, CREATOR_REMINDERS_NOTE, SIGNER_EMAIL_HINT_DATED]) {
      expect(line).not.toMatch(/[\u2012\u2013\u2014\u2015-]/);
    }
  });
});

describe("signerEmailHint", () => {
  it("uses the reminder hint when any slot has a date", () => {
    expect(signerEmailHint([{ session_date: "2026-11-01" }])).toBe(SIGNER_EMAIL_HINT_DATED);
    expect(signerEmailHint([{ session_date: null }, { session_date: "2026-11-01" }])).toBe(SIGNER_EMAIL_HINT_DATED);
  });

  it("keeps the current hint for undated or recurring events", () => {
    expect(signerEmailHint([{ session_date: null }, { session_date: null }])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(signerEmailHint([{}])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(signerEmailHint([])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(SIGNER_EMAIL_HINT_UNDATED).toBe("Optional — for updates from the organizer. We never share or sell your info.");
  });

  it("is what the public event page renders in both signup forms", () => {
    const src = read("app/event/[id]/page.tsx");
    expect(src.match(/\{signerEmailHint\(sessions\)\}/g)).toHaveLength(2);
    expect(src).not.toContain("reminder the day before");
  });
});

describe("CreatorRemindersNote", () => {
  it("shows to a confirmed creator or manager on slot events", () => {
    const { rerender } = render(<CreatorRemindersNote viewerCanManage eventType="spots" />);
    expect(screen.getByText(CREATOR_REMINDERS_NOTE)).toBeInTheDocument();
    rerender(<CreatorRemindersNote viewerCanManage eventType="rsvp" />);
    expect(screen.getByText(CREATOR_REMINDERS_NOTE)).toBeInTheDocument();
  });

  it("renders nothing for a viewer who cannot manage the event", () => {
    const { container } = render(<CreatorRemindersNote viewerCanManage={false} eventType="spots" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(CREATOR_REMINDERS_NOTE)).not.toBeInTheDocument();
  });

  it("renders nothing on items events, which get no reminders", () => {
    const { container } = render(<CreatorRemindersNote viewerCanManage eventType="items" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is only wired into the Manage page, behind the access check", () => {
    const manage = read("app/admin/[id]/page.tsx");
    expect(manage).toContain("<CreatorRemindersNote viewerCanManage={viewerCanManage} eventType={eventType} />");
    const accessIdx = manage.indexOf("if (!hasAccess)");
    const grantIdx = manage.indexOf("setViewerCanManage(true)");
    expect(accessIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(accessIdx);

    const publicPage = read("app/event/[id]/page.tsx");
    expect(publicPage).not.toContain("CreatorRemindersNote");
    expect(publicPage).not.toContain(CREATOR_REMINDERS_NOTE);
  });
});
