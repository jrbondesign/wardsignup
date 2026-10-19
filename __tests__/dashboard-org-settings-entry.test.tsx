/**
 * Dashboard "Organization settings" entry point: labeled one tap link,
 * brand aware caption, and "Switch organization" only for members of 2+ orgs.
 * Also covers the matching link in the navigation drawer and the dashboard
 * header wiring (subtitle and gear removed, New Event filled primary).
 */
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";

const capture = jest.fn();
// Stable client, like the real hook (it returns the provider's single client).
// The dashboard's load effect depends on it: a new object per render re-ran the
// effect on every render, an endless fetch and setEvents loop that made this
// file hang or pass depending on scheduling.
const mockPosthog = { capture: (...a: unknown[]) => capture(...a), identify: jest.fn() };
jest.mock("posthog-js/react", () => ({
  usePostHog: () => mockPosthog,
}));

// Stable router: the dashboard's load effect depends on it, like the real hook.
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ unoptimized, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

// Chainable stand in for the dashboard's campaigns query.
let campaignsResult: { data: unknown[]; error: null } = { data: [], error: null };
let campaignsQueries = 0;
function campaignsChain() {
  campaignsQueries += 1;
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(campaignsResult).then(resolve);
  return chain;
}

jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
      getUser: async () => ({ data: { user: { id: "u1", email: "owner@example.com" } }, error: null }),
      signOut: async () => ({}),
    },
    from: () => campaignsChain(),
  }),
}));

jest.mock("@/lib/organizations", () => ({
  getCurrentOrganization: async () => ({ id: "org1", name: "Smoke Test Eva", needs_naming: false }),
}));

import OrgSettingsEntry, {
  ORG_SETTINGS_CAPTION_GENERIC,
  ORG_SETTINGS_CAPTION_WARD,
} from "@/components/OrgSettingsEntry";
import Navigation from "@/components/Navigation";
import DashboardPage from "@/app/dashboard/page";
import { BrandProvider } from "@/components/BrandProvider";
import { getDefaultPublicBrand } from "@/lib/brand";

function mockOrgList(count: number) {
  const organizations = Array.from({ length: count }, (_, i) => ({
    id: `org${i + 1}`,
    name: `Org ${i + 1}`,
    needs_naming: false,
    brand_id: "wardsignup",
    role: i === 0 ? "owner" : "admin",
  }));
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes("/api/organizations/list")) {
      return { ok: true, json: async () => ({ organizations, selectedOrgId: "org1" }) };
    }
    return { ok: false, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  capture.mockClear();
  campaignsResult = { data: [], error: null };
  campaignsQueries = 0;
});

describe("OrgSettingsEntry", () => {
  it("links straight to /settings/organization with a 44px tap target", async () => {
    mockOrgList(1);
    render(<OrgSettingsEntry isWardBrand />);
    const link = screen.getByRole("link", { name: "Organization settings" });
    expect(link).toHaveAttribute("href", "/settings/organization");
    expect(link).toHaveClass("min-h-11");
    expect(link).toHaveAttribute("aria-describedby", "org-settings-caption");
    fireEvent.click(link);
    expect(capture).toHaveBeenCalledWith("org_settings_opened", { source: "dashboard" });
    await flush();
  });

  it("uses the ward caption on the WardSignup brand", async () => {
    mockOrgList(1);
    render(<OrgSettingsEntry isWardBrand />);
    expect(screen.getByText(ORG_SETTINGS_CAPTION_WARD)).toHaveAttribute("id", "org-settings-caption");
    expect(ORG_SETTINGS_CAPTION_WARD).toBe("Your ward name, admins and public ward directory.");
    expect(screen.queryByText(ORG_SETTINGS_CAPTION_GENERIC)).not.toBeInTheDocument();
    await flush();
  });

  it("uses the group caption on other brands", async () => {
    mockOrgList(1);
    render(<OrgSettingsEntry isWardBrand={false} />);
    expect(screen.getByText("Your group name and admins.")).toBeInTheDocument();
    expect(screen.queryByText(ORG_SETTINGS_CAPTION_WARD)).not.toBeInTheDocument();
    await flush();
  });

  it("hides Switch organization for a single org", async () => {
    mockOrgList(1);
    render(<OrgSettingsEntry isWardBrand />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await flush();
    expect(screen.queryByRole("link", { name: /switch organization/i })).not.toBeInTheDocument();
  });

  it("shows Switch organization for members of 2+ orgs, pointing at the chooser", async () => {
    mockOrgList(2);
    render(<OrgSettingsEntry isWardBrand />);
    const link = await screen.findByRole("link", { name: /switch organization/i });
    expect(link).toHaveAttribute("href", "/orgs/select?next=/dashboard");
  });

  it("reserves the Switch row while loading, then collapses it for a single org", async () => {
    mockOrgList(1);
    render(<OrgSettingsEntry isWardBrand />);
    expect(screen.getByTestId("org-switch-placeholder")).toHaveClass("min-h-11");
    await waitFor(() => expect(screen.queryByTestId("org-switch-placeholder")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /switch organization/i })).not.toBeInTheDocument();
  });

  it("swaps the placeholder for a focusable Switch link with 2+ orgs", async () => {
    mockOrgList(2);
    render(<OrgSettingsEntry isWardBrand />);
    const link = await screen.findByRole("link", { name: /switch organization/i });
    expect(screen.queryByTestId("org-switch-placeholder")).not.toBeInTheDocument();
    expect(link).toHaveClass("mt-1", "min-h-11", "rounded-full", "focus-visible:outline-[#0E96B0]");
  });

  it("keeps copy free of dashes", async () => {
    mockOrgList(2);
    const { container } = render(<OrgSettingsEntry isWardBrand />);
    await screen.findByRole("link", { name: /switch organization/i });
    expect(container.textContent).not.toMatch(/[-\u2013\u2014]/);
  });
});

