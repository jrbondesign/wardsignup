import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrgNameModal from "@/components/OrgNameModal";
import { CALLING_OTHER } from "@/lib/callings";

jest.mock("@/lib/attribution", () => ({ getStoredAttribution: () => undefined }));

describe("OrgNameModal ward name and calling", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function renderModal(onComplete = jest.fn()) {
    render(
      <OrgNameModal brandLabel="Ward Signup" onComplete={onComplete} getAccessToken={async () => "tok"} />,
    );
    return onComplete;
  }

  it("says ward, never organization or unit", () => {
    renderModal();
    expect(screen.getByLabelText("Ward name")).toBeInTheDocument();
    expect(screen.getByLabelText(/Your calling/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/organization/i);
    expect(text).not.toMatch(/\bunit\b/i);
  });

  it("saves the ward without a calling (calling is optional)", async () => {
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Ward name"), { target: { value: "Mesa 5th Ward" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("Mesa 5th Ward"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/organizations");
  });

  it("saves an Other calling as free text after the ward", async () => {
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Ward name"), { target: { value: "Mesa Stake" } });
    fireEvent.change(screen.getByLabelText(/Your calling/), { target: { value: CALLING_OTHER } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your calling" }), { target: { value: "Stake clerk" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/organizer-profile/calling");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ calling: "Stake clerk" });
  });

  it("still completes first run when saving the calling fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const onComplete = renderModal();
    fireEvent.change(screen.getByLabelText("Ward name"), { target: { value: "Mesa 5th Ward" } });
    fireEvent.change(screen.getByLabelText(/Your calling/), { target: { value: "Bishop" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("Mesa 5th Ward"));
    warn.mockRestore();
  });
});
