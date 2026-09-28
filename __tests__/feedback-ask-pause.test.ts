import { isFeedbackAskPaused } from "@/lib/feedback-ask-pause";

describe("isFeedbackAskPaused", () => {
  const prevPaused = process.env.FEEDBACK_ASK_PAUSED_BRANDS;

  afterEach(() => {
    if (prevPaused === undefined) delete process.env.FEEDBACK_ASK_PAUSED_BRANDS;
    else process.env.FEEDBACK_ASK_PAUSED_BRANDS = prevPaused;
  });

  it("is enabled by default", () => {
    delete process.env.FEEDBACK_ASK_PAUSED_BRANDS;
    expect(isFeedbackAskPaused("wardsignup")).toBe(false);
  });

  it("honors FEEDBACK_ASK_PAUSED_BRANDS", () => {
    process.env.FEEDBACK_ASK_PAUSED_BRANDS = " WardSignup , other";
    expect(isFeedbackAskPaused("wardsignup")).toBe(true);
  });
});
