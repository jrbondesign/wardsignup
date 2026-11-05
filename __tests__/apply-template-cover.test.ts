/**
 * @jest-environment node
 */
import {
  templateCoverAssetForCreate,
  uploadTemplateCover,
} from "@/lib/apply-template-cover";

const ORG = "11111111-1111-1111-1111-111111111111";

describe("templateCoverAssetForCreate", () => {
  const prev = process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS;
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS;
    else process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = prev;
  });

  it("returns the Christmas party asset when the org is allowlisted", () => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = ORG;
    expect(templateCoverAssetForCreate("ward-christmas-party", ORG)).toBe(
      "/templates/ward-christmas-party.webp"
    );
  });

  it("returns null when the org is not allowlisted", () => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = "other-org";
    expect(templateCoverAssetForCreate("ward-christmas-party", ORG)).toBeNull();
  });

  it("returns null when cover feature is dark", () => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = "";
    expect(templateCoverAssetForCreate("ward-christmas-party", ORG)).toBeNull();
  });

  it("returns null for templates without a default cover", () => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = ORG;
    expect(templateCoverAssetForCreate("ward-potluck", ORG)).toBeNull();
    expect(templateCoverAssetForCreate(null, ORG)).toBeNull();
  });
});

describe("uploadTemplateCover", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects paths outside /templates/", async () => {
    const result = await uploadTemplateCover({
      eventId: "evt-1",
      token: "tok",
      assetPath: "/evil.webp",
    });
    expect(result).toEqual({ ok: false, error: "Invalid template cover path" });
  });

  it("fetches the asset and posts it to /api/upload as a cover", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href === "/templates/ward-christmas-party.webp") {
        return {
          ok: true,
          blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
        } as Response;
      }
      if (href === "/api/upload") {
        return {
          ok: true,
          json: async () => ({
            url: "https://example.supabase.co/storage/v1/object/public/event-media/u/events/evt-1/cover.webp?v=1",
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href}`);
    }) as typeof fetch;

    const result = await uploadTemplateCover({
      eventId: "evt-1",
      token: "tok-abc",
      assetPath: "/templates/ward-christmas-party.webp",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain("/events/evt-1/cover.webp");
    }
    expect(calls[0].url).toBe("/templates/ward-christmas-party.webp");
    expect(calls[1].url).toBe("/api/upload");
    expect(calls[1].init?.method).toBe("POST");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-abc"
    );
    const body = calls[1].init?.body as FormData;
    expect(body.get("type")).toBe("cover");
    expect(body.get("eventId")).toBe("evt-1");
    const file = body.get("file") as File;
    expect(file).toBeTruthy();
    expect(file.name).toBe("cover.webp");
    expect(file.type).toBe("image/webp");
  });

  it("surfaces upload API errors", async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "/templates/ward-christmas-party.webp") {
        return {
          ok: true,
          blob: async () => new Blob([new Uint8Array([1])], { type: "image/webp" }),
        } as Response;
      }
      return {
        ok: false,
        json: async () => ({ error: "Cover images aren't available yet" }),
      } as Response;
    }) as typeof fetch;

    const result = await uploadTemplateCover({
      eventId: "evt-1",
      token: "tok",
      assetPath: "/templates/ward-christmas-party.webp",
    });
    expect(result).toEqual({
      ok: false,
      error: "Cover images aren't available yet",
    });
  });
});
