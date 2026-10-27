/**
 * "Your calling (optional)" lives on the signed in person's own row in the
 * admins list (owner and co-admins alike). Other rows never show a calling, and
 * only the caller's own calling is ever requested.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import OrgMembersSection from "@/components/OrgMembersSection";
import OrgIdentityFields from "@/components/OrgIdentityFields";
import { OWN_CALLING_HELPER, OWN_CALLING_LABEL, OWN_CALLING_PLACEHOLDER } from "@/components/OwnCallingField";

jest.mock("@/lib/auth", () => ({
  createClientComponentClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
  }),
}));

const members = [
  { id: "m1", user_id: "owner-1", invited_email: "owner@example.com", role: "owner", status: "accepted", created_at: "2026-01-01", accepted_at: "2026-01-01" },
  { id: "m2", user_id: "co-1", invited_email: "co@example.com", role: "admin", status: "accepted", created_at: "2026-02-01", accepted_at: "2026-02-01" },
  { id: "m3", user_id: null, invited_email: "pending@example.com", role: "admin", status: "pending", created_at: "2026-03-01", accepted_at: null },
];

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/members")) return { ok: true, json: async () => ({ members }) };
    if (url === "/api/organizer-profile/calling" && (!init?.method || init.method === "GET")) {
      return { ok: true, json: async () => ({ calling: "Ward clerk" }) };
    }
    if (url === "/api/organizer-profile/calling" && init?.method === "PATCH") {
      return { ok: true, json: async () => JSON.parse(String(init.body)) };
    }
    return { ok: false, json: async () => ({}) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("Own calling on the admins list", () => {
  it.each([
    ["owner", "owner-1", true, "owner@example.com"],
    ["co-admin", "co-1", false, "co@example.com"],
  ])("shows the field only on the %s's own row", async (_who, me, isOwner, email) => {
    render(<OrgMembersSection organizationId="org-1" isOwner={isOwner} currentUserId={me} />);
    const row = await screen.findByTestId("member-row-me");
    expect(row).toHaveTextContent(email);
    expect(screen.getAllByTestId("own-calling")).toHaveLength(1);
    const input = await screen.findByLabelText(OWN_CALLING_LABEL);
    expect(row).toContainElement(input);
    expect(input).toHaveAttribute("placeholder", OWN_CALLING_PLACEHOLDER);
    await waitFor(() => expect(input).toHaveValue("Ward clerk"));
    expect(screen.getByText(OWN_CALLING_HELPER)).toBeInTheDocument();
    // Only the caller's own calling is requested; the members payload has none.
    const callingCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("calling"));
    expect(callingCalls.every(([u]) => u === "/api/organizer-profile/calling")).toBe(true);
  });

  it("saves the caller's own calling", async () => {
    render(<OrgMembersSection organizationId="org-1" isOwner={false} currentUserId="co-1" />);
    const input = await screen.findByLabelText(OWN_CALLING_LABEL);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "  Elders Quorum   secretary " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH");
    expect(patch![0]).toBe("/api/organizer-profile/calling");
    expect(JSON.parse(patch![1].body)).toEqual({ calling: "Elders Quorum secretary" });
  });

  it("shows no calling field when the signed in person has no accepted row", async () => {
    render(<OrgMembersSection organizationId="org-1" isOwner={false} currentUserId="stranger" />);
    await screen.findByText("co@example.com");
    expect(screen.queryByTestId("own-calling")).not.toBeInTheDocument();
  });
});

describe("Org settings identity fields", () => {
  it("can drop calling and lets co-admins edit Ward/Unit and Organization without the owner only hint", () => {
    render(
      <OrgIdentityFields
        idPrefix="settings"
        name="Elders Quorum"
        onNameChange={() => {}}
        wardName=""
        onWardNameChange={() => {}}
        showCalling={false}
        canEditOrg
      />,
    );
    expect(screen.getByLabelText("Ward/Unit")).not.toBeDisabled();
    expect(screen.getByLabelText("Organization")).not.toBeDisabled();
    expect(screen.queryByLabelText(/Your calling/)).not.toBeInTheDocument();
    expect(screen.queryByText("Only the owner can change this.")).not.toBeInTheDocument();
  });
});
