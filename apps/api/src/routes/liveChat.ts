import { Router } from "express";
import {
  liveChatPresenceParamsSchema,
  startLiveChatSessionSchema,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  canGoLiveWithFriend,
  getPresenceForUser,
  LiveChatNotImplementedError,
  recordPresenceHeartbeat,
  startLiveSession,
} from "../services/messages/liveChat.js";
import { isOfflineTestUserSession } from "../services/offlineTestUser.js";

export const liveChatRouter = Router();
liveChatRouter.use(requireAuth);

/** Heartbeat — stub returns 501 until presence store exists. */
liveChatRouter.post("/presence", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.status(204).end();
    return;
  }
  try {
    await recordPresenceHeartbeat(req.session.userId!);
    res.status(204).end();
  } catch (e) {
    if (e instanceof LiveChatNotImplementedError) {
      res.status(501).json({ error: e.message, stub: true });
      return;
    }
    throw e;
  }
});

liveChatRouter.get("/presence/:username", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({
      username: req.params.username,
      online: false,
      lastSeenAt: null,
      canGoLive: false,
    });
    return;
  }

  const parsed = liveChatPresenceParamsSchema.safeParse({ username: req.params.username });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const friend = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (!friend) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const presence = await getPresenceForUser(friend.id);
  const canGoLive = await canGoLiveWithFriend(viewerId, friend.id);

  res.json({
    username: friend.username,
    online: presence.online,
    lastSeenAt: presence.lastSeenAt?.toISOString() ?? null,
    canGoLive,
  });
});

liveChatRouter.post("/sessions", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.status(503).json({ error: "Go live is not available in offline test mode." });
    return;
  }

  const parsed = startLiveChatSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const friend = await prisma.user.findUnique({
    where: { username: parsed.data.recipientUsername },
  });
  if (!friend) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!(await canGoLiveWithFriend(viewerId, friend.id))) {
    res.status(403).json({ error: "Go live requires both friends to be online" });
    return;
  }

  try {
    const session = await startLiveSession(viewerId, friend.id, parsed.data.threadId);
    res.status(201).json(session);
  } catch (e) {
    if (e instanceof LiveChatNotImplementedError) {
      res.status(501).json({ error: e.message, stub: true });
      return;
    }
    throw e;
  }
});
