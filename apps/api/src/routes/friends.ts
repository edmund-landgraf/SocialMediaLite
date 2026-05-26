import { Router } from "express";
import { z } from "zod";
import { STUB_TEST_USER_KINDS, usernameSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  OFFLINE_SEED_BROWSE_NOTE,
  offlineGlowbyteUserRow,
  offlineStubTestUserRow,
} from "../services/offlineSeedData.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";
import { serializeUser } from "../services/serializers.js";

export const friendsRouter = Router();

friendsRouter.use(requireAuth);

const usernameBody = z.object({ username: usernameSchema });

type FriendshipStatusDTO = "self" | "none" | "pending_out" | "pending_in" | "accepted" | "blocked";

function friendshipStatusFor(viewerId: string, otherId: string, row: { requesterId: string; status: string } | null): FriendshipStatusDTO {
  if (viewerId === otherId) return "self";
  if (!row) return "none";
  if (row.status === "ACCEPTED") return "accepted";
  if (row.status === "BLOCKED") return "blocked";
  if (row.status === "PENDING") return row.requesterId === viewerId ? "pending_out" : "pending_in";
  return "none";
}

friendsRouter.get("/browse", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    const viewerId = req.session.userId!;
    const gb = offlineGlowbyteUserRow();
    const others = [
      gb,
      ...STUB_TEST_USER_KINDS.map((kind) => offlineStubTestUserRow(kind)),
    ].filter((u) => u.id !== viewerId);
    res.json({
      users: others.map((u) => ({
        user: serializeUser(u),
        friendshipStatus: (u.id === gb.id ? "accepted" : "none") as FriendshipStatusDTO,
      })),
      note: OFFLINE_SEED_BROWSE_NOTE,
    });
    return;
  }
  const viewerId = req.session.userId!;
  const [users, friendships] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { username: "asc" }],
      take: 50,
    }),
    prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
      },
    }),
  ]);

  res.json({
    users: users
      .filter((u) => u.id !== viewerId)
      .map((u) => {
        const friendship =
          friendships.find(
            (f) =>
              (f.requesterId === viewerId && f.addresseeId === u.id) ||
              (f.requesterId === u.id && f.addresseeId === viewerId),
          ) ?? null;
        return {
          user: serializeUser(u),
          friendshipStatus: friendshipStatusFor(viewerId, u.id, friendship),
        };
      }),
    note: "Browse Users is intentionally simple for test users and can be replaced with search later.",
  });
});

friendsRouter.get("/requests", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ made: [], received: [] });
    return;
  }
  const viewerId = req.session.userId!;
  const rows = await prisma.friendship.findMany({
    where: {
      status: "PENDING",
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    },
    include: {
      requester: true,
      addressee: true,
    },
  });

  res.json({
    made: rows.filter((r) => r.requesterId === viewerId).map((r) => serializeUser(r.addressee)),
    received: rows.filter((r) => r.addresseeId === viewerId).map((r) => serializeUser(r.requester)),
  });
});

friendsRouter.post("/request", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsed = usernameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const target = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.id === viewerId) {
    res.status(400).json({ error: "Cannot friend yourself" });
    return;
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: viewerId },
      ],
    },
  });

  if (existing?.status === "ACCEPTED") {
    res.json({ ok: true, status: "already_friends" });
    return;
  }
  if (existing?.status === "BLOCKED") {
    res.status(403).json({ error: "Cannot send request" });
    return;
  }
  if (existing?.status === "PENDING") {
    if (existing.requesterId === viewerId) {
      res.json({ ok: true, status: "pending_outbound" });
      return;
    }
    res.json({ ok: true, status: "pending_inbound" });
    return;
  }

  await prisma.friendship.create({
    data: {
      requesterId: viewerId,
      addresseeId: target.id,
      status: "PENDING",
    },
  });
  res.json({ ok: true, status: "pending_outbound" });
});

friendsRouter.post("/accept", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsed = usernameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const target = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const pending = await prisma.friendship.findFirst({
    where: {
      requesterId: target.id,
      addresseeId: viewerId,
      status: "PENDING",
    },
  });

  if (!pending) {
    res.status(400).json({ error: "No pending request from that user" });
    return;
  }

  await prisma.friendship.update({
    where: { id: pending.id },
    data: { status: "ACCEPTED" },
  });
  res.json({ ok: true, status: "accepted" });
});

friendsRouter.post("/reject", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsed = usernameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const target = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const pending = await prisma.friendship.findFirst({
    where: {
      requesterId: target.id,
      addresseeId: viewerId,
      status: "PENDING",
    },
  });
  if (!pending) {
    res.status(400).json({ error: "No pending request from that user" });
    return;
  }

  await prisma.friendship.delete({ where: { id: pending.id } });
  res.json({ ok: true, status: "rejected" });
});

friendsRouter.post("/remove", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsed = usernameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const viewerId = req.session.userId!;
  const target = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: viewerId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: viewerId },
      ],
    },
  });
  if (!friendship) {
    res.status(400).json({ error: "You are not friends with that user" });
    return;
  }

  await prisma.friendship.delete({ where: { id: friendship.id } });
  res.json({ ok: true, status: "removed" });
});

friendsRouter.get("/", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ friends: [serializeUser(offlineGlowbyteUserRow())] });
    return;
  }
  const viewerId = req.session.userId!;
  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    },
    include: {
      requester: true,
      addressee: true,
    },
  });

  const friends = rows.map((r) => {
    const other = r.requesterId === viewerId ? r.addressee : r.requester;
    return serializeUser(other);
  });

  res.json({ friends });
});
