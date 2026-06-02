import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import {
  FACEBOOK_STUB_AVATAR_URL,
  getStubTestUserProfile,
  isStubTestUserKind,
  stubLoginSchema,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { ensureAiFriendshipForUser } from "../services/aiFriend.js";
import {
  isPrismaConnectionError,
  offlineStubTestUserRow,
} from "../services/offlineTestUser.js";
import { loginStubTestUser } from "../services/stubTestUsers.js";
import { probeFacebookImportAccessToken } from "../services/facebookAccessToken.js";
import { serializeUser } from "../services/serializers.js";

export const authRouter = Router();
const FB_LOGIN_SCOPE = "public_profile,email";
const FB_IMPORT_SCOPE = "public_profile,email,user_posts";

type FacebookConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
};

function getFacebookRedirectUri(): string {
  const explicit = process.env.FACEBOOK_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const webOrigin = process.env.WEB_ORIGIN?.trim() || "http://localhost:5174";
  return `${webOrigin.replace(/\/+$/, "")}/api/auth/facebook/callback`;
}

function getFacebookConfig(): FacebookConfig | null {
  const appId = process.env.FACEBOOK_APP_ID?.trim() ?? "";
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim() ?? "";
  const redirectUri = getFacebookRedirectUri();
  const graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
  if (!appId || !appSecret) return null;
  return { appId, appSecret, redirectUri, graphVersion };
}

function safeOAuthReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

function parseFacebookGraphErrorBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string; code?: number; type?: string; error_subcode?: number };
    };
    const err = parsed.error;
    if (!err?.message) return trimmed.slice(0, 400);
    const parts = [err.message];
    if (err.code != null) parts.push(`code ${err.code}`);
    if (err.error_subcode != null) parts.push(`subcode ${err.error_subcode}`);
    if (err.type) parts.push(err.type);
    return parts.join(" · ");
  } catch {
    return trimmed.slice(0, 400);
  }
}

function facebookGraphRequestError(status: number, body: string, context: string): Error {
  const detail = parseFacebookGraphErrorBody(body);
  if (detail) return new Error(`${context}: ${detail}`);
  return new Error(`${context} (HTTP ${status})`);
}

function formatOAuthFailure(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P1001" || err.code === "P1003") {
      return "Database unreachable — check DATABASE_URL and run npm run db:deploy.";
    }
    const meta = err.meta ? JSON.stringify(err.meta) : "";
    return `Database error (${err.code})${meta ? `: ${meta}` : ""}`;
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return "Database initialization failed — check DATABASE_URL in .env.";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function redirectLoginError(res: Response, webOrigin: string, errorCode: string, reason: string) {
  const params = new URLSearchParams({
    error: errorCode,
    reason: reason.slice(0, 500),
  });
  res.redirect(`${webOrigin}/login?${params.toString()}`);
}

function toUsernameBase(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (cleaned.length >= 3) return cleaned.slice(0, 24);
  return "fbuser";
}

async function buildUniqueFacebookUsername(name: string, fbUserId: string): Promise<string> {
  const base = toUsernameBase(name);
  const suffixSeed = fbUserId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8) || "fb";
  for (let i = 0; i < 20; i++) {
    const suffix = i === 0 ? suffixSeed : `${suffixSeed}${i}`;
    const candidate = `${base}_${suffix}`.slice(0, 32);
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing) return candidate;
  }
  return `fbuser_${Date.now().toString(36)}`.slice(0, 32);
}

type FacebookMe = {
  id: string;
  name: string;
  email?: string | null;
  picture?: { data?: { url?: string | null } | null } | null;
};

async function exchangeFacebookCodeForToken(config: FacebookConfig, code: string): Promise<string> {
  const tokenUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);

  const res = await fetch(tokenUrl, { method: "GET" });
  const body = await res.text();
  if (!res.ok) {
    throw facebookGraphRequestError(res.status, body, "Facebook token exchange failed");
  }
  let data: { access_token?: string; error?: { message?: string } };
  try {
    data = JSON.parse(body) as { access_token?: string; error?: { message?: string } };
  } catch {
    throw new Error("Facebook token exchange returned invalid JSON");
  }
  if (data.error?.message) {
    throw new Error(`Facebook token exchange failed: ${data.error.message}`);
  }
  if (!data.access_token) throw new Error("Facebook token missing from response");
  return data.access_token;
}

