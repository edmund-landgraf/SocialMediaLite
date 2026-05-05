import { Router } from "express";
import { z } from "zod";
import { usernameSchema } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { serializeUser } from "../services/serializers.js";

export const friendsRouter = Router();

friendsRouter.use(requireAuth);

const usernameBody = z.object({ username: usernameSchema });

friendsRouter.post("/request", async (req, res) => {
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

friendsRouter.get("/", async (req, res) => {
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
