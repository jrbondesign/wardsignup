import { isFeedbackAskPaused } from "@/lib/feedback-ask-pause";

describe("isFeedbackAskPaused", () => {
  const prevEnable = process.env.FEEDBACK_ASK_ENABLE_ORGSIGNUP;
  const prevPaused = process.env.FEEDBACK_ASK_PAUSED_BRANDS;

  afterEach(() => {
    if (prevEnable === undefined) delete process.env.FEEDBACK_ASK_ENABLE_ORGSIGNUP;
    else process.env.FEEDBACK_ASK_ENABLE_ORGSIGNUP = prevEnable;
    if (prevPaused === undefined) delete process.env.FEEDBACK_ASK_PAUSED_BRANDS;
    else process.env.FEEDBACK_ASK_PAUSED_BRANDS = prevPaused;
  });

  it("pauses orgsignup by default", () => {
    delete process.env.FEEDBACK_ASK_ENABLE_ORGSIGNUP;
    expect(isFeedbackAskPaused("orgsignup")).toBe(true);
    expect(isFeedbackAskPaused("wardsignup")).toBe(false);
  });

  it("allows orgsignup when explicitly enabled", () => {
    process.env.FEEDBACK_ASK_ENABLE_ORGSIGNUP = "1";
    expect(isFeedbackAskPaused("orgsignup")).toBe(false);
  });

  it("honors FEEDBACK_ASK_PAUSED_BRANDS", () => {
    process.env.FEEDBACK_ASK_PAUSED_BRANDS = "wardsignup, ministrysignup";
    expect(isFeedbackAskPaused("wardsignup")).toBe(true);
    expect(isFeedbackAskPaused("ministrysignup")).toBe(true);
  });
});
