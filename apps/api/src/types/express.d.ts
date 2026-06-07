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
    /** Short-lived token from Facebook OAuth — used for Graph import during session. */
    facebookAccessToken?: string;
    /** Syndication push (WritePostsOnly) OAuth state + target token. */
    syndicationPushOAuthState?: string;
    syndicationPushToken?: string;
    syndicationPushPartnerId?: string;
    /** Cached Page token from WritePostsOnly OAuth — enables one-click republish in same session. */
    facebookWritePostsPage?: {
      pageId: string;
      pageName: string;
      pageAccessToken: string;
    };
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
