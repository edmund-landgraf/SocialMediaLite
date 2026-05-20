import { Router } from "express";
import { z } from "zod";
import { commentTextSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { assertCanAccessProfile } from "../services/access.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

commentsRouter.get("/posts/:postId/comments", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ comments: [] });
    return;
  }
  const postId = req.params.postId;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { profileOwnerId: true },
  });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const viewerId = req.session.userId!;
  try {
    await assertCanAccessProfile(viewerId, post.profileOwnerId);
  } catch {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: {
      author: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
    },
  });

  res.json({ comments: rows });
});

commentsRouter.post("/posts/:postId/comments", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const postIdSchema = z.string().uuid();
  const postIdParsed = postIdSchema.safeParse(req.params.postId);
  if (!postIdParsed.success) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }
  const postId = postIdParsed.data;

  const textParsed = commentTextSchema.safeParse(req.body?.text);
  if (!textParsed.success) {
    res.status(400).json({ error: textParsed.error.flatten() });
    return;
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { profileOwnerId: true },
  });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const viewerId = req.session.userId!;
  try {
    await assertCanAccessProfile(viewerId, post.profileOwnerId);
  } catch {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const created = await prisma.comment.create({
    data: {
      postId,
      authorId: viewerId,
      text: textParsed.data,
    },
    include: {
      author: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
    },
  });

  res.status(201).json({ comment: created });
});
