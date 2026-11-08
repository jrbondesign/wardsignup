/**
 * Public signup behavior checked against the replay leads:
 * an open slot can be selected, a full slot cannot, a full sheet says so,
 * and item confirm sends one request with or without a note.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PublicEventPageData } from "@/lib/public-event-page";

const mockPosthog = { capture: jest.fn(), identify: jest.fn() };
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...props} />,
}));
jest.mock("@/lib/public-event-page", () => {
  const actual = jest.requireActual("@/lib/public-event-page");
  return { ...actual, loadPublicEventPage: jest.fn() };
});
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import EventPageClient from "@/components/event/EventPageClient";
import { BrandProvider } from "@/components/BrandProvider";
import { getDefaultPublicBrand } from "@/lib/brand";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";

function mount(page: PublicEventPageData) {
  const mod = jest.requireMock("@/lib/public-event-page") as { loadPublicEventPage: jest.Mock };
  mod.loadPublicEventPage.mockResolvedValue(page);
  return render(
    <BrandProvider brand={getDefaultPublicBrand()}>
      <EventPageClient eventId={EVENT_ID} initialPage={page} initialLoadedAt={Date.now()} initialCover={null} />
    </BrandProvider>,
  );
}

function posts(urlPart: string) {
  return (global.fetch as jest.Mock).mock.calls.filter(
    (c) => String(c[0]).includes(urlPart) && c[1]?.method === "POST",
  );
}

beforeEach(() => {
  mockRouter.push.mockReset();
  window.scrollTo = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ cancel_token: "tok" }) })) as unknown as typeof fetch;
});

describe("appointment slot select and full sheet", () => {
  const spots: PublicEventPageData = {
    event: {
      id: EVENT_ID,
      name: "Tithing declaration",
      description: "Example sheet",
      event_type: "spots",
      show_signups_publicly: true,
      show_capacity_publicly: true,
    },
    eventType: "spots",
    sessions: [
      {
        id: "open",
        campaign_id: EVENT_ID,
        capacity: 1,
        session_date: "2099-11-08",
        time: "12:30",
        end_time: "12:45",
        location: "Bishop's Office",
        signups: [],
      },
      {
        id: "full",
        campaign_id: EVENT_ID,
        capacity: 1,
        session_date: "2099-11-08",
        time: "13:00",
        end_time: "13:15",
        location: "Bishop's Office",
        signups: [{ id: "sig", member_name: "Example Neighbor", guest_names: [] }],
      },
    ] as never,
    items: [],
    customSignups: [],
  };

  it("selects an open slot and leaves a full slot disabled", async () => {
    mount(spots);
    const open = await screen.findByRole("button", { name: /12:30/ });
    expect(open).toBeEnabled();
    fireEvent.click(open);
    expect(screen.getByText("1 session selected")).toBeInTheDocument();

    const full = screen.getByRole("button", { name: /1:00/ });
    expect(full).toBeDisabled();
    fireEvent.click(full);
    expect(screen.getByText("1 session selected")).toBeInTheDocument();
  });

  it("says all slots are full when every slot is taken and names are hidden", async () => {
    const fullSheet: PublicEventPageData = {
      ...spots,
      event: { ...spots.event, show_signups_publicly: false },
      sessions: (spots.sessions as { id: string; signups: unknown[] }[]).map((s) => ({
        ...s,
        signups: [{ id: `${s.id}-sig`, member_name: "Example Neighbor", guest_names: [] }],
      })) as never,
    };
    mount(fullSheet);
    expect(await screen.findByText("All slots are full.")).toBeInTheDocument();
  });

  it("submits the selected slot once", async () => {
    mount(spots);
    fireEvent.click(await screen.findByRole("button", { name: /12:30/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByPlaceholderText("John Doe"), { target: { value: "Example Neighbor" } });
    const submit = screen.getByRole("button", { name: "Sign Up for 1 Session" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(posts("/api/signups/bulk")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(posts("/api/signups/bulk")).toHaveLength(1);
  });
});

describe("donation item confirm", () => {
  const items: PublicEventPageData = {
    event: {
      id: EVENT_ID,
      name: "Thanksgiving donations",
      description: "Example list",
      event_type: "items",
      show_signups_publicly: false,
    },
    eventType: "items",
    sessions: [],
    items: [
      { id: "item-1", campaign_id: EVENT_ID, label: "Rolls", item_limit: 4, section: null, item_signups: [] },
    ] as never,
    customSignups: [],
  };

  async function claim(note?: string) {
    mount(items);
    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));
    const form = screen.getByText("Rolls").closest("div.rounded-2xl") as HTMLElement;
    fireEvent.change(within(form).getByPlaceholderText("First and last name"), { target: { value: "Example Neighbor" } });
    if (note) fireEvent.change(within(form).getByPlaceholderText(/scrambled eggs/i), { target: { value: note } });
    const confirm = within(form).getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(posts("/api/item-signups")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(posts("/api/item-signups")).toHaveLength(1);
  }

  it("confirms without a note in one request", async () => {
    await claim();
    const calls = posts("/api/item-signups");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body).signup_note).toBe("");
    expect(JSON.parse(calls[0][1].body).member_name).toBe("Example Neighbor");
  });

  it("confirms with a note in one request", async () => {
    await claim("Orange juice");
    const calls = posts("/api/item-signups");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body).signup_note).toBe("Orange juice");
  });
});
