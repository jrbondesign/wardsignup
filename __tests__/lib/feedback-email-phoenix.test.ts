/**
 * @jest-environment node
 */
import { buildFeedbackDigestEmailHtml } from "@/lib/feedback-email";

describe("feedback digest dates use the Phoenix day", () => {
  it("a response at Sunday 8 PM Phoenix (Monday 03:00Z) shows Sunday's date", () => {
    const html = buildFeedbackDigestEmailHtml({
      brand: { name: "Ward Signup" } as never,
      responses: [
        {
          email_lower: "a@b.co",
          answer_pmf: null,
          answer_retention: null,
          answer_value: null,
          answer_blocker: null,
          responded_at: "2026-10-19T03:00:00Z",
        },
      ] as never,
    });
    expect(html).toContain("2026-10-18");
    expect(html).not.toContain("2026-10-19");
  });
});
