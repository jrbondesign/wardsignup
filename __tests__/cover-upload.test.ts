/**
 * @jest-environment node
 */
import { coverFileError, COVER_MAX_ORIGINAL_BYTES } from "@/lib/cover-upload";

const fakeFile = (type: string, size: number) => ({ type, size }) as File;

describe("coverFileError", () => {
  it("accepts supported images within the limit", () => {
    expect(coverFileError(fakeFile("image/jpeg", 8 * 1024 * 1024))).toBeNull();
  });

  it("rejects unsupported types", () => {
    expect(coverFileError(fakeFile("image/gif", 1000))).toMatch(/JPEG, PNG, or WebP/);
    expect(coverFileError(fakeFile("image/heic", 1000))).toMatch(/isn't supported/);
  });

  it("rejects originals over 20 MB with the size in the message", () => {
    const msg = coverFileError(fakeFile("image/png", COVER_MAX_ORIGINAL_BYTES + 1));
    expect(msg).toMatch(/20\.0 MB|under 20 MB/);
  });
});
