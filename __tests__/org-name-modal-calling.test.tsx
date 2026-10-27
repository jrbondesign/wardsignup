import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrgNameModal from "@/components/OrgNameModal";
import { CALLING_OTHER } from "@/lib/callings";
import { ORG_NAME_HINT, WARD_NAME_HINT } from "@/components/OrgIdentityFields";

jest.mock("@/lib/attribution", () => ({ getStoredAttribution: () => undefined }));

describe("OrgNameModal Ward/Unit, Organization and calling", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ organization: { id: "org-1" } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function renderModal(onComplete = jest.fn()) {
    render(
      <OrgNameModal brandLabel="Ward Signup" onComplete={onComplete} getAccessToken={async () => "tok"} />,
    );
    return onComplete;
  }

  it("shows Ward/Unit, then Organization, then Your calling", () => {
    renderModal();
    const labels = Array.from(screen.getByTestId("org-identity-fields").querySelectorAll("label")).map((l) =>
      l.textContent?.trim(),
    );
    expect(labels).toEqual(["Ward/Unit", "Organization", "Your calling (optional)"]);
    expect(screen.getByLabelText("Ward/Unit")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByText(ORG_NAME_HINT)).toBeInTheDocument();
    expect(screen.getByText(WARD_NAME_HINT)).toBeInTheDocument();
  });

  it("uses unit only in the Ward/Unit label, and no dashes", () => {
    renderModal();
    const text = (document.body.textContent ?? "").replace("Ward/Unit", "");
    expect(text).not.toMatch(/\bunit\b/i);
    expect(text).not.toMatch(/[–—]/);
  });

  it("saves the organization alone (Ward/Unit and calling are optional)", async () => {
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Elders Quorum" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("Elders Quorum"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/organizations");
  });

  it("requires the organization", async () => {
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Ward/Unit"), { target: { value: "Maple Ridge Ward" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Please enter your organization.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("saves Ward/Unit on the new org right after creating it", async () => {
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Relief Society" } });
    fireEvent.change(screen.getByLabelText("Ward/Unit"), { target: { value: "  Maple Ridge   Ward " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("Relief Society"));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/organizations/org-1");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ name: "Relief Society", ward_name: "Maple Ridge Ward" });
  });

  it("still completes first run when saving Ward/Unit fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organization: { id: "org-1" } }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Primary" } });
    fireEvent.change(screen.getByLabelText("Ward/Unit"), { target: { value: "Maple Ridge Ward" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("Primary"));
    warn.mockRestore();
  });

  it("saves an Other calling as free text after the organization", async () => {
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Stake Presidency" } });
    fireEvent.change(screen.getByLabelText(/Your calling/), { target: { value: CALLING_OTHER } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your calling" }), { target: { value: "Stake clerk" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/organizer-profile/calling");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ calling: "Stake clerk" });
  });

  it("still completes first run when saving the calling fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organization: { id: "org-1" } }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "Bishopric" } });
    fireEvent.change(screen.getByLabelText(/Your calling/), { target: { value: "Bishop" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("Bishopric"));
    warn.mockRestore();
  });
});
