import type { SessionData } from "express-session";

const CAPTCHA_TTL_MS = 10 * 60 * 1000;

function randomDigit(): number {
  return Math.floor(Math.random() * 9) + 1;
}

export function issueFeedbackCaptcha(session: SessionData): { question: string } {
  const a = randomDigit();
  const b = randomDigit();
  session.feedbackCaptchaAnswer = a + b;
  session.feedbackCaptchaExpiresAt = Date.now() + CAPTCHA_TTL_MS;
  return { question: `What is ${a} + ${b}?` };
}

export function verifyFeedbackCaptcha(session: SessionData, answer: number): boolean {
  const expected = session.feedbackCaptchaAnswer;
  const expiresAt = session.feedbackCaptchaExpiresAt;
  delete session.feedbackCaptchaAnswer;
  delete session.feedbackCaptchaExpiresAt;

  if (expected == null || expiresAt == null || Date.now() > expiresAt) {
    return false;
  }
  return answer === expected;
}