async function fetchFacebookMe(config: FacebookConfig, accessToken: string): Promise<FacebookMe> {
  const meUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/me`);
  meUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
  meUrl.searchParams.set("access_token", accessToken);
  const res = await fetch(meUrl, { method: "GET" });
  const body = await res.text();
  if (!res.ok) {
    throw facebookGraphRequestError(res.status, body, "Facebook profile fetch failed");
  }
  const me = JSON.parse(body) as FacebookMe & { error?: { message?: string } };
  if (me.error?.message) {
    throw new Error(`Facebook profile fetch failed: ${me.error.message}`);
  }
  if (!me.id || !me.name) throw new Error("Facebook profile payload missing id or name");
  return me;
}

authRouter.get("/facebook/start", (req, res) => {
  startFacebookOAuth(req, res, { scope: FB_LOGIN_SCOPE });
});

/** Re-auth with user_posts for timeline import when the session token cannot read posts. */
authRouter.get("/facebook/import/start", async (req, res) => {
  const config = getFacebookConfig();
  if (!config) {
    res.status(500).json({
      error:
        "Facebook Login is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
    });
    return;
  }

  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5174";
  const returnTo = safeOAuthReturnTo(req.query.returnTo);
  const existingToken = req.session.facebookAccessToken;

  if (existingToken) {
    const probe = await probeFacebookImportAccessToken(existingToken);
    if (probe.ok) {
      if (returnTo) {
        res.redirect(`${webOrigin}${returnTo}`);
        return;
      }
      if (req.session.userId) {
        const user = await prisma.user.findUnique({
          where: { id: req.session.userId },
          select: { username: true },
        });
        if (user) {
          res.redirect(`${webOrigin}/${encodeURIComponent(user.username)}?fbImport=1`);
          return;
        }
      }
      res.redirect(`${webOrigin}/`);
      return;
    }
  }

  startFacebookOAuth(req, res, { scope: FB_IMPORT_SCOPE });
});

function startFacebookOAuth(req: Request, res: Response, opts: { scope: string }) {
  const config = getFacebookConfig();
  if (!config) {
    res.status(500).json({
      error:
        "Facebook Login is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
    });
    return;
  }
  const state = crypto.randomUUID();
  req.session.oauthState = state;
  const returnTo = safeOAuthReturnTo(req.query.returnTo);
  if (returnTo) {
    req.session.oauthReturnTo = returnTo;
  } else {
    delete req.session.oauthReturnTo;
  }

  const dialogUrl = new URL("https://www.facebook.com/dialog/oauth");
  dialogUrl.searchParams.set("client_id", config.appId);
  dialogUrl.searchParams.set("redirect_uri", config.redirectUri);
  dialogUrl.searchParams.set("state", state);
  dialogUrl.searchParams.set("response_type", "code");
  dialogUrl.searchParams.set("scope", opts.scope);
  res.redirect(dialogUrl.toString());
}

authRouter.get("/facebook/callback", async (req, res) => {
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5174";
  const config = getFacebookConfig();
  if (!config) {
    redirectLoginError(
      res,
      webOrigin,
      "fb_not_configured",
      "Facebook Login is not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
    );
    return;
  }

  const fbOAuthError = typeof req.query.error === "string" ? req.query.error : "";
  if (fbOAuthError) {
    const description =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : typeof req.query.error_reason === "string"
          ? req.query.error_reason
          : fbOAuthError;
    redirectLoginError(res, webOrigin, "fb_login_failed", description);
    return;
  }

  const oauthState = req.session.oauthState;
  const returnedState = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!oauthState || oauthState !== returnedState || !code) {
    const parts: string[] = [];
    if (!code) parts.push("Facebook did not return an authorization code.");
    if (!oauthState || oauthState !== returnedState) {
      parts.push(
        "Session state mismatch — your browser may not be sending cookies to the callback URL.",
      );
      parts.push(
        `Expected callback: ${config.redirectUri}. Use the same host/port you use to open the app (local dev: http://localhost:5174/api/auth/facebook/callback).`,
      );
    }
    redirectLoginError(res, webOrigin, "fb_state_or_code", parts.join(" "));
    return;
  }

  const returnTo = safeOAuthReturnTo(req.session.oauthReturnTo);
  delete req.session.oauthState;
  delete req.session.oauthReturnTo;
  try {
    const accessToken = await exchangeFacebookCodeForToken(config, code);
    const me = await fetchFacebookMe(config, accessToken);
    const existing = await prisma.user.findFirst({
      where: { fbUserId: me.id },
    });

    const profilePicUrl = me.picture?.data?.url ?? null;
    const email = me.email ?? null;
    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: me.name,
          email,
          fbUserId: me.id,
          profilePicUrl,
        },
      });
    } else {
      const username = await buildUniqueFacebookUsername(me.name, me.id);
      user = await prisma.user.create({
        data: {
          username,
          displayName: me.name,
          email,
          fbUserId: me.id,
          profilePicUrl,
        },
      });
    }

    await ensureAiFriendshipForUser(user.id);
    delete req.session.offlineTestUser;
    req.session.userId = user.id;
    /** Keep token on login and import so import can reuse a valid user_posts grant. */
    req.session.facebookAccessToken = accessToken;
    if (returnTo) {
      res.redirect(`${webOrigin}${returnTo}`);
      return;
    }
    res.redirect(`${webOrigin}/${encodeURIComponent(user.username)}`);
  } catch (err) {
    console.error("facebook callback failed:", err);
    redirectLoginError(res, webOrigin, "fb_login_failed", formatOAuthFailure(err));
  }
});

