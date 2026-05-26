import { Router } from "express";
import { z } from "zod";
import {
  feedbackBodySchema,
  feedbackCaptchaAnswerSchema,
  feedbackCommentTextSchema,
  feedbackTitleSchema,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { issueFeedbackCaptcha, verifyFeedbackCaptcha } from "../services/feedbackCaptcha.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  profilePicUrl: true,
} as const;

export const feedbackRouter = Router();

function serializeFeedbackItem(
  item: {
    id: string;
    authorId: string;
    title: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; username: string; displayName: string; profilePicUrl: string | null };
    _count: { comments: number };
  },
) {
  return {
    id: item.id,
    authorId: item.authorId,
    title: item.title,
    body: item.body,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    author: item.author,
    commentCount: item._count.comments,
  };
}

feedbackRouter.get("/feedback/captcha", (_req, res) => {
  const captcha = issueFeedbackCaptcha(_req.session);
  res.json(captcha);
});

feedbackRouter.get("/feedback", async (_req, res, next) => {
  if (isOfflineTestUserSession(_req)) {
    res.json({ items: [] });
    return;
  }
  try {
    const items = await prisma.feedbackItem.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: authorSelect },
        _count: { select: { comments: true } },
      },
    });
    res.json({ items: items.map(serializeFeedbackItem) });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

feedbackRouter.post("/feedback", requireAuth, async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const body = z
    .object({
      title: feedbackTitleSchema,
      body: feedbackBodySchema,
      captchaAnswer: feedbackCaptchaAnswerSchema,
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  if (!verifyFeedbackCaptcha(req.session, body.data.captchaAnswer)) {
    res.status(400).json({ error: "Incorrect or expired captcha. Please try again." });
    return;
  }
  try {
    const created = await prisma.feedbackItem.create({
      data: {
        authorId: req.session.userId!,
        title: body.data.title,
        body: body.data.body,
      },
      include: {
        author: { select: authorSelect },
        _count: { select: { comments: true } },
      },
    });
    res.status(201).json({ item: serializeFeedbackItem(created) });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

feedbackRouter.patch("/feedback/:feedbackId", requireAuth, async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const body = z.object({ title: feedbackTitleSchema, body: feedbackBodySchema }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const feedbackIdParsed = z.string().uuid().safeParse(req.params.feedbackId);
  if (!feedbackIdParsed.success) {
    res.status(400).json({ error: "Invalid feedback id" });
    return;
  }
  const feedbackId = feedbackIdParsed.data;
  const viewerId = req.session.userId!;
  try {
    const existing = await prisma.feedbackItem.findUnique({ where: { id: feedbackId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.authorId !== viewerId) {
      res.status(403).json({ error: "Only the author can edit this feedback" });
      return;
    }
    const updated = await prisma.feedbackItem.update({
      where: { id: feedbackId },
      data: { title: body.data.title, body: body.data.body },
      include: {
        author: { select: authorSelect },
        _count: { select: { comments: true } },
      },
    });
    res.json({ item: serializeFeedbackItem(updated) });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

feedbackRouter.get("/feedback/:feedbackId/comments", async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ comments: [] });
    return;
  }
  const feedbackIdParsed = z.string().uuid().safeParse(req.params.feedbackId);
  if (!feedbackIdParsed.success) {
    res.status(400).json({ error: "Invalid feedback id" });
    return;
  }
  const feedbackId = feedbackIdParsed.data;
  try {
    const item = await prisma.feedbackItem.findUnique({ where: { id: feedbackId }, select: { id: true } });
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await prisma.feedbackComment.findMany({
      where: { feedbackId },
      orderBy: { createdAt: "asc" },
      include: { author: { select: authorSelect } },
    });
    res.json({
      comments: rows.map((row) => ({
        id: row.id,
        postId: row.feedbackId,
        authorId: row.authorId,
        parentId: row.parentId,
        text: row.text,
        createdAt: row.createdAt.toISOString(),
        author: row.author,
      })),
    });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

feedbackRouter.post("/feedback/:feedbackId/comments", requireAuth, async (req, res, next) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const feedbackIdSchema = z.string().uuid();
  const feedbackIdParsed = feedbackIdSchema.safeParse(req.params.feedbackId);
  if (!feedbackIdParsed.success) {
    res.status(400).json({ error: "Invalid feedback id" });
    return;
  }
  const feedbackId = feedbackIdParsed.data;

  const bodyParsed = z
    .object({
      text: feedbackCommentTextSchema,
      parentId: z.string().uuid().optional(),
    })
    .safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.flatten() });
    return;
  }

  try {
    const item = await prisma.feedbackItem.findUnique({
      where: { id: feedbackId },
      select: { id: true },
    });
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { text, parentId } = bodyParsed.data;
    if (parentId) {
      const parent = await prisma.feedbackComment.findUnique({
        where: { id: parentId },
        select: { feedbackId: true },
      });
      if (!parent) {
        res.status(404).json({ error: "Parent comment not found" });
        return;
      }
      if (parent.feedbackId !== feedbackId) {
        res.status(400).json({ error: "Parent comment belongs to different feedback" });
        return;
      }
    }

    const created = await prisma.feedbackComment.create({
      data: {
        feedbackId,
        authorId: req.session.userId!,
        parentId: parentId ?? null,
        text,
      },
      include: { author: { select: authorSelect } },
    });

    res.status(201).json({
      comment: {
        id: created.id,
        postId: created.feedbackId,
        authorId: created.authorId,
        parentId: created.parentId,
        text: created.text,
        createdAt: created.createdAt.toISOString(),
        author: created.author,
      },
    });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});
