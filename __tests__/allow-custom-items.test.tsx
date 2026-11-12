/**
 * Organizer switch for the "I'm also bringing…" write-in box on items events.
 * Off hides the add form but keeps any write-ins people already added on the
 * public list. On, null, or missing (database without the migration) keeps
 * the form, so existing events and pre-migration deploys are unchanged.
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

const PIE = {
  id: "cs1",
  item_id: null,
  member_name: "Carin Hiatt",
  custom_label: "A pumpkin pie",
  signup_note: "homemade",
  quantity: 1,
};

function payload(
  allow: boolean | null | "missing",
  opts: { custom?: typeof PIE[]; showPublicly?: boolean } = {},
): PublicEventPagePayload {
  const event: Record<string, unknown> = {
    id: ID,
    name: "Ward Potluck",
    description: null,
    event_type: "items",
    show_signups_publicly: opts.showPublicly ?? true,
  };
  if (allow !== "missing") event.allow_custom_items = allow;
  return {
    event: event as never,
    items: [{ id: "i1", campaign_id: ID, label: "Rolls", item_limit: 5, section: null, sort_order: 1, created_at: "" }] as never,
    item_signups: opts.custom ?? [],
  };
}

async function renderPage(
  allow: boolean | null | "missing",
  opts: { custom?: typeof PIE[]; showPublicly?: boolean } = {},
) {
  const page = buildPublicEventPage(payload(allow, opts))!;
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
  it("hides the add form but keeps existing write-ins when the organizer turned it off", async () => {
    await renderPage(false, { custom: [PIE] });
    expect(screen.getByText(/also bringing/)).toBeInTheDocument();
    expect(screen.getByText("Carin Hiatt")).toBeInTheDocument();
    expect(screen.getByText(/A pumpkin pie/)).toBeInTheDocument();
    expect(screen.getByText(/homemade/)).toBeInTheDocument();
    expect(screen.queryByText("Add my contribution")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/trailer/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/What will you bring/)).not.toBeInTheDocument();
  });

  it("renders nothing extra when it is off and nobody has added a write-in", async () => {
    await renderPage(false);
    expect(screen.queryByText(/also bringing/)).not.toBeInTheDocument();
    expect(screen.queryByText("Add my contribution")).not.toBeInTheDocument();
  });

  it("renders nothing extra when it is off and write-ins are not shown publicly", async () => {
    await renderPage(false, { custom: [PIE], showPublicly: false });
    expect(screen.queryByText("Carin Hiatt")).not.toBeInTheDocument();
    expect(screen.queryByText(/A pumpkin pie/)).not.toBeInTheDocument();
    expect(screen.queryByText(/also bringing/)).not.toBeInTheDocument();
    expect(screen.queryByText("Add my contribution")).not.toBeInTheDocument();
  });

  it.each([true, null, "missing" as const])("shows the write-in box when the setting is %p", async (allow) => {
    await renderPage(allow);
    expect(screen.getByText(/also bringing/)).toBeInTheDocument();
    expect(screen.getByText("Add my contribution")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/trailer/)).toBeInTheDocument();
  });

  it("still shows existing write-ins and the add form when the setting is on", async () => {
    await renderPage(true, { custom: [PIE] });
    expect(screen.getByText("Carin Hiatt")).toBeInTheDocument();
    expect(screen.getByText(/A pumpkin pie/)).toBeInTheDocument();
    expect(screen.getByText("Add my contribution")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/trailer/)).toBeInTheDocument();
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

describe("default stays on for new events", () => {
  it("the create API always writes true, even if a client sends false", () => {
    const src = readFileSync(path.join(__dirname, "..", "app/api/events/route.ts"), "utf8");
    expect(src).toMatch(/allow_custom_items:\s*true/);
    expect(src).not.toMatch(/allow_custom_items:\s*resolved|allow_custom_items:\s*body/);
  });

  it("duplicating an event copies the source, treating missing or null as on", () => {
    const src = readFileSync(path.join(__dirname, "..", "app/api/events/[id]/duplicate/route.ts"), "utf8");
    expect(src).toMatch(/allow_custom_items:\s*source\.allow_custom_items !== false/);
  });

  it("create form, templates, and presets never turn the box off", () => {
    const roots = [
      path.join(__dirname, "..", "components/create"),
      path.join(__dirname, "..", "lib/event-presets.ts"),
      path.join(__dirname, "..", "lib/event-template-data.ts"),
      path.join(__dirname, "..", "lib/create-form-state.ts"),
      path.join(__dirname, "..", "packages/mcp/src/tools"),
    ];
    const files: string[] = [];
    function walk(p: string) {
      const st = require("fs").statSync(p);
      if (st.isDirectory()) {
        for (const f of readdirSync(p, { recursive: true }) as string[]) {
          const full = path.join(p, f);
          if (/\.(ts|tsx)$/.test(full) && require("fs").statSync(full).isFile()) files.push(full);
        }
      } else {
        files.push(p);
      }
    }
    roots.forEach(walk);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/allow_custom_items\s*:\s*false/);
    }
  });
});
