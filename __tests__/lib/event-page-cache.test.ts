const mockRevalidateTag = jest.fn();
jest.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a) }));

import { EVENT_PAGE_CACHE_SECONDS, eventPageTag, revalidateEventPage } from "@/lib/event-page-cache";

beforeEach(() => {
  mockRevalidateTag.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("event page cache", () => {
  it("keeps the shared cache between 30 and 60 seconds", () => {
    expect(EVENT_PAGE_CACHE_SECONDS).toBeGreaterThanOrEqual(30);
    expect(EVENT_PAGE_CACHE_SECONDS).toBeLessThanOrEqual(60);
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
