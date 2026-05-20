import { Router } from "express";
import multer from "multer";
import { usernameParamSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { areAcceptedFriends } from "../services/access.js";
import { processImageToMaxSize } from "../services/image.js";
import { AI_FRIEND } from "../services/aiFriend.js";
import { offlineGlowbyteUserRow, OFFLINE_TEST_USERNAME, offlineTestUserRow } from "../services/offlineSeedData.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";
import { serializeUser } from "../services/serializers.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    const u = offlineTestUserRow();
    res.json({
      user: {
        ...serializeUser(u),
        bannerUrl: null,
      },
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    user: {
      ...serializeUser(user),
      bannerUrl:
        user.bannerImageKey != null
          ? `${baseUrl}${req.storage.getPublicUrl(user.bannerImageKey)}`
          : null,
    },
  });
});

usersRouter.get("/users/:username", requireAuth, async (req, res) => {
  const params = usernameParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.flatten() });
    return;
  }

  if (isOfflineTestUserSession(req)) {
    const un = params.data.username;
    if (un === OFFLINE_TEST_USERNAME) {
      const profile = offlineTestUserRow();
      const viewerId = req.session.userId!;
      const isSelf = viewerId === profile.id;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const userPayload = {
        ...serializeUser(profile),
        bannerUrl:
          profile.bannerImageKey != null
            ? `${baseUrl}${req.storage.getPublicUrl(profile.bannerImageKey)}`
            : null,
      };
      res.json({
        user: userPayload,
        meta: { isSelf, friendshipStatus: "self" as const, canViewContent: true },
      });
      return;
    }
    if (un === AI_FRIEND.username) {
      const profile = offlineGlowbyteUserRow();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const userPayload = {
        ...serializeUser(profile),
        bannerUrl:
          profile.bannerImageKey != null
            ? `${baseUrl}${req.storage.getPublicUrl(profile.bannerImageKey)}`
            : null,
      };
      res.json({
        user: userPayload,
        meta: {
          isSelf: false,
          friendshipStatus: "accepted" as const,
          canViewContent: true,
        },
      });
      return;
    }
    res.status(404).json({ error: "User not found" });
    return;
  }

  const profile = await prisma.user.findUnique({
    where: { username: params.data.username },
  });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const viewerId = req.session.userId!;
  const isSelf = viewerId === profile.id;
  const isFriend = await areAcceptedFriends(viewerId, profile.id);
  const canViewContent = isSelf || isFriend;

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: profile.id },
        { requesterId: profile.id, addresseeId: viewerId },
      ],
    },
  });

  let friendshipStatus:
    | "self"
    | "none"
    | "pending_out"
    | "pending_in"
    | "accepted"
    | "blocked" = "none";
  if (isSelf) friendshipStatus = "self";
  else if (friendship) {
    if (friendship.status === "ACCEPTED") friendshipStatus = "accepted";
    else if (friendship.status === "BLOCKED") friendshipStatus = "blocked";
    else if (friendship.status === "PENDING")
      friendshipStatus = friendship.requesterId === viewerId ? "pending_out" : "pending_in";
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const userPayload = canViewContent
    ? {
        ...serializeUser(profile),
        bannerUrl:
          profile.bannerImageKey != null
            ? `${baseUrl}${req.storage.getPublicUrl(profile.bannerImageKey)}`
            : null,
      }
    : {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        profilePicUrl: profile.profilePicUrl,
        bannerImageKey: null,
        bannerUrl: null as string | null,
        createdAt: profile.createdAt,
      };

  res.json({
    user: userPayload,
    meta: { isSelf, friendshipStatus, canViewContent },
  });
});

usersRouter.patch("/me/banner", requireAuth, upload.single("banner"), async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Missing banner file" });
    return;
  }
  const userId = req.session.userId!;
  let processed;
  try {
    processed = await processImageToMaxSize(req.file.buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid image";
    res.status(400).json({ error: message });
    return;
  }

  const key = `users/${userId}/banner-${Date.now()}.webp`;
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (me?.bannerImageKey) {
    await req.storage.deleteObject(me.bannerImageKey).catch(() => undefined);
  }

  await req.storage.putObject({
    key,
    contentType: processed.contentType,
    buffer: processed.buffer,
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { bannerImageKey: key },
  });

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    user: {
      ...serializeUser(updated),
      bannerUrl: `${baseUrl}${req.storage.getPublicUrl(key)}`,
    },
  });
});
