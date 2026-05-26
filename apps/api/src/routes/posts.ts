import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { usernameParamSchema, textPostFontSizeSchema, textPostHexColorSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { assertCanAccessProfile } from "../services/access.js";
import { AI_FRIEND } from "../services/aiFriend.js";
import { buildStoredLinkPreview } from "../services/linkPreview.js";
import { processImageToMaxSize } from "../services/image.js";
import {
  offlineGlowbyteIntroPhotoDataUrl,
  offlineGlowbyteWallPostRows,
  OFFLINE_TEST_USERNAME,
} from "../services/offlineSeedData.js";
import {
  rankFriendsFeedPosts,
  type FriendsFeedCandidate,
} from "../services/friendsFeedRank.js";
import {
  buildFriendsFeedBucketCounts,
  postMatchesFriendsFeedBucket,
  purgeExpiredDiscardedFriendsFeedReviews,
  sortPostsForFriendsFeedBucket,
  upsertFriendsFeedReview,
  type FriendsFeedBucket,
} from "../services/friendsFeedReview.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";

const friendsFeedBucketSchema = z.enum(["unread", "read", "saved", "discarded"]);
const friendsFeedReviewActionSchema = z.enum(["read", "save", "discard"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const createJsonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    text: z.string().trim().min(1).max(32000),
    textBackgroundColor: textPostHexColorSchema.optional(),
    textColor: textPostHexColorSchema.optional(),
    textFontSize: textPostFontSizeSchema.optional(),
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

function serializePost<
  T extends {
    photoKey: string | null;
    linkPreviewImageKey?: string | null;
    sharedToFriendsFeed?: boolean;
  },
>(req: Request, post: T): T & { photoUrl: string | null; linkPreviewUrl: string | null } {
  return {
    ...post,
    sharedToFriendsFeed: post.sharedToFriendsFeed ?? false,
    photoUrl: postAssetPublicUrl(req, post.photoKey),
    linkPreviewUrl: postAssetPublicUrl(req, post.linkPreviewImageKey ?? null),
  };
}

const postInclude = {
  author: {
    select: { id: true, username: true, displayName: true, profilePicUrl: true },
  },
  profileOwner: {
    select: { id: true, username: true, displayName: true, profilePicUrl: true },
  },
  _count: { select: { comments: true } },
} as const;

postsRouter.get("/users/:username/posts", async (req, res) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.flatten() });
    return;
  }

  if (isOfflineTestUserSession(req) && params.data.username === OFFLINE_TEST_USERNAME) {
    res.json({ posts: [] });
    return;
  }

  if (isOfflineTestUserSession(req) && params.data.username === AI_FRIEND.username) {
    const photoUrl = offlineGlowbyteIntroPhotoDataUrl();
    res.json({
      posts: offlineGlowbyteWallPostRows().map((p) => ({
        ...serializePost(req, p),
        photoUrl,
      })),
    });
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
    include: postInclude,
  });

  res.json({
    posts: posts.map((p) => serializePost(req, p)),
  });
});

