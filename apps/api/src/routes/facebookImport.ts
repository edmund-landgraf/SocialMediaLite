import { Router, type Request } from "express";
import { z } from "zod";
import { isRealFacebookUser } from "@socialmedialite/shared";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";
import {
  fetchFacebookPostsFromGraph,
  filterFacebookPostsByTitle,
  importFacebookPostToWall,
} from "../services/facebookImport.js";
import { downloadFacebookImage } from "../services/facebookReelMetadata.js";

export const facebookImportRouter = Router();
facebookImportRouter.use(requireAuth);

function requireFacebookSession(req: Request) {
  const token = req.session.facebookAccessToken;
  if (!token) {
    return { error: "Facebook session expired. Log out and sign in with Facebook again.", status: 401 as const };
  }
  return { token };
}

async function requireRealFacebookUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fbUserId: true },
  });
  if (!user || !isRealFacebookUser(user.fbUserId)) {
    return { ok: false as const, error: "Facebook import is only available for real Facebook accounts." };
  }
  return { ok: true as const, user };
}

facebookImportRouter.get("/facebook/import/eligibility", async (req, res) => {
  const viewerId = req.session.userId!;
  const userCheck = await requireRealFacebookUser(viewerId);
  if (!userCheck.ok) {
    res.json({ eligible: false, reason: userCheck.error });
    return;
  }
  if (!req.session.facebookAccessToken) {
    res.json({
      eligible: false,
      reason: "Facebook access token missing. Log out and sign in with Facebook again.",
    });
    return;
  }
  res.json({ eligible: true });
});

function isAllowedFacebookPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.includes("fbcdn.net") || h.endsWith("facebook.com");
}

facebookImportRouter.get("/facebook/preview-image", async (req, res, next) => {
  const viewerId = req.session.userId!;
  const userCheck = await requireRealFacebookUser(viewerId);
  if (!userCheck.ok) {
    res.status(403).json({ error: userCheck.error });
    return;
  }
  const sessionCheck = requireFacebookSession(req);
  if ("error" in sessionCheck) {
    res.status(sessionCheck.status ?? 401).json({ error: sessionCheck.error });
    return;
  }

  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || !isAllowedFacebookPreviewHost(parsed.hostname)) {
      res.status(400).json({ error: "Invalid preview image url" });
      return;
    }
  } catch {
    res.status(400).json({ error: "Invalid preview image url" });
    return;
  }

  try {
    const buffer = await downloadFacebookImage(rawUrl, sessionCheck.token);
    if (!buffer) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

facebookImportRouter.get("/facebook/posts", async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ posts: [] });
    return;
  }
  const viewerId = req.session.userId!;
  const userCheck = await requireRealFacebookUser(viewerId);
  if (!userCheck.ok) {
    res.status(403).json({ error: userCheck.error });
    return;
  }
  const sessionCheck = requireFacebookSession(req);
  if ("error" in sessionCheck) {
    res.status(401).json({ error: sessionCheck.error });
    return;
  }

  const limitParsed = z.coerce.number().int().min(1).max(10).catch(10).parse(req.query.limit);
  try {
    const posts = await fetchFacebookPostsFromGraph(sessionCheck.token, limitParsed);
    res.json({ posts: posts.slice(0, limitParsed) });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

facebookImportRouter.post("/facebook/posts/search", async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const viewerId = req.session.userId!;
  const userCheck = await requireRealFacebookUser(viewerId);
  if (!userCheck.ok) {
    res.status(403).json({ error: userCheck.error });
    return;
  }
  const sessionCheck = requireFacebookSession(req);
  if ("error" in sessionCheck) {
    res.status(401).json({ error: sessionCheck.error });
    return;
  }

  const body = z.object({ query: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  try {
    const posts = await fetchFacebookPostsFromGraph(sessionCheck.token, 50);
    const matches = filterFacebookPostsByTitle(posts, body.data.query).slice(0, 10);
    res.json({ posts: matches, query: body.data.query });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

facebookImportRouter.post("/facebook/import", async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const viewerId = req.session.userId!;
  const userCheck = await requireRealFacebookUser(viewerId);
  if (!userCheck.ok) {
    res.status(403).json({ error: userCheck.error });
    return;
  }
  const sessionCheck = requireFacebookSession(req);
  if ("error" in sessionCheck) {
    res.status(401).json({ error: sessionCheck.error });
    return;
  }

  const body = z.object({ fbPostId: z.string().trim().min(1).max(128) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  try {
    const post = await importFacebookPostToWall({
      fbPostId: body.data.fbPostId,
      accessToken: sessionCheck.token,
      authorId: viewerId,
      profileOwnerId: viewerId,
      storage: req.storage,
    });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.status(201).json({
      post: {
        ...post,
        photoUrl: post.photoKey ? `${baseUrl}${req.storage.getPublicUrl(post.photoKey)}` : null,
        linkPreviewUrl: post.linkPreviewImageKey
          ? `${baseUrl}${req.storage.getPublicUrl(post.linkPreviewImageKey)}`
          : null,
      },
    });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});
