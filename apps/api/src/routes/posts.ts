import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { usernameParamSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { assertCanAccessProfile } from "../services/access.js";
import { buildStoredLinkPreview } from "../services/linkPreview.js";
import { processImageToMaxSize } from "../services/image.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const createJsonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    text: z.string().trim().min(1).max(32000),
  }),
  z.object({
    type: z.literal("VIDEO_LINK"),
    /** Video or general article / page URL — server builds an Open Graph style preview card. */
    videoUrl: z.string().trim().url().max(2048),
    text: z.string().trim().max(32000).optional(),
  }),
]);

const photoCaptionSchema = z.string().trim().max(80);

export const postsRouter = Router();
postsRouter.use(requireAuth);

function maybeMultipart(req: Request, res: Response, next: NextFunction) {
  const ct = req.headers["content-type"] ?? "";
  if (typeof ct === "string" && ct.includes("multipart/form-data")) {
    upload.single("photo")(req, res, (err: unknown) => {
      if (err) {
        next(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      next();
    });
    return;
  }
  next();
}

function postAssetPublicUrl(req: Request, assetKey: string | null | undefined): string | null {
  if (!assetKey) return null;
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${req.storage.getPublicUrl(assetKey)}`;
}

function serializePost<T extends { photoKey: string | null; linkPreviewImageKey?: string | null }>(
  req: Request,
  post: T,
): T & { photoUrl: string | null; linkPreviewUrl: string | null } {
  return {
    ...post,
    photoUrl: postAssetPublicUrl(req, post.photoKey),
    linkPreviewUrl: postAssetPublicUrl(req, post.linkPreviewImageKey ?? null),
  };
}

postsRouter.get("/users/:username/posts", async (req, res) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.flatten() });
    return;
  }
  const owner = await prisma.user.findUnique({
    where: { username: params.data.username },
  });
  if (!owner) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const viewerId = req.session.userId!;
  try {
    await assertCanAccessProfile(viewerId, owner.id);
  } catch {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const posts = await prisma.post.findMany({
    where: { profileOwnerId: owner.id },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: {
      author: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
      _count: { select: { comments: true } },
    },
  });

  res.json({
    posts: posts.map((p) => serializePost(req, p)),
  });
});

postsRouter.post("/users/:username/posts", maybeMultipart, async (req, res) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.flatten() });
    return;
  }
  const owner = await prisma.user.findUnique({
    where: { username: params.data.username },
  });
  if (!owner) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const viewerId = req.session.userId!;
  try {
    await assertCanAccessProfile(viewerId, owner.id);
  } catch {
    res.status(403).json({ error: "You can only post on your page or a friend's page." });
    return;
  }

  const file = req.file;

  if (file) {
    let processed;
    try {
      processed = await processImageToMaxSize(file.buffer);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid image";
      res.status(400).json({ error: message });
      return;
    }
    const captionParsed = photoCaptionSchema.safeParse(
      typeof req.body?.caption === "string" ? req.body.caption : "",
    );
    if (!captionParsed.success) {
      res.status(400).json({ error: captionParsed.error.flatten() });
      return;
    }
    const caption = captionParsed.data;
    const key = `users/${viewerId}/post-${Date.now()}.webp`;
    await req.storage.putObject({
      key,
      contentType: processed.contentType,
      buffer: processed.buffer,
    });
    const post = await prisma.post.create({
      data: {
        authorId: viewerId,
        profileOwnerId: owner.id,
        type: "PHOTO",
        photoKey: key,
        photoCaption: caption.length > 0 ? caption : null,
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, profilePicUrl: true },
        },
      },
    });
    res.status(201).json({
      post: serializePost(req, post),
    });
    return;
  }

  const parsed = createJsonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  if (body.type === "TEXT") {
    const post = await prisma.post.create({
      data: {
        authorId: viewerId,
        profileOwnerId: owner.id,
        type: "TEXT",
        text: body.text,
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, profilePicUrl: true },
        },
      },
    });
    res.status(201).json({
      post: serializePost(req, post),
    });
    return;
  }

  const preview = await buildStoredLinkPreview({
    pageUrlStr: body.videoUrl,
    authorId: viewerId,
    storage: req.storage,
  });

  const post = await prisma.post.create({
    data: {
      authorId: viewerId,
      profileOwnerId: owner.id,
      type: "VIDEO_LINK",
      videoUrl: body.videoUrl,
      text: body.text ?? null,
      linkTitle: preview.linkTitle,
      linkDescription: preview.linkDescription,
      linkPreviewImageKey: preview.linkPreviewImageKey,
    },
    include: {
      author: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
    },
  });
  res.status(201).json({
    post: serializePost(req, post),
  });
});

postsRouter.patch("/posts/:postId/photo-caption", async (req, res) => {
  const body = z.object({ caption: photoCaptionSchema }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
  if (!post) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (post.type !== "PHOTO") {
    res.status(400).json({ error: "Only photo captions can be edited" });
    return;
  }
  if (post.authorId !== viewerId && post.profileOwnerId !== viewerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const caption = body.data.caption;
  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { photoCaption: caption.length > 0 ? caption : null },
    include: {
      author: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
      _count: { select: { comments: true } },
    },
  });
  res.json({ post: serializePost(req, updated) });
});

postsRouter.post("/posts/:postId/pin", async (req, res) => {
  const postId = req.params.postId;
  const body = z
    .object({ pinned: z.boolean() })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });
  if (!post || post.profileOwnerId !== viewerId) {
    res.status(403).json({ error: "Only page owner can pin" });
    return;
  }

  if (!body.data.pinned) {
    const updated = await prisma.post.update({
      where: { id: postId },
      data: { isPinned: false },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, profilePicUrl: true },
        },
      },
    });
    res.json({
      post: serializePost(req, updated),
    });
    return;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.post.updateMany({
        where: { profileOwnerId: viewerId, isPinned: true },
        data: { isPinned: false },
      });
      return tx.post.update({
        where: { id: postId },
        data: { isPinned: true },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, profilePicUrl: true },
          },
        },
      });
    });
    res.json({
      post: serializePost(req, updated),
    });
  } catch {
    res.status(409).json({ error: "Could not pin post" });
  }
});

postsRouter.delete("/posts/:postId", async (req, res) => {
  const postId = req.params.postId;
  const viewerId = req.session.userId!;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const canDelete = post.authorId === viewerId || post.profileOwnerId === viewerId;
  if (!canDelete) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (post.photoKey) {
    await req.storage.deleteObject(post.photoKey).catch(() => undefined);
  }
  if (post.linkPreviewImageKey) {
    await req.storage.deleteObject(post.linkPreviewImageKey).catch(() => undefined);
  }
  await prisma.post.delete({ where: { id: postId } });
  res.json({ ok: true });
});
