import { withUtm } from "@/lib/utm";

describe("withUtm", () => {
  it("appends UTM params to a clean URL", () => {
    const result = withUtm("https://example.com/event/123", {
      utm_source: "email",
      utm_medium: "newsletter",
      utm_campaign: "welcome",
    });
    expect(result).toBe(
      "https://example.com/event/123?utm_source=email&utm_medium=newsletter&utm_campaign=welcome"
    );
  });

  it("preserves existing query params", () => {
    const result = withUtm("https://example.com/event/123?token=abc", {
      utm_source: "email",
    });
    expect(result).toBe("https://example.com/event/123?token=abc&utm_source=email");
  });

  it("preserves hash fragments", () => {
    const result = withUtm("https://example.com/event/123#section", {
      utm_source: "email",
    });
    expect(result).toBe("https://example.com/event/123?utm_source=email#section");
  });

  it("preserves both query params and hash", () => {
    const result = withUtm("https://example.com/event/123?token=abc#section", {
      utm_source: "email",
      ref: "share",
    });
    expect(result).toBe("https://example.com/event/123?token=abc&utm_source=email&ref=share#section");
  });

  it("does not overwrite existing UTM params", () => {
    const result = withUtm("https://example.com/event/123?utm_source=existing", {
      utm_source: "new",
      utm_medium: "email",
    });
    expect(result).toBe("https://example.com/event/123?utm_source=existing&utm_medium=email");
  });

  it("does not overwrite existing ref param", () => {
    const result = withUtm("https://example.com/event/123?ref=existing", {
      ref: "new",
    });
    expect(result).toBe("https://example.com/event/123?ref=existing");
  });

  it("handles ref parameter", () => {
    const result = withUtm("https://example.com/event/123", {
      ref: "share",
    });
    expect(result).toBe("https://example.com/event/123?ref=share");
  });

  it("handles mixed UTM and ref parameters", () => {
    const result = withUtm("https://example.com/event/123", {
      utm_source: "qr",
      utm_medium: "print",
      utm_campaign: "event_qr",
    });
    expect(result).toBe(
      "https://example.com/event/123?utm_source=qr&utm_medium=print&utm_campaign=event_qr"
    );
  });

  it("only adds defined parameters", () => {
    const result = withUtm("https://example.com/event/123", {
      utm_source: "email",
    });
    expect(result).toBe("https://example.com/event/123?utm_source=email");
    expect(result).not.toContain("utm_medium");
    expect(result).not.toContain("utm_campaign");
  });

  it("returns original URL on invalid URL", () => {
    const invalid = "not-a-url";
    const result = withUtm(invalid, { utm_source: "test" });
    expect(result).toBe(invalid);
  });

  it("handles URL with port", () => {
    const result = withUtm("https://example.com:8080/event/123", {
      utm_source: "email",
    });
    expect(result).toBe("https://example.com:8080/event/123?utm_source=email");
  });

  it("handles URL with path and trailing slash", () => {
    const result = withUtm("https://example.com/event/123/", {
      utm_source: "email",
    });
    expect(result).toBe("https://example.com/event/123/?utm_source=email");
  });

  describe("email template scenarios", () => {
    it("welcome email", () => {
      const result = withUtm("https://wardsignup.com/", {
        utm_source: "welcome_email",
        utm_medium: "email",
        utm_campaign: "creator_welcome",
      });
      expect(result).toContain("utm_source=welcome_email");
      expect(result).toContain("utm_medium=email");
      expect(result).toContain("utm_campaign=creator_welcome");
    });

    it("invite email", () => {
      const result = withUtm("https://wardsignup.com/event/123", {
        utm_source: "invite_email",
        utm_medium: "email",
        utm_campaign: "invite",
      });
      expect(result).toContain("utm_source=invite_email");
      expect(result).toContain("utm_campaign=invite");
    });

    it("daily summary", () => {
      const result = withUtm("https://wardsignup.com/event/123", {
        utm_source: "organizer_email",
        utm_medium: "email",
        utm_campaign: "daily_summary",
      });
      expect(result).toContain("utm_campaign=daily_summary");
    });

    it("reminder email", () => {
      const result = withUtm("https://wardsignup.com/event/123", {
        utm_source: "participant_email",
        utm_medium: "email",
        utm_campaign: "reminder",
      });
      expect(result).toContain("utm_campaign=reminder");
    });

    it("QR code", () => {
      const result = withUtm("https://wardsignup.com/event/123", {
        utm_source: "qr",
        utm_medium: "print",
        utm_campaign: "event_qr",
      });
      expect(result).toContain("utm_source=qr");
      expect(result).toContain("utm_medium=print");
      expect(result).toContain("utm_campaign=event_qr");
    });

    it("share link", () => {
      const result = withUtm("https://wardsignup.com/event/123", {
        ref: "share",
      });
      expect(result).toBe("https://wardsignup.com/event/123?ref=share");
    });

    it("made with footer", () => {
      const result = withUtm("https://wardsignup.com/", {
        utm_source: "signup_sheet",
        utm_medium: "referral",
        utm_campaign: "made_with",
      });
      expect(result).toContain("utm_source=signup_sheet");
      expect(result).toContain("utm_medium=referral");
      expect(result).toContain("utm_campaign=made_with");
    });
  });
});
