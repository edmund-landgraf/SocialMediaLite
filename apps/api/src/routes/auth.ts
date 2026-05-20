import crypto from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { FACEBOOK_STUB_AVATAR_URL, stubLoginSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { ensureAiFriendshipForUser } from "../services/aiFriend.js";
import {
  isPrismaConnectionError,
  OFFLINE_TEST_USER_ID,
  offlineTestUserRow,
} from "../services/offlineTestUser.js";
import { serializeUser } from "../services/serializers.js";

export const authRouter = Router();
const FB_SCOPE = "public_profile,email";

type FacebookConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
};

function getFacebookConfig(): FacebookConfig | null {
  const appId = process.env.FACEBOOK_APP_ID?.trim() ?? "";
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim() ?? "";
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI?.trim() ?? "";
  const graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
  if (!appId || !appSecret || !redirectUri) return null;
  return { appId, appSecret, redirectUri, graphVersion };
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
  if (!res.ok) throw new Error(`Facebook token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Facebook token missing from response");
  return data.access_token;
}

async function fetchFacebookMe(config: FacebookConfig, accessToken: string): Promise<FacebookMe> {
  const meUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/me`);
  meUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
  meUrl.searchParams.set("access_token", accessToken);
  const res = await fetch(meUrl, { method: "GET" });
  if (!res.ok) throw new Error(`Facebook profile fetch failed (${res.status})`);
  const me = (await res.json()) as FacebookMe;
  if (!me.id || !me.name) throw new Error("Facebook profile payload missing id or name");
  return me;
}

authRouter.get("/facebook/start", (req, res) => {
  const config = getFacebookConfig();
  if (!config) {
    res.status(500).json({
      error:
        "Facebook Login is not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.",
    });
    return;
  }
  const state = crypto.randomUUID();
  (req.session as typeof req.session & { oauthState?: string }).oauthState = state;

  const dialogUrl = new URL("https://www.facebook.com/dialog/oauth");
  dialogUrl.searchParams.set("client_id", config.appId);
  dialogUrl.searchParams.set("redirect_uri", config.redirectUri);
  dialogUrl.searchParams.set("state", state);
  dialogUrl.searchParams.set("response_type", "code");
  dialogUrl.searchParams.set("scope", FB_SCOPE);
  res.redirect(dialogUrl.toString());
});

authRouter.get("/facebook/callback", async (req, res) => {
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5174";
  const config = getFacebookConfig();
  if (!config) {
    res.redirect(`${webOrigin}/login?error=fb_not_configured`);
    return;
  }
  const oauthState = (req.session as typeof req.session & { oauthState?: string }).oauthState;
  const returnedState = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!oauthState || oauthState !== returnedState || !code) {
    res.redirect(`${webOrigin}/login?error=fb_state_or_code`);
    return;
  }

  delete (req.session as typeof req.session & { oauthState?: string }).oauthState;

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
    res.redirect(`${webOrigin}/${encodeURIComponent(user.username)}`);
  } catch (err) {
    console.error("facebook callback failed:", err);
    res.redirect(`${webOrigin}/login?error=fb_login_failed`);
  }
});

authRouter.post("/stub-login", async (req, res) => {
  const parsed = stubLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const kind = parsed.data.kind;

  if (kind === "test_user") {
    const identity = {
      username: "testuser",
      displayName: "Test User",
      email: null as string | null,
      fbUserId: null as string | null,
      profilePicUrl: null as string | null,
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
      return;
    } catch (e) {
      if (isPrismaConnectionError(e)) {
        req.session.userId = OFFLINE_TEST_USER_ID;
        req.session.offlineTestUser = true;
        res.json({ user: serializeUser(offlineTestUserRow()) });
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