describe("Navigation", () => {
  it("adds Organization settings to the mobile drawer and desktop bar", async () => {
    mockOrgList(1);
    render(
      <BrandProvider brand={getDefaultPublicBrand()}>
        <Navigation />
      </BrandProvider>
    );
    const desktop = await screen.findByRole("link", { name: "Organization settings" });
    expect(desktop).toHaveAttribute("href", "/settings/organization");
    expect(desktop).toHaveClass("inline-flex");
    expect(desktop).not.toHaveClass("hidden");
    const email = screen.getByText("owner@example.com");
    expect(email).toHaveAttribute("title", "owner@example.com");
    expect(email).toHaveClass("hidden", "lg:block", "max-w-[160px]", "xl:max-w-[200px]");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveClass("lg:hidden");

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const links = screen.getAllByRole("link", { name: "Organization settings" });
    expect(links).toHaveLength(2);
    links.forEach((l) => expect(l).toHaveAttribute("href", "/settings/organization"));
    fireEvent.click(links[1]);
    expect(capture).toHaveBeenCalledWith("org_settings_opened", { source: "nav" });
  });
});

describe("Dashboard header", () => {
  function renderDashboard() {
    return render(
      <BrandProvider brand={getDefaultPublicBrand()}>
        <DashboardPage />
      </BrandProvider>
    );
  }

  it("replaces the subtitle and gear with the Organization settings button (empty state too)", async () => {
    mockOrgList(1);
    const { container } = renderDashboard();
    expect(await screen.findByText("Smoke Test Eva", { selector: "h1" })).toBeInTheDocument();
    expect(screen.queryByText("Manage your ward signups")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-label="Organization settings menu"]')).toBeNull();
    const button = container.querySelector('a[aria-describedby="org-settings-caption"]');
    expect(button).toHaveAttribute("href", "/settings/organization");
    expect(button).toHaveTextContent("Organization settings");
    expect(screen.getByText(ORG_SETTINGS_CAPTION_WARD)).toBeInTheDocument();
    await flush();
  });

  it("shows Switch organization in the header only with 2+ orgs", async () => {
    mockOrgList(3);
    renderDashboard();
    expect(await screen.findByText("Switch organization", {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("makes New Event the filled gradient primary", async () => {
    mockOrgList(1);
    campaignsResult = {
      data: [{ id: "e1", name: "Test Thursday Evening Teaching", sessions: [], campaign_items: [] }],
      error: null,
    };
    renderDashboard();
    const label = await screen.findByText("New Event", {}, { timeout: 4000 });
    const newEvent = label.closest("a");
    expect(newEvent).toHaveAttribute("href", "/create");
    expect(newEvent).toHaveClass("bg-gradient-to-br", "from-[#22C8D8]", "via-[#0E96B0]", "to-[#08647E]", "text-white");
    await flush();
    // The load effect runs once; a re-render must not refetch (that loop is what hung this test).
    expect(campaignsQueries).toBe(1);
  });
});
