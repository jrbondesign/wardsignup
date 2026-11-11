import { expirePublicEventPage } from "@/lib/event-page-expire-client";

describe("expirePublicEventPage", () => {
  it("POSTs to the event's revalidate route with the bearer token", async () => {
    const f = jest.fn(async () => ({ ok: true }) as Response);
    await expect(expirePublicEventPage("e1", "tok", f as unknown as typeof fetch)).resolves.toBe(true);
    expect(f).toHaveBeenCalledWith("/api/events/e1/revalidate", {
      method: "POST",
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("skips without an id or token, and never throws", async () => {
    const f = jest.fn(async () => {
      throw new Error("offline");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(expirePublicEventPage(null, "tok", f as unknown as typeof fetch)).resolves.toBe(false);
    await expect(expirePublicEventPage("e1", undefined, f as unknown as typeof fetch)).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
    await expect(expirePublicEventPage("e1", "tok", f as unknown as typeof fetch)).resolves.toBe(false);
  });
});
