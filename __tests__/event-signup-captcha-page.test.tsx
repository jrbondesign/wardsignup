/**
 * Turnstile on the public event signup form (EventPageClient), with the site
 * key set. The widget is mocked: the test drives its token callback.
 */
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PublicEventPageData } from "@/lib/public-event-page";

process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

const mockPosthog = { capture: jest.fn(), identify: jest.fn(), getFeatureFlag: jest.fn(), featureFlags: { hasLoadedFlags: true } };
jest.mock("posthog-js/react", () => ({ usePostHog: () => mockPosthog }));
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority, fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));
let mockCurrentPage: unknown = null;
jest.mock("@/lib/public-event-page", () => {
  const actual = jest.requireActual("@/lib/public-event-page");
  return { ...actual, loadPublicEventPage: jest.fn(async () => mockCurrentPage) };
});
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

// Mocked widget: records props so the test can hand out tokens and see resets.
const widget: { onToken?: (t: string | null) => void; resetKeys: number[]; appearance?: string; action?: string } = { resetKeys: [] };
jest.mock("@/components/TurnstileWidget", () => ({
  __esModule: true,
  default: (props: { onToken: (t: string | null) => void; resetKey: number; appearance?: string; action?: string }) => {
    widget.onToken = props.onToken;
    widget.resetKeys.push(props.resetKey);
    widget.appearance = props.appearance;
    widget.action = props.action;
    return <div data-testid="turnstile-widget" />;
  },
}));

// Required after the site key is set: lib/use-captcha reads it at module load,
// and ES imports would be hoisted above the assignment.
const EventPageClient = require("@/components/event/EventPageClient").default;
const { BrandProvider } = require("@/components/BrandProvider");
const { getDefaultPublicBrand } = require("@/lib/brand");

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const page: PublicEventPageData = {
  event: { id: EVENT_ID, name: "Ward Party", description: "Come", event_type: "rsvp", show_signups_publicly: false },
  eventType: "rsvp",
  sessions: [{ id: "s1", campaign_id: EVENT_ID, capacity: 50, session_date: null, day_of_week: 6, time: "18:00", signups: [] }] as never,
  items: [],
  customSignups: [],
};

let fetchMock: jest.Mock;
let bulkResponse: { ok: boolean; body: unknown };
const bulkCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/signups/bulk");

async function renderPage() {
  mockCurrentPage = page;
  render(
    <BrandProvider brand={getDefaultPublicBrand()}>
      <EventPageClient eventId={EVENT_ID} initialPage={page} initialCover={null} />
    </BrandProvider>,
  );
  await act(async () => {});
}

async function submit() {
  const name = await screen.findByPlaceholderText("First and last name");
  fireEvent.change(name, { target: { value: "Pat Signer" } });
  await act(async () => {
    fireEvent.submit(name.closest("form")!);
  });
}

beforeEach(() => {
  window.scrollTo = jest.fn() as never;
  window.localStorage.clear();
  mockPosthog.getFeatureFlag.mockReturnValue("control");
  widget.resetKeys = [];
  widget.onToken = undefined;
  bulkResponse = { ok: true, body: { primary_cancel_token: "tok", results: [{ session_id: "s1" }] } };
  fetchMock = jest.fn(async (url: string) => ({
    ok: String(url) === "/api/signups/bulk" ? bulkResponse.ok : true,
    json: async () => (String(url) === "/api/signups/bulk" ? bulkResponse.body : {}),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

it("renders the widget in interaction only mode and sends the token with the signup", async () => {
  await renderPage();
  expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
  expect(widget.appearance).toBe("interaction-only");
  expect(widget.action).toBe("event_signup");
  act(() => widget.onToken!("tok-1"));
  await submit();
  await waitFor(() => expect(bulkCalls()).toHaveLength(1));
  expect(JSON.parse(bulkCalls()[0][1].body).captchaToken).toBe("tok-1");
});

it("a server captcha refusal shows the message and resets the widget for a retry", async () => {
  await renderPage();
  act(() => widget.onToken!("expired"));
  bulkResponse = { ok: false, body: { error: "The security check expired or failed. Please try again.", captcha: true } };
  await submit();
  expect(await screen.findByText("The security check expired or failed. Please try again.")).toBeInTheDocument();
  expect(Math.max(...widget.resetKeys)).toBe(1);

  // Fresh token, retry goes through.
  bulkResponse = { ok: true, body: { primary_cancel_token: "tok", results: [{ session_id: "s1" }] } };
  act(() => widget.onToken!("tok-2"));
  await submit();
  await waitFor(() => expect(bulkCalls()).toHaveLength(2));
  expect(JSON.parse(bulkCalls()[1][1].body).captchaToken).toBe("tok-2");
});

it("a fast click waits for the check, then submits once the token arrives", async () => {
  await renderPage();
  const name = await screen.findByPlaceholderText("First and last name");
  fireEvent.change(name, { target: { value: "Pat Signer" } });
  await act(async () => {
    fireEvent.submit(name.closest("form")!);
  });
  expect(bulkCalls()).toHaveLength(0);
  await act(async () => widget.onToken!("late"));
  await waitFor(() => expect(bulkCalls()).toHaveLength(1));
  expect(JSON.parse(bulkCalls()[0][1].body).captchaToken).toBe("late");
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});
