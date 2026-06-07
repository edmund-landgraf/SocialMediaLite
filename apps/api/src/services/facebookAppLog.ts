import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const FACEBOOK_LOGIN_APP_LOG_PATH = path.resolve(
  process.cwd(),
  "logs",
  "facebook-login.log",
);

export const FACEBOOK_WRITE_POSTS_APP_LOG_PATH = path.resolve(
  process.cwd(),
  "logs",
  "facebook-write-posts.log",
);

export type FacebookAppLogEvent = {
  action: string;
  success?: boolean;
  userId?: string | null;
  requestPath?: string;
  scope?: string;
  syndicationToken?: string;
  fbPostId?: string;
  fbPageId?: string;
  fbPageName?: string;
  graphEndpoint?: string;
  httpStatus?: number;
  error?: string;
  meta?: Record<string, unknown>;
};

function trimForLog(value: string, max = 1200): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

function loginAppId(): string | null {
  return process.env.FACEBOOK_APP_ID?.trim() || null;
}

function writePostsAppId(): string | null {
  return process.env.FACEBOOK_WRITE_POSTS_APP_ID?.trim() || null;
}

async function appendFacebookLog(
  logPath: string,
  app: "login" | "write_posts",
  appId: string | null,
  event: FacebookAppLogEvent,
): Promise<void> {
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    const sanitized: Record<string, unknown> = {
      ts: new Date().toISOString(),
      app,
      appId: appId ?? "unconfigured",
      ...event,
    };
    if (typeof sanitized.error === "string") {
      sanitized.error = trimForLog(sanitized.error);
    }
    const line = `${JSON.stringify(sanitized)}\n`;
    await appendFile(logPath, line, "utf8");
  } catch {
    // Never fail request flow when debug logging fails.
  }
}

/** SocialMediaLite / ReadOnlyPosts — login, import, reel metadata (app token). */
export async function logFacebookLoginApp(event: FacebookAppLogEvent): Promise<void> {
  await appendFacebookLog(FACEBOOK_LOGIN_APP_LOG_PATH, "login", loginAppId(), event);
}

/** WritePostsOnly — syndication push, Page OAuth, Page publish. */
export async function logFacebookWritePostsApp(event: FacebookAppLogEvent): Promise<void> {
  await appendFacebookLog(
    FACEBOOK_WRITE_POSTS_APP_LOG_PATH,
    "write_posts",
    writePostsAppId(),
    event,
  );
}
