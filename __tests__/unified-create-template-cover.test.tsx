/**
 * Form orchestration for Ward Christmas Party default cover seeding.
 * Child sections are stubbed; auth/fetch/upload are mocked.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
    },
  }),
}));

jest.mock("@/lib/attribution", () => ({ getStoredAttribution: () => undefined }));

const uploadTemplateCover = jest.fn();
jest.mock("@/lib/apply-template-cover", () => {
  const actual = jest.requireActual("@/lib/apply-template-cover");
  return {
    ...actual,
    uploadTemplateCover: (...args: unknown[]) => uploadTemplateCover(...args),
  };
});

jest.mock("@/components/create/EventTypePicker", () => () => <div data-testid="event-type-picker" />);
jest.mock("@/components/create/sections/TimeSection", () => () => null);
jest.mock("@/components/create/sections/LocationSection", () => () => null);
jest.mock("@/components/create/sections/CapacitySection", () => () => null);
jest.mock("@/components/create/sections/AttendeeFieldsSection", () => () => null);
jest.mock("@/components/create/sections/ItemsSection", () => () => <div data-testid="items-section" />);
jest.mock("@/components/create/sections/VisibilitySection", () => () => null);
jest.mock("@/components/create/sections/NotificationsSection", () => () => null);
jest.mock("@/components/create/sections/GoogleCalendarSection", () => () => null);
jest.mock("@/components/create/sections/EventSettingsSection", () => () => null);
jest.mock("@/components/create/sections/HeardAboutSection", () => () => null);
jest.mock("@/components/create/sections/ComponentCard", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid={title ? `card-${title}` : "card"}>{children}</div>
  ),
}));

import UnifiedCreateForm from "@/components/create/UnifiedCreateForm";

const ORG = "11111111-1111-1111-1111-111111111111";
const EVENT_ID = "evt-christmas-1";

function mockCreateFlow(opts: { coverUpload?: "ok" | "fail" | "throw" } = {}) {
  const coverUpload = opts.coverUpload ?? "fail";
  if (coverUpload === "ok") {
    uploadTemplateCover.mockResolvedValue({
      ok: true,
      url: "https://example.supabase.co/storage/v1/object/public/event-media/u/events/evt/cover.webp?v=1",
    });
  } else if (coverUpload === "throw") {
    uploadTemplateCover.mockRejectedValue(new Error("network down"));
  } else {
    uploadTemplateCover.mockResolvedValue({ ok: false, error: "Failed to save cover image URL" });
  }

  const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (href === "/api/events" && method === "POST") {
      return {
        ok: true,
        json: async () => ({ event: { id: EVENT_ID } }),
      } as Response;
    }
    if (href === `/api/events/${EVENT_ID}` && method === "PATCH") {
      return { ok: true, json: async () => ({}) } as Response;
    }
    if (href === "/api/items" && method === "POST") {
      return { ok: true, json: async () => ({ items: [] }) } as Response;
    }
    throw new Error(`unexpected fetch ${method} ${href}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("UnifiedCreateForm Christmas party default cover", () => {
  const prevAllow = process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS;

  beforeEach(() => {
    push.mockReset();
    uploadTemplateCover.mockReset();
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = ORG;
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
    if (prevAllow === undefined) delete process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS;
    else process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = prevAllow;
  });

  it("continues to items + admin when cover persist fails, without treating it as fatal", async () => {
    const fetchMock = mockCreateFlow({ coverUpload: "fail" });

    render(
      <UnifiedCreateForm
        initialTemplateKey="ward-christmas-party"
        organizationId={ORG}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/${EVENT_ID}?created=1`));

    expect(uploadTemplateCover).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      token: "tok",
      assetPath: "/templates/ward-christmas-party.webp",
    });

    const itemCall = fetchMock.mock.calls.find(
      (c) => String(c[0]) === "/api/items" && (c[1] as RequestInit)?.method === "POST"
    );
    expect(itemCall).toBeTruthy();
    const itemBody = JSON.parse(String((itemCall![1] as RequestInit).body));
    expect(itemBody.campaign_id).toBe(EVENT_ID);
    expect(itemBody.items.length).toBeGreaterThan(0);
    // Cover seed reported failure; create still completed with no fatal error UI.
    await expect(uploadTemplateCover.mock.results[0].value).resolves.toMatchObject({ ok: false });
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("still finishes create when cover upload throws", async () => {
    mockCreateFlow({ coverUpload: "throw" });

    render(
      <UnifiedCreateForm
        initialTemplateKey="ward-christmas-party"
        organizationId={ORG}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/${EVENT_ID}?created=1`));
    expect(uploadTemplateCover).toHaveBeenCalled();
  });

  it("skips default cover after Reset name & description clears the template", async () => {
    const fetchMock = mockCreateFlow({ coverUpload: "ok" });

    render(
      <UnifiedCreateForm
        initialTemplateKey="ward-christmas-party"
        organizationId={ORG}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Reset name & description/i }));
    fireEvent.change(screen.getByLabelText(/Event name/i), {
      target: { value: "Custom Christmas social" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/${EVENT_ID}?created=1`));
    expect(uploadTemplateCover).not.toHaveBeenCalled();

    const itemCall = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/items");
    expect(itemCall).toBeTruthy();
  });

  it("skips default cover when the org is not allowlisted", async () => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = "someone-else";
    mockCreateFlow({ coverUpload: "ok" });

    render(
      <UnifiedCreateForm
        initialTemplateKey="ward-christmas-party"
        organizationId={ORG}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/${EVENT_ID}?created=1`));
    expect(uploadTemplateCover).not.toHaveBeenCalled();
  });
});
