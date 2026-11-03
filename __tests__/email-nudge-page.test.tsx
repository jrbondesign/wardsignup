/**
 * Email nudge experiment, rendered on the public event page (EventPageClient):
 * the flag is read on form start, the test arm nudges once on a dated slot
 * with no email, Add email focuses the field, Skip submits, control and
 * items sheets never nudge.
 */
import { cleanup, render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PublicEventPageData } from "@/lib/public-event-page";
import { EMAIL_NUDGE_COPY, EMAIL_NUDGE_SKIP_STORAGE_KEY } from "@/lib/email-nudge";

let mockCurrentPage: unknown = null;
const mockPosthog = {
  capture: jest.fn(),
  identify: jest.fn(),
  getFeatureFlag: jest.fn(),
  featureFlags: { hasLoadedFlags: true },
};
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority, fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));
jest.mock("@/lib/public-event-page", () => {
  const actual = jest.requireActual("@/lib/public-event-page");
  // The background refresh returns the same page the server rendered.
  return { ...actual, loadPublicEventPage: jest.fn(async () => mockCurrentPage) };
});
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import EventPageClient from "@/components/event/EventPageClient";
import { BrandProvider } from "@/components/BrandProvider";
import { getDefaultPublicBrand } from "@/lib/brand";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

const rsvpPage = (sessionDate: string | null): PublicEventPageData => ({
  event: { id: EVENT_ID, name: "Ward Party", description: "Come", event_type: "rsvp", show_signups_publicly: false },
  eventType: "rsvp",
  sessions: [{ id: "s1", campaign_id: EVENT_ID, capacity: 50, session_date: sessionDate, day_of_week: 6, time: "18:00", signups: [] }] as never,
  items: [],
  customSignups: [],
});

let fetchMock: jest.Mock;
const bulkCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/signups/bulk");

async function renderPage(page: PublicEventPageData) {
  mockCurrentPage = page;
  render(
    <BrandProvider brand={getDefaultPublicBrand()}>
      <EventPageClient eventId={EVENT_ID} initialPage={page} initialCover={null} />
    </BrandProvider>,
  );
  // Ward context lookup resolves.
  await act(async () => {});
}

async function fillNameAndSubmit() {
  const name = await screen.findByPlaceholderText("First and last name");
  fireEvent.focus(name);
  fireEvent.change(name, { target: { value: "Pat Signer" } });
  await act(async () => {
    fireEvent.submit(name.closest("form")!);
  });
}

beforeEach(() => {
  window.scrollTo = jest.fn() as never;
  window.localStorage.clear();
  mockPosthog.capture.mockReset();
  mockPosthog.getFeatureFlag.mockReset();
  mockPosthog.featureFlags.hasLoadedFlags = true;
  fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      String(url).endsWith("/analytics-context")
        ? { orgId: ORG_ID, isTestOrg: false }
        : { primary_cancel_token: "tok", results: [{ session_id: "s1" }] },
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

const nudgeEvents = () => mockPosthog.capture.mock.calls.filter((c) => String(c[0]).startsWith("email_nudge_"));

describe("email nudge on the public event page", () => {
  it("test arm: nudges once on a dated slot with no email, Add email focuses the field, next submit goes through", async () => {
    mockPosthog.getFeatureFlag.mockReturnValue("test");
    await renderPage(rsvpPage("2099-01-10"));
    await fillNameAndSubmit();

    expect(mockPosthog.getFeatureFlag).toHaveBeenCalledTimes(1);
    expect(mockPosthog.getFeatureFlag).toHaveBeenCalledWith("email-capture-next");
    expect(screen.getByText(EMAIL_NUDGE_COPY.title)).toBeInTheDocument();
    expect(bulkCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: EMAIL_NUDGE_COPY.addButton }));
    expect(screen.queryByText(EMAIL_NUDGE_COPY.title)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("you@example.com"));

    // Once per signup: submitting again (still no email) goes straight through.
    await fillNameAndSubmit();
    await waitFor(() => expect(bulkCalls()).toHaveLength(1));
    expect(screen.queryByText(EMAIL_NUDGE_COPY.title)).not.toBeInTheDocument();

    expect(nudgeEvents().map((c) => c[0])).toEqual(["email_nudge_shown", "email_nudge_add"]);
    for (const [, props] of nudgeEvents()) {
      expect(props).toMatchObject({ org_id: ORG_ID, campaign_id: EVENT_ID, event_id: EVENT_ID, sheet_type: "rsvp", variant: "test", form: "slots" });
      expect(JSON.stringify(props)).not.toContain("@");
    }
    expect(mockPosthog.getFeatureFlag).toHaveBeenCalledTimes(1);
  });

  it("test arm: Skip submits right away and is remembered in this browser", async () => {
    mockPosthog.getFeatureFlag.mockReturnValue("test");
    await renderPage(rsvpPage("2099-01-10"));
    await fillNameAndSubmit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: EMAIL_NUDGE_COPY.skipButton }));
    });
    await waitFor(() => expect(bulkCalls()).toHaveLength(1));
    expect(window.localStorage.getItem(EMAIL_NUDGE_SKIP_STORAGE_KEY)).toBe("1");
    expect(nudgeEvents().map((c) => c[0])).toEqual(["email_nudge_shown", "email_nudge_skip"]);
  });

  it("control, flags not loaded, or an undated slot: no nudge, signup goes straight through", async () => {
    for (const setup of [
      () => mockPosthog.getFeatureFlag.mockReturnValue("control"),
      () => { mockPosthog.getFeatureFlag.mockReturnValue("test"); mockPosthog.featureFlags.hasLoadedFlags = false; },
    ]) {
      setup();
      await renderPage(rsvpPage("2099-01-10"));
      await fillNameAndSubmit();
      expect(screen.queryByText(EMAIL_NUDGE_COPY.title)).not.toBeInTheDocument();
      cleanup();
    }
    expect(mockPosthog.getFeatureFlag).toHaveBeenCalledTimes(1); // only the loaded "control" read

    mockPosthog.featureFlags.hasLoadedFlags = true;
    mockPosthog.getFeatureFlag.mockReturnValue("test");
    await renderPage(rsvpPage(null));
    await fillNameAndSubmit();
    expect(screen.queryByText(EMAIL_NUDGE_COPY.title)).not.toBeInTheDocument();
    await waitFor(() => expect(bulkCalls().length).toBeGreaterThan(0));
    expect(nudgeEvents()).toHaveLength(0);
  });
});
