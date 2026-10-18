/**
 * @jest-environment node
 */

import { eventMediaPath, isEventCoverUrl, removeCoverIfUnreferenced } from "@/lib/event-media";

const BASE = "https://abc.supabase.co";
const USER = "11111111-2222-3333-4444-555555555555";
const EVENT = "66666666-7777-8888-9999-000000000000";
const COVER_PATH = `${USER}/events/${EVENT}/cover.jpg`;
const coverUrl = (path = COVER_PATH, base = BASE) =>
  `${base}/storage/v1/object/public/event-media/${path}?v=123`;

function mockAdmin(refCount: number) {
  const like = jest.fn().mockResolvedValue({ count: refCount, error: null });
  const remove = jest.fn().mockResolvedValue({ error: null });
  const admin = {
    from: jest.fn(() => ({ select: jest.fn(() => ({ like })) })),
    storage: { from: jest.fn(() => ({ remove })) },
  };
  return { admin: admin as never, like, remove };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
});

describe("eventMediaPath", () => {
  it("extracts the object path and drops the cache-buster", () => {
    expect(eventMediaPath(coverUrl())).toBe(COVER_PATH);
  });

  it("returns null for other URLs and malformed encodings", () => {
    expect(eventMediaPath(null)).toBeNull();
    expect(eventMediaPath("https://example.com/cover.jpg")).toBeNull();
    expect(eventMediaPath(coverUrl("%E0%A4%A"))).toBeNull();
  });
});

describe("isEventCoverUrl", () => {
  it("accepts covers in this project's bucket", () => {
    expect(isEventCoverUrl(coverUrl())).toBe(true);
  });

  it("rejects other hosts, logos, and non-cover paths", () => {
    expect(isEventCoverUrl(coverUrl(COVER_PATH, "https://evil.example"))).toBe(false);
    expect(isEventCoverUrl(coverUrl(`${USER}/logo.png`))).toBe(false);
    expect(isEventCoverUrl(coverUrl(`${USER}/events/${EVENT}/../../logo.png`))).toBe(false);
    expect(isEventCoverUrl(null)).toBe(false);
  });
});

describe("removeCoverIfUnreferenced", () => {
  it("removes an unreferenced cover", async () => {
    const { admin, like, remove } = mockAdmin(0);
    await removeCoverIfUnreferenced(admin, coverUrl());
    expect(like).toHaveBeenCalledWith(
      "cover_image_url",
      `%/event-media/${COVER_PATH}%`
    );
    expect(remove).toHaveBeenCalledWith([COVER_PATH]);
  });

  it("keeps a cover another event still uses", async () => {
    const { admin, remove } = mockAdmin(1);
    await removeCoverIfUnreferenced(admin, coverUrl());
    expect(remove).not.toHaveBeenCalled();
  });

  it("never touches logos or other non-cover objects", async () => {
    const { admin, like, remove } = mockAdmin(0);
    await removeCoverIfUnreferenced(admin, coverUrl(`${USER}/logo.png`));
    expect(like).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("escapes LIKE wildcards in the path", async () => {
    const { admin, like } = mockAdmin(1);
    await removeCoverIfUnreferenced(admin, coverUrl("user_1/events/ev_2/cover.png"));
    expect(like).toHaveBeenCalledWith(
      "cover_image_url",
      "%/event-media/user\\_1/events/ev\\_2/cover.png%"
    );
  });
});
