import { describe, it, expect } from "@jest/globals";
import { maskEmail } from "@/lib/email-mask";

describe("maskEmail", () => {
  it("masks a standard email address", () => {
    expect(maskEmail("john@example.com")).toBe("j***@e***.com");
  });

  it("masks a short email address", () => {
    expect(maskEmail("a@b.co")).toBe("a***@b***.co");
  });

  it("masks an email with subdomain", () => {
    expect(maskEmail("user@mail.example.com")).toBe("u***@m***.example.com");
  });

  it("returns original if no @ symbol", () => {
    expect(maskEmail("notanemail")).toBe("notanemail");
  });

  it("returns original if empty local part", () => {
    expect(maskEmail("@example.com")).toBe("@example.com");
  });

  it("returns original if empty domain", () => {
    expect(maskEmail("user@")).toBe("user@");
  });

  it("handles single character local part", () => {
    expect(maskEmail("x@example.com")).toBe("x***@e***.com");
  });

  it("handles single character domain start", () => {
    expect(maskEmail("user@g.co")).toBe("u***@g***.co");
  });
});
