/**
 * Organizer switch for the "I'm also bringing…" write-in box on items events.
 * Off hides the box; on, null, or missing (database without the migration)
 * keeps it, so existing events and pre-migration deploys are unchanged.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockPosthog = { capture: jest.fn(), identify: jest.fn() };
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority, fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn(), from: () => ({}) } }));

import { buildPublicEventPage, customItemsAllowed, type PublicEventPagePayload } from "@/lib/public-event-page";
import EventPageClient from "@/components/event/EventPageClient";
import AllowCustomItemsToggle from "@/components/edit/sections/AllowCustomItemsToggle";
import { BrandProvider } from "@/components/BrandProvider";
import { getDefaultPublicBrand } from "@/lib/brand";

const ID = "33333333-3333-3333-3333-333333333333";

function payload(allow: boolean | null | "missing"): PublicEventPagePayload {
  const event: Record<string, unknown> = {
    id: ID,
    name: "Ward Potluck",
    description: null,
    event_type: "items",
    show_signups_publicly: true,
  };
  if (allow !== "missing") event.allow_custom_items = allow;
  return {
    event: event as never,
    items: [{ id: "i1", campaign_id: ID, label: "Rolls", item_limit: 5, section: null, sort_order: 1, created_at: "" }] as never,
    item_signups: [],
  };
}

async function renderPage(allow: boolean | null | "missing") {
  const page = buildPublicEventPage(payload(allow))!;
  render(
    <BrandProvider brand={getDefaultPublicBrand()}>
      <EventPageClient eventId={ID} initialPage={page} initialCover={null} />
    </BrandProvider>
  );
  await act(async () => {});
  expect(await screen.findByText("Rolls")).toBeInTheDocument();
}

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe("customItemsAllowed", () => {
  it("is off only for an explicit false", () => {
    expect(customItemsAllowed({ allow_custom_items: false })).toBe(false);
    expect(customItemsAllowed({ allow_custom_items: true })).toBe(true);
    expect(customItemsAllowed({ allow_custom_items: null })).toBe(true);
    expect(customItemsAllowed({})).toBe(true);
    expect(customItemsAllowed(null)).toBe(true);
  });
});

describe("public items page", () => {
  it("hides the write-in box when the organizer turned it off", async () => {
    await renderPage(false);
    expect(screen.queryByText(/also bringing/)).not.toBeInTheDocument();
    expect(screen.queryByText("Add my contribution")).not.toBeInTheDocument();
  });

  it.each([true, null, "missing" as const])("shows the write-in box when the setting is %p", async (allow) => {
    await renderPage(allow);
    expect(screen.getByText(/also bringing/)).toBeInTheDocument();
    expect(screen.getByText("Add my contribution")).toBeInTheDocument();
  });
});

describe("editor toggle", () => {
  it("renders nothing before the database has the setting", () => {
    const { container } = render(<AllowCustomItemsToggle supported={false} checked onChange={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows plain wording and reports the new value", () => {
    const onChange = jest.fn();
    render(<AllowCustomItemsToggle supported checked onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /Let people add their own items/ });
    expect(box).toBeChecked();
    expect(screen.getByText(/only want items from your list/)).toBeInTheDocument();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("is wired into the items editor only", () => {
    const dir = path.join(__dirname, "..", "components/edit");
    const users = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith("AllowCustomItemsToggle.tsx"))
      .filter((f) => readFileSync(path.join(dir, f), "utf8").includes("<AllowCustomItemsToggle"));
    expect(users).toEqual([path.join("sections", "EditItemsEvent.tsx")]);
  });
});
