import { describe, expect, it } from "vitest";
import { issueFeedbackCaptcha, verifyFeedbackCaptcha } from "./feedbackCaptcha.js";

describe("feedbackCaptcha", () => {
  it("issues and verifies a math answer", () => {
    const session: { feedbackCaptchaAnswer?: number; feedbackCaptchaExpiresAt?: number } = {};
    const { question } = issueFeedbackCaptcha(session);
    expect(question).toMatch(/^What is \d+ \+ \d+\?$/);

    const match = question.match(/^What is (\d+) \+ (\d+)\?$/);
    expect(match).not.toBeNull();
    const answer = Number(match![1]) + Number(match![2]);
    expect(verifyFeedbackCaptcha(session, answer)).toBe(true);
    expect(session.feedbackCaptchaAnswer).toBeUndefined();
  });

  it("rejects a wrong answer", () => {
    const session: { feedbackCaptchaAnswer?: number; feedbackCaptchaExpiresAt?: number } = {};
    issueFeedbackCaptcha(session);
    expect(verifyFeedbackCaptcha(session, -1)).toBe(false);
  });
});
