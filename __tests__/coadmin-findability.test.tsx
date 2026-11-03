/**
 * Co-admin findability (Dana's doc): Leader helper line, FAQ path, settings anchor.
 */
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import EventSettingsSection from "@/components/create/sections/EventSettingsSection";
import { INITIAL_FORM_STATE } from "@/lib/create-form-state";

const HELPER =
  "The leader gets emails only. To let someone help manage this event, add them as a co-admin.";

function noDashes(text: string) {
  expect(text).not.toContain("\u2014");
  expect(text).not.toContain("\u2013");
  expect(text).not.toContain(" - ");
}

describe("Leader field co-admin helper", () => {
  it("renders the helper line with a link to the Co-admins section", () => {
    render(
      <EventSettingsSection
        state={{ ...INITIAL_FORM_STATE, expanded: { ...INITIAL_FORM_STATE.expanded, settings: true } }}
        set={() => {}}
      />,
    );
    const helper = screen.getByTestId("leader-coadmin-helper");
    expect(helper.textContent?.replace(/\s+/g, " ").trim()).toBe(HELPER);
    noDashes(helper.textContent ?? "");

    const link = screen.getByRole("link", { name: "add them as a co-admin" });
    expect(link.getAttribute("href")).toBe("/settings/organization#co-admins");
    // Opens in a new tab so an unsaved create or edit form is not lost.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("FAQ co-admin path", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/faq/page.tsx"), "utf8");
  const step =
    "From your dashboard, open Organization settings and invite them as a Co-admin using their email.";

  it("includes the Organization settings step in both the visible FAQ and the FAQPage JSON-LD", () => {
    expect(src.split(step).length - 1).toBe(2);
    expect(src).not.toContain("From your dashboard, invite them as a Co-admin");
    noDashes(step);
  });
});

describe("Organization settings Co-admins anchor", () => {
  it("gives the Co-admins section id co-admins with a scroll margin", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/OrgMembersSection.tsx"), "utf8");
    expect(src).toMatch(/<section id="co-admins" className="scroll-mt-20 /);
  });
});
