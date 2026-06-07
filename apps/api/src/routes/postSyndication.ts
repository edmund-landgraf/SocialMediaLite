import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { postSyndicationSnapshotSchema, postSyndicationUpsertSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  canManagePostSyndication,
  postSyndicationPublicUrl,
  resolveWebAppOrigin,
  upsertPostSyndicationSnapshot,
} from "../services/postSyndication.js";
import { renderPostSyndicationHtml } from "../services/postSyndicationPage.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";
import { loadSyndicationPushContext } from "../services/syndicationPush/context.js";
import { buildSyndicationPublicPushActions } from "../services/syndicationPush/registry.js";

const postIdSchema = z.string().uuid();
const tokenSchema = z.string().trim().min(8).max(64);

function syndicationResponse(
  req: Request,
  row: { token: string; refreshedAt: Date; randomizeNames: boolean },
) {
  return {
    token: row.token,
    url: postSyndicationPublicUrl(req, row.token),
    refreshedAt: row.refreshedAt.toISOString(),
    randomizeNames: row.randomizeNames,
  };
}

export async function getPublicPostSyndicationPage(req: Request, res: Response) {
  const parsed = tokenSchema.safeParse(req.params.token);
  if (!parsed.success) {
    res.status(404).send("Not found");
    return;
  }

  const row = await prisma.postSyndication.findUnique({
    where: { token: parsed.data },
  });
  if (!row) {
    res.status(404).send("Not found");
    return;
  }

  const snapshotParsed = postSyndicationSnapshotSchema.safeParse(row.snapshotJson);
  if (!snapshotParsed.success) {
    res.status(500).send("Invalid syndication snapshot");
    return;
  }

  const pageUrl = postSyndicationPublicUrl(req, row.token);
  const pushCtx = await loadSyndicationPushContext(req, parsed.data);
  const pushActions = pushCtx ? buildSyndicationPublicPushActions(pushCtx) : [];

  const fbPush =
    typeof req.query.fbPush === "string" && (req.query.fbPush === "success" || req.query.fbPush === "error")
      ? req.query.fbPush
      : undefined;
  const fbPushReason = typeof req.query.reason === "string" ? req.query.reason : undefined;
  const fbPushPage = typeof req.query.fbPage === "string" ? req.query.fbPage : undefined;

  res
    .status(200)
    .type("html")
    .send(
      renderPostSyndicationHtml({
        snapshot: snapshotParsed.data,
        refreshedAt: row.refreshedAt.toISOString(),
        pageUrl,
        webOrigin: resolveWebAppOrigin(req),
        pushActions,
        pushStatus:
          fbPush != null
            ? { outcome: fbPush, reason: fbPushReason, pageName: fbPushPage }
            : undefined,
      }),
    );
}

export const postSyndicationRouter = Router();
postSyndicationRouter.use(requireAuth);

postSyndicationRouter.get("/posts/:postId/syndication", async (req, res) => {
  const postIdParsed = postIdSchema.safeParse(req.params.postId);
  if (!postIdParsed.success) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const post = await prisma.post.findUnique({
    where: { id: postIdParsed.data },
    select: { id: true, authorId: true, profileOwnerId: true },
  });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const viewerId = req.session.userId!;
  if (!canManagePostSyndication(viewerId, post)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const row = await prisma.postSyndication.findUnique({
    where: { postId: post.id },
  });
  if (!row) {
    res.status(404).json({ error: "No public link yet" });
    return;
  }

  res.json({
    syndication: syndicationResponse(req, row),
  });
});

postSyndicationRouter.post("/posts/:postId/syndication", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }

  const postIdParsed = postIdSchema.safeParse(req.params.postId);
  if (!postIdParsed.success) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const bodyParsed = postSyndicationUpsertSchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.flatten() });
    return;
  }

  const post = await prisma.post.findUnique({
    where: { id: postIdParsed.data },
    select: { id: true, authorId: true, profileOwnerId: true },
  });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const viewerId = req.session.userId!;
  if (!canManagePostSyndication(viewerId, post)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const existing = await prisma.postSyndication.findUnique({
    where: { postId: post.id },
    select: { id: true },
  });

  const row = await upsertPostSyndicationSnapshot({
    req,
    postId: post.id,
    viewerId,
    randomizeNames: bodyParsed.data.randomizeNames,
  });
  if (!row) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.status(existing ? 200 : 201).json({
    syndication: syndicationResponse(req, row),
  });
});

postSyndicationRouter.delete("/posts/:postId/syndication", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }

  const postIdParsed = postIdSchema.safeParse(req.params.postId);
  if (!postIdParsed.success) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const post = await prisma.post.findUnique({
    where: { id: postIdParsed.data },
    select: { id: true, authorId: true, profileOwnerId: true },
  });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const viewerId = req.session.userId!;
  if (!canManagePostSyndication(viewerId, post)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const existing = await prisma.postSyndication.findUnique({
    where: { postId: post.id },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "No public link yet" });
    return;
  }

  await prisma.postSyndication.delete({ where: { postId: post.id } });
  res.status(204).end();
});