postsRouter.get("/users/:username/friends-feed", async (req, res) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.flatten() });
    return;
  }

  const bucketParsed = friendsFeedBucketSchema.safeParse(
    typeof req.query.bucket === "string" ? req.query.bucket : "unread",
  );
  if (!bucketParsed.success) {
    res.status(400).json({ error: bucketParsed.error.flatten() });
    return;
  }
  const bucket: FriendsFeedBucket = bucketParsed.data;

  const viewerId = req.session.userId!;

  if (isOfflineTestUserSession(req) && params.data.username === OFFLINE_TEST_USERNAME) {
    const photoUrl = offlineGlowbyteIntroPhotoDataUrl();
    const gbPosts = offlineGlowbyteWallPostRows().map((p) => ({
      ...serializePost(req, { ...p, sharedToFriendsFeed: true }),
      photoUrl,
      profileOwner: {
        id: p.author.id,
        username: p.author.username,
        displayName: p.author.displayName,
        profilePicUrl: p.author.profilePicUrl,
      },
    }));
    res.json({
      posts: bucket === "unread" ? gbPosts : [],
      meta: {
        sharableTotal: gbPosts.length,
        rankedCount: bucket === "unread" ? gbPosts.length : 0,
        bucket,
        counts: {
          unread: gbPosts.length,
          read: 0,
          saved: 0,
          discarded: 0,
        },
      },
    });
    return;
  }

  const pageOwner = await prisma.user.findUnique({
    where: { username: params.data.username },
  });
  if (!pageOwner) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (pageOwner.id !== viewerId) {
    res.status(403).json({ error: "Friends feed is only available on your own page" });
    return;
  }

  await purgeExpiredDiscardedFriendsFeedReviews(viewerId);

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) =>
    f.requesterId === viewerId ? f.addresseeId : f.requesterId,
  );
  if (friendIds.length === 0) {
    res.json({
      posts: [],
      meta: {
        sharableTotal: 0,
        rankedCount: 0,
        bucket,
        counts: { unread: 0, read: 0, saved: 0, discarded: 0 },
      },
    });
    return;
  }

  const sharedPosts = await prisma.post.findMany({
    where: {
      sharedToFriendsFeed: true,
      profileOwnerId: { in: friendIds },
    },
    include: postInclude,
  });

  const postIds = sharedPosts.map((p) => p.id);
  const reviews = postIds.length
    ? await prisma.friendsFeedReview.findMany({
        where: { viewerId, postId: { in: postIds } },
        select: { postId: true, status: true, updatedAt: true },
      })
    : [];

  const counts = buildFriendsFeedBucketCounts(postIds, reviews);
  const reviewsByPostId = new Map(reviews.map((r) => [r.postId, r.status]));
  const reviewUpdatedAt = new Map(reviews.map((r) => [r.postId, r.updatedAt]));

  const bucketPosts = sharedPosts.filter((p) =>
    postMatchesFriendsFeedBucket(p.id, reviewsByPostId, bucket),
  );

  let ordered = bucketPosts;
  let metaExtras: { sharableTotal: number; rankedCount: number };

  if (bucket === "unread") {
    const authorSharedCounts = new Map<string, number>();
    for (const p of bucketPosts) {
      authorSharedCounts.set(p.authorId, (authorSharedCounts.get(p.authorId) ?? 0) + 1);
    }

    const candidates: FriendsFeedCandidate[] = bucketPosts.map((p) => ({
      postId: p.id,
      authorId: p.authorId,
      profileOwnerId: p.profileOwnerId,
      createdAt: p.createdAt,
      commentCount: p._count.comments,
      authorSharedPostCount: authorSharedCounts.get(p.authorId) ?? 1,
    }));

    const appearanceHistory = req.session.friendsFeedAppearances ?? {};
    const { ranked, nextAppearanceHistory, meta } = rankFriendsFeedPosts(candidates, appearanceHistory);
    req.session.friendsFeedAppearances = nextAppearanceHistory;

    const rankById = new Map(ranked.map((r, i) => [r.postId, i]));
    ordered = [...bucketPosts].sort(
      (a, b) => (rankById.get(a.id) ?? 999) - (rankById.get(b.id) ?? 999),
    );
    metaExtras = { sharableTotal: meta.sharableTotal, rankedCount: ordered.length };
  } else {
    ordered = sortPostsForFriendsFeedBucket(bucketPosts, bucket, reviewUpdatedAt);
    metaExtras = { sharableTotal: sharedPosts.length, rankedCount: ordered.length };
  }

  res.json({
    posts: ordered.map((p) => serializePost(req, p)),
    meta: {
      ...metaExtras,
      bucket,
      counts,
    },
  });
});

postsRouter.post("/posts/:postId/friends-feed-review", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }

  const body = z.object({ action: friendsFeedReviewActionSchema }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const postId = req.params.postId;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, sharedToFriendsFeed: true, profileOwnerId: true },
  });
  if (!post || !post.sharedToFriendsFeed) {
    res.status(404).json({ error: "Shared post not found" });
    return;
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: viewerId, addresseeId: post.profileOwnerId },
        { requesterId: post.profileOwnerId, addresseeId: viewerId },
      ],
    },
  });
  if (!friendship) {
    res.status(403).json({ error: "Post is not from a friend" });
    return;
  }

  await purgeExpiredDiscardedFriendsFeedReviews(viewerId);
  await upsertFriendsFeedReview(viewerId, postId, body.data.action);

  res.json({ ok: true, action: body.data.action });
});

postsRouter.post("/posts/:postId/friends-feed-share", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const body = z.object({ shared: z.boolean() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const post = await prisma.post.findUnique({
    where: { id: req.params.postId },
    include: postInclude,
  });
  if (!post) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (post.profileOwnerId !== viewerId) {
    res.status(403).json({ error: "Only the page owner can share posts to the friends feed" });
    return;
  }

  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { sharedToFriendsFeed: body.data.shared },
    include: postInclude,
  });
  res.json({ post: serializePost(req, updated) });
});

postsRouter.post("/users/:username/posts", maybeMultipart, async (req, res) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.flatten() });
    return;
  }

  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
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
        textBackgroundColor: body.textBackgroundColor ?? null,
        textColor: body.textColor ?? null,
        textFontSize: body.textFontSize ?? null,
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
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
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
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
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
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
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
