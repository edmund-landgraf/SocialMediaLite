import type { StorageProvider } from "../storage/types.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    /** Set when test_user stub login succeeds without Postgres (read-only demo). */
    offlineTestUser?: boolean;
    /** authorId → times shown on this viewer's Friends feed (stub ranking input). */
    friendsFeedAppearances?: Record<string, number>;
    /** One-time math captcha for posting feedback. */
    feedbackCaptchaAnswer?: number;
    feedbackCaptchaExpiresAt?: number;
    oauthReturnTo?: string;
    /** When true, OAuth callback stores facebookAccessToken for Graph import. */
    oauthStoreImportToken?: boolean;
    /** Short-lived token from Facebook OAuth — used for Graph import during session. */
    facebookAccessToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      storage: StorageProvider;
    }
  }
}

export {};
