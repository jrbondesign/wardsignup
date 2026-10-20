/**
 * Server rendered public event page: the title and description are in the
 * server HTML (the LCP element), local date dependent slot lists wait for
 * hydration, and the browser does not refetch before showing the page.
 */
import { renderToString } from "react-dom/server";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PublicEventPageData } from "@/lib/public-event-page";

const mockPosthog = { capture: jest.fn(), identify: jest.fn() };
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority, fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

const mockLoad = jest.fn();
jest.mock("@/lib/public-event-page", () => {
  const actual = jest.requireActual("@/lib/public-event-page");
  return { ...actual, loadPublicEventPage: (...a: unknown[]) => mockLoad(...a) };
});
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import EventPageClient from "@/components/event/EventPageClient";
import { BrandProvider } from "@/components/BrandProvider";
import { getDefaultPublicBrand } from "@/lib/brand";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const page: PublicEventPageData = {
  event: {
    id: EVENT_ID,
    name: "Temple Cleaning Saturday",
    description: "Bring gloves.",
    event_type: "spots",
    show_signups_publicly: true,
  },
  eventType: "spots",
  sessions: [
    { id: "s1", campaign_id: EVENT_ID, capacity: 3, session_date: "2099-01-10", time: "09:00", signups: [] },
    { id: "s2", campaign_id: EVENT_ID, capacity: 3, session_date: "2099-01-11", time: "09:00", signups: [] },
  ] as never,
  items: [],
  customSignups: [],
};

function ui(props: Partial<React.ComponentProps<typeof EventPageClient>>) {
  return (
    <BrandProvider brand={getDefaultPublicBrand()}>
      <EventPageClient eventId={EVENT_ID} {...props} />
    </BrandProvider>
  );
}

beforeEach(() => {
  mockLoad.mockReset();
  mockLoad.mockResolvedValue(page);
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe("EventPageClient server render", () => {
  it("puts the title and description in the server HTML, not a full page spinner", () => {
    const html = renderToString(ui({ initialPage: page, initialCover: null }));
    expect(html).toContain("Temple Cleaning Saturday");
    expect(html).toContain("Bring gloves.");
    expect(html).not.toContain("min-h-screen bg-[#F4FAFB] flex items-center justify-center");
    // Slot lists depend on the visitor's local date, so they wait for hydration.
    expect(html).not.toContain("Show Calendar");
    expect(html).not.toContain("Hide Calendar");
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("renders Event not found on the server for a missing event", () => {
    const html = renderToString(ui({ initialPage: null, initialCover: null }));
    expect(html).toContain("Event not found");
  });

  it("falls back to the spinner when the server had no data", () => {
    const html = renderToString(ui({ initialPage: undefined }));
    expect(html).not.toContain("Temple Cleaning Saturday");
  });
});

describe("EventPageClient in the browser", () => {
  it("shows server data immediately, renders slots after hydration, refreshes later in the background", async () => {
    jest.useFakeTimers();
    render(ui({ initialPage: page, initialCover: null }));
    expect(screen.getByRole("heading", { name: "Temple Cleaning Saturday" })).toBeInTheDocument();
    expect(await screen.findByText(/Calendar/)).toBeInTheDocument();
    // No cover fetch: the server already resolved it. The only browser fetch
    // is the ward analytics context lookup for the signup funnel.
    const fetched = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(fetched.filter((u) => !u.endsWith("/analytics-context"))).toEqual([]);
    expect(mockLoad).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("loads in the browser when the server had no data", async () => {
    render(ui({ initialPage: undefined }));
    expect(await screen.findByRole("heading", { name: "Temple Cleaning Saturday" })).toBeInTheDocument();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