authRouter.post("/stub-login", async (req, res) => {
  const parsed = stubLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const kind = parsed.data.kind;

  if (isStubTestUserKind(kind)) {
    try {
      const user = await loginStubTestUser(kind);
      delete req.session.offlineTestUser;
      req.session.userId = user.id;
      res.json({ user: serializeUser(user) });
      return;
    } catch (e) {
      if (isPrismaConnectionError(e)) {
        const profile = getStubTestUserProfile(kind);
        req.session.userId = profile.offlineUserId;
        req.session.offlineTestUser = true;
        res.json({ user: serializeUser(offlineStubTestUserRow(kind)) });
        return;
      }
      console.error("stub-login failed:", e);

      let message = "Server error";
      let detail: string | undefined;

      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        detail = e.meta ? JSON.stringify(e.meta) : undefined;
        if (e.code === "P1001" || e.code === "P1003") {
          message =
            "Cannot reach Postgres. Ensure DATABASE_URL is set, the DB is running, and `npm run db:deploy` was applied.";
        } else {
          message = `Database error (${e.code}). Run migrations from the repo root: npm run db:deploy`;
        }
      } else if (e instanceof Prisma.PrismaClientInitializationError) {
        message =
          "Prisma initialization failed — check DATABASE_URL in your root `.env`. Run `npm run db:deploy` after Postgres is ready.";
      } else if (e instanceof Error) {
        detail = e.message;
      }

      res.status(500).json({
        error: message,
        ...(process.env.NODE_ENV !== "production" && detail !== undefined ? { detail } : {}),
      });
      return;
    }
  }

  if (kind !== "facebook_stub") {
    res.status(400).json({ error: "Unknown stub login kind" });
    return;
  }

  const identity = {
    username: "fbdemo",
    displayName: "Facebook Demo",
    email: "facebook.demo@example.test",
    fbUserId: "stub-facebook-001",
    profilePicUrl: FACEBOOK_STUB_AVATAR_URL,
  };

  try {
    const user = await prisma.user.upsert({
      where: { username: identity.username },
      create: {
        displayName: identity.displayName,
        username: identity.username,
        email: identity.email,
        fbUserId: identity.fbUserId,
        profilePicUrl: identity.profilePicUrl,
      },
      update: {
        displayName: identity.displayName,
        email: identity.email,
        fbUserId: identity.fbUserId,
        profilePicUrl: identity.profilePicUrl,
      },
    });

    await ensureAiFriendshipForUser(user.id);

    delete req.session.offlineTestUser;
    req.session.userId = user.id;
    res.json({ user: serializeUser(user) });
  } catch (e) {
    console.error("stub-login failed:", e);

    let message = "Server error";
    let detail: string | undefined;

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      detail = e.meta ? JSON.stringify(e.meta) : undefined;
      if (e.code === "P1001" || e.code === "P1003") {
        message =
          "Cannot reach Postgres. Ensure DATABASE_URL is set, the DB is running, and `npm run db:deploy` was applied.";
      } else {
        message = `Database error (${e.code}). Run migrations from the repo root: npm run db:deploy`;
      }
    } else if (e instanceof Prisma.PrismaClientInitializationError) {
      message =
        "Prisma initialization failed — check DATABASE_URL in your root `.env`. Run `npm run db:deploy` after Postgres is ready.";
    } else if (e instanceof Error) {
      detail = e.message;
    }

    res.status(500).json({
      error: message,
      ...(process.env.NODE_ENV !== "production" && detail !== undefined ? { detail } : {}),
    });
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sml.sid");
    res.json({ ok: true });
  });
});

