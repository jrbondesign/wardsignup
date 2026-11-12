const mockRevalidateTag = jest.fn();
jest.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a) }));

import { EVENT_PAGE_CACHE_SECONDS, eventPageTag, revalidateEventPage } from "@/lib/event-page-cache";

beforeEach(() => {
  mockRevalidateTag.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("event page cache", () => {
  it("keeps the shared cache for 15 minutes as a safety net behind on-demand expiry", () => {
    expect(EVENT_PAGE_CACHE_SECONDS).toBe(900);
  });

  it("expires the per-event tag immediately", () => {
    revalidateEventPage("e1");
    expect(mockRevalidateTag).toHaveBeenCalledWith(eventPageTag("e1"), { expire: 0 });
    expect(eventPageTag("e1")).toBe("event-page:e1");
  });

  it("ignores a missing id and never throws", () => {
    revalidateEventPage(null);
    revalidateEventPage(undefined);
    revalidateEventPage("");
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    mockRevalidateTag.mockImplementationOnce(() => {
      throw new Error("no store");
    });
    expect(() => revalidateEventPage("e2")).not.toThrow();
  });
});
