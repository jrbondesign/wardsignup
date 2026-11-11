/**
 * @jest-environment node
 *
 * Regression: cover storage upload + failed campaigns URL persist must not
 * leave an unreferenced orphan. Covers returned errors, throws, and the
 * zero-row PostgREST update race (event deleted between ownership and persist).
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/upload/route";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { isEventCoverUrl } from "@/lib/event-media";

jest.mock("@/lib/auth", () => ({ getAuthFromRequest: jest.fn() }));
jest.mock("@/lib/campaign-access", () => ({ userCanAdminCampaign: jest.fn() }));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: jest.fn() }));
const mockRevalidateEventPage = jest.fn();
jest.mock("@/lib/event-page-cache", () => ({
  revalidateEventPage: (...a: unknown[]) => mockRevalidateEventPage(...a),
}));

const BASE = "https://qa.supabase.co";
const USER = "qa-user";
const EVENT = "qa-event";
const NEW_PATH = `${USER}/events/${EVENT}/cover.webp`;
const NEW_URL = `${BASE}/storage/v1/object/public/event-media/${NEW_PATH}`;
const OLD_PATH = `${USER}/events/${EVENT}/cover.jpg`;
const OLD_URL = `${BASE}/storage/v1/object/public/event-media/${OLD_PATH}?v=1`;

type SetupOpts = {
  org?: string;
  failPatch?: "error" | "throw" | "zero-row" | "zero-row-silent" | false;
  previousCoverUrl?: string | null;
  /** How many campaigns still reference the NEW cover path during rollback. */
  newPathRefCount?: number;
  /** How many campaigns still reference the OLD cover path (when cleaned after success). */
  oldPathRefCount?: number;
};

function setup(opts: SetupOpts = {}) {
  const {
    org = "qa-org",
    failPatch = false,
    previousCoverUrl = null,
    newPathRefCount = 0,
    oldPathRefCount = 1,
  } = opts;

  process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = "qa-org";
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;

  const upload = jest.fn().mockResolvedValue({ error: null });
  const remove = jest.fn().mockResolvedValue({ error: null });
  const row = { organization_id: org, cover_image_url: previousCoverUrl };

  const like = jest.fn().mockImplementation(async (_col: string, pattern: string) => {
    if (pattern.includes(NEW_PATH.replace(/_/g, "\\_")) || pattern.includes(`/event-media/${NEW_PATH}`)) {
      return { count: newPathRefCount, error: null };
    }
    if (pattern.includes(OLD_PATH.replace(/_/g, "\\_")) || pattern.includes(`/event-media/${OLD_PATH}`)) {
      return { count: oldPathRefCount, error: null };
    }
    return { count: 0, error: null };
  });

  const persistSingle = jest.fn(async () => {
    if (failPatch === "throw") {
      throw new Error("simulated DB throw");
    }
    if (failPatch === "error") {
      return { data: null, error: { message: "simulated DB outage" } };
    }
    if (failPatch === "zero-row") {
      // Bare update would look like success; .select().single() surfaces no row.
      return {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      };
    }
    if (failPatch === "zero-row-silent") {
      // No PostgREST error, but no campaign id returned either.
      return { data: null, error: null };
    }
    return { data: { id: EVENT }, error: null };
  });

  const admin = {
    from: jest.fn(() => ({
      select: jest.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === "exact") {
          return { like };
        }
        return {
          eq: jest.fn(() => ({
            single: async () => ({ data: row, error: null }),
          })),
        };
      }),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: persistSingle,
          })),
        })),
      })),
    })),
    storage: {
      from: jest.fn(() => ({
        upload,
        remove,
        getPublicUrl: () => ({ data: { publicUrl: NEW_URL } }),
      })),
    },
  };

  (getAuthFromRequest as jest.Mock).mockResolvedValue({
    ok: true,
    supabase: {},
    user: { id: USER },
  });
  (userCanAdminCampaign as jest.Mock).mockResolvedValue(true);
  (createServiceRoleClient as jest.Mock).mockReturnValue(admin);

  return { upload, remove, like, persistSingle, admin };
}

function request() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "cover.webp", { type: "image/webp" }));
  form.append("eventId", EVENT);
  form.append("type", "cover");
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: form });
}

describe("POST /api/upload cover persist lifecycle", () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});

  afterAll(() => log.mockRestore());

  beforeEach(() => mockRevalidateEventPage.mockReset());

  it("expires the public event page cache only after the cover URL is saved", async () => {
    setup();
    expect((await POST(request())).status).toBe(200);
    expect(mockRevalidateEventPage).toHaveBeenCalledWith(EVENT);
    mockRevalidateEventPage.mockReset();
    setup({ failPatch: "error" });
    expect((await POST(request())).status).toBe(500);
    expect(mockRevalidateEventPage).not.toHaveBeenCalled();
  });

  it("valid cover lands in the event folder and passes the URL guard", async () => {
    const { upload, remove } = setup();
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(isEventCoverUrl(body.url)).toBe(true);
    expect(upload.mock.calls[0][0]).toBe(NEW_PATH);
    expect(remove).not.toHaveBeenCalled();
  });

  it("denies a non-allowlisted org before uploading", async () => {
    const { upload } = setup({ org: "other-org" });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("removes the newly uploaded object when URL persist returns an error", async () => {
    const { upload, remove } = setup({ failPatch: "error", previousCoverUrl: null });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([NEW_PATH]);
  });

  it("removes the newly uploaded object when URL persist throws", async () => {
    const { upload, remove } = setup({ failPatch: "throw", previousCoverUrl: null });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([NEW_PATH]);
  });

  it("removes the newly uploaded object when the event disappears before URL persist (zero rows)", async () => {
    // Ownership lookup succeeded; event is gone by the time cover_image_url is written.
    const { upload, remove } = setup({ failPatch: "zero-row", previousCoverUrl: null });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([NEW_PATH]);
  });

  it("treats a silent zero-row persist (no error, no id) as failure and cleans up", async () => {
    const { upload, remove } = setup({ failPatch: "zero-row-silent", previousCoverUrl: null });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([NEW_PATH]);
  });

  it("does not delete a previous cover that is still referenced after a failed replacement", async () => {
    // Row still points at OLD jpg; new webp upload then DB fail. Roll back only
    // the unreferenced webp. Old jpg stays (and remove is never asked to touch it).
    const { remove } = setup({
      failPatch: "error",
      previousCoverUrl: OLD_URL,
      newPathRefCount: 0,
      oldPathRefCount: 1,
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([NEW_PATH]);
    expect(remove).not.toHaveBeenCalledWith([OLD_PATH]);
  });

  it("keeps a newly uploaded path that is still referenced (same-path upsert)", async () => {
    // Previous cover already lived at cover.webp; upsert overwrote bytes but the
    // row still references that path. Rollback must not remove it.
    const sameUrl = `${NEW_URL}?v=old`;
    const { remove } = setup({
      failPatch: "error",
      previousCoverUrl: sameUrl,
      newPathRefCount: 1,
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(remove).not.toHaveBeenCalled();
  });

  it("zero-row persist also keeps a still-referenced same-path object", async () => {
    const sameUrl = `${NEW_URL}?v=old`;
    const { remove } = setup({
      failPatch: "zero-row",
      previousCoverUrl: sameUrl,
      newPathRefCount: 1,
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(remove).not.toHaveBeenCalled();
  });
});
