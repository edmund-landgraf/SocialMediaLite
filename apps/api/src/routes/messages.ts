import { Router } from "express";
import { z } from "zod";
import {
  createMessageThreadSchema,
  editMessageSchema,
  messageBodySchema,
  recipientSearchModeSchema,
  replyMessageSchema,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  areFriendsAccepted,
  canModifyMessage,
  listAcceptedFriendUsers,
  messagePreviewText,
  sortParticipantPair,
} from "../services/messages/access.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";
import { serializeUser, type PublicUser } from "../services/serializers.js";
import { getTrashFolderForUser, purgeExpiredTrashForUser } from "../services/messages/folders.js";
import { liveChatRouter } from "./liveChat.js";
import { messageFoldersRouter } from "./messageFolders.js";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);
messagesRouter.use("/live", liveChatRouter);
messagesRouter.use(messageFoldersRouter);

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  profilePicUrl: true,
} as const;

const threadIdSchema = z.string().uuid();
const messageIdSchema = z.string().uuid();

function recipientFromUser(u: PublicUser, mode: "name" | "email") {
  if (mode === "email") {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      profilePicUrl: u.profilePicUrl,
      email: u.email,
    };
  }
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    profilePicUrl: u.profilePicUrl,
  };
}

async function getThreadForViewer(threadId: string, viewerId: string) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      participants: { include: { user: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { author: { select: authorSelect } },
      },
    },
  });
  if (!thread) return null;
  const viewerParticipant = thread.participants.find((p) => p.userId === viewerId);
  if (!viewerParticipant) return null;
  const other = thread.participants.find((p) => p.userId !== viewerId);
  if (!other) return null;
  if (!(await areFriendsAccepted(viewerId, other.userId))) return null;
  return { thread, viewerParticipant, other };
}

async function countUnread(
  threadId: string,
  viewerId: string,
  lastReadAt: Date,
): Promise<number> {
  return prisma.message.count({
    where: {
      threadId,
      authorId: { not: viewerId },
      deletedAt: null,
      createdAt: { gt: lastReadAt },
    },
  });
}

messagesRouter.get("/threads", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ threads: [], totalUnread: 0 });
    return;
  }
  const viewerId = req.session.userId!;
  await purgeExpiredTrashForUser(viewerId);
  const trashFolder = await getTrashFolderForUser(viewerId);
  const trashFolderId = trashFolder?.id ?? null;

  const participations = await prisma.messageThreadParticipant.findMany({
    where: { userId: viewerId },
    include: {
      thread: {
        include: {
          participants: { include: { user: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const threads: Array<{
    id: string;
    subject: string;
    isThreadOwner: boolean;
    otherParticipant: ReturnType<typeof serializeUser>;
    lastMessageAt: string;
    lastMessagePreview: string | null;
    unreadCount: number;
    folderId: string | null;
    trashedAt: string | null;
  }> = [];

  let totalUnread = 0;

  for (const part of participations) {
    const other = part.thread.participants.find((p) => p.userId !== viewerId);
    if (!other) continue;
    if (!(await areFriendsAccepted(viewerId, other.userId))) continue;

    const last = part.thread.messages[0] ?? null;
    const unreadCount = await countUnread(part.thread.id, viewerId, part.lastReadAt);
    const inTrash = trashFolderId != null && part.folderId === trashFolderId;
    if (!inTrash) {
      totalUnread += unreadCount;
    }

    threads.push({
      id: part.thread.id,
      subject: part.thread.subject,
      isThreadOwner: part.thread.createdById === viewerId,
      otherParticipant: serializeUser(other.user),
      lastMessageAt: part.thread.lastMessageAt.toISOString(),
      lastMessagePreview: last
        ? messagePreviewText(last.text, last.deletedAt)
        : null,
      unreadCount: inTrash ? 0 : unreadCount,
      folderId: part.folderId,
      trashedAt: part.trashedAt?.toISOString() ?? null,
    });
  }

  threads.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  res.json({ threads, totalUnread });
});

messagesRouter.get("/threads/:threadId", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const parsedId = threadIdSchema.safeParse(req.params.threadId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }
  const viewerId = req.session.userId!;
  const ctx = await getThreadForViewer(parsedId.data, viewerId);
  if (!ctx) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const rows = await prisma.message.findMany({
    where: { threadId: ctx.thread.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: authorSelect } },
  });

  res.json({
    thread: {
      id: ctx.thread.id,
      subject: ctx.thread.subject,
      isThreadOwner: ctx.thread.createdById === viewerId,
      otherParticipant: serializeUser(ctx.other.user),
    },
    messages: rows.map((m) => ({
      id: m.id,
      authorId: m.authorId,
      author: m.author,
      text: m.deletedAt ? null : m.text,
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      canEdit: !m.deletedAt && canModifyMessage(viewerId, ctx.thread.createdById, m.authorId),
      canDelete: !m.deletedAt && canModifyMessage(viewerId, ctx.thread.createdById, m.authorId),
    })),
  });
});

messagesRouter.post("/threads/:threadId/read", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsedId = threadIdSchema.safeParse(req.params.threadId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }
  const viewerId = req.session.userId!;
  const ctx = await getThreadForViewer(parsedId.data, viewerId);
  if (!ctx) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  await prisma.messageThreadParticipant.update({
    where: { id: ctx.viewerParticipant.id },
    data: { lastReadAt: new Date() },
  });

  res.json({ ok: true });
});

messagesRouter.post("/threads", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsed = createMessageThreadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const recipient = await prisma.user.findUnique({
    where: { username: parsed.data.recipientUsername },
  });
  if (!recipient) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (recipient.id === viewerId) {
    res.status(400).json({ error: "Cannot message yourself" });
    return;
  }
  if (!(await areFriendsAccepted(viewerId, recipient.id))) {
    res.status(403).json({ error: "You can only message accepted friends" });
    return;
  }

  const subject = parsed.data.subject;
  const [participantLowId, participantHighId] = sortParticipantPair(viewerId, recipient.id);

  let thread = await prisma.messageThread.findUnique({
    where: {
      participantLowId_participantHighId_subject: {
        participantLowId,
        participantHighId,
        subject,
      },
    },
  });

  const isNew = !thread;

  if (!thread) {
    thread = await prisma.messageThread.create({
      data: {
        subject,
        createdById: viewerId,
        participantLowId,
        participantHighId,
        participants: {
          create: [{ userId: viewerId }, { userId: recipient.id }],
        },
      },
    });
  }

  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      authorId: viewerId,
      text: parsed.data.text,
    },
    include: { author: { select: authorSelect } },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: message.createdAt },
  });

  res.status(isNew ? 201 : 200).json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      isThreadOwner: thread.createdById === viewerId,
      otherParticipant: serializeUser(recipient),
    },
    message: {
      id: message.id,
      authorId: message.authorId,
      author: message.author,
      text: message.text,
      editedAt: null,
      deletedAt: null,
      createdAt: message.createdAt.toISOString(),
      canEdit: true,
      canDelete: true,
    },
  });
});

messagesRouter.post("/threads/:threadId/messages", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsedId = threadIdSchema.safeParse(req.params.threadId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }
  const parsed = replyMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const ctx = await getThreadForViewer(parsedId.data, viewerId);
  if (!ctx) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const message = await prisma.message.create({
    data: {
      threadId: ctx.thread.id,
      authorId: viewerId,
      text: parsed.data.text,
    },
    include: { author: { select: authorSelect } },
  });

  await prisma.messageThread.update({
    where: { id: ctx.thread.id },
    data: { lastMessageAt: message.createdAt },
  });

  res.status(201).json({
    message: {
      id: message.id,
      authorId: message.authorId,
      author: message.author,
      text: message.text,
      editedAt: null,
      deletedAt: null,
      createdAt: message.createdAt.toISOString(),
      canEdit: true,
      canDelete: true,
    },
  });
});

messagesRouter.patch("/threads/:threadId/messages/:messageId", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsedThreadId = threadIdSchema.safeParse(req.params.threadId);
  const parsedMessageId = messageIdSchema.safeParse(req.params.messageId);
  if (!parsedThreadId.success || !parsedMessageId.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = editMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const ctx = await getThreadForViewer(parsedThreadId.data, viewerId);
  if (!ctx) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const existing = await prisma.message.findFirst({
    where: { id: parsedMessageId.data, threadId: ctx.thread.id },
  });
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (!canModifyMessage(viewerId, ctx.thread.createdById, existing.authorId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updated = await prisma.message.update({
    where: { id: existing.id },
    data: { text: parsed.data.text, editedAt: new Date() },
    include: { author: { select: authorSelect } },
  });

  res.json({
    message: {
      id: updated.id,
      authorId: updated.authorId,
      author: updated.author,
      text: updated.text,
      editedAt: updated.editedAt?.toISOString() ?? null,
      deletedAt: null,
      createdAt: updated.createdAt.toISOString(),
      canEdit: true,
      canDelete: true,
    },
  });
});

messagesRouter.delete("/threads/:threadId/messages/:messageId", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsedThreadId = threadIdSchema.safeParse(req.params.threadId);
  const parsedMessageId = messageIdSchema.safeParse(req.params.messageId);
  if (!parsedThreadId.success || !parsedMessageId.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const viewerId = req.session.userId!;
  const ctx = await getThreadForViewer(parsedThreadId.data, viewerId);
  if (!ctx) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const existing = await prisma.message.findFirst({
    where: { id: parsedMessageId.data, threadId: ctx.thread.id },
  });
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (!canModifyMessage(viewerId, ctx.thread.createdById, existing.authorId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await prisma.message.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  res.json({ ok: true });
});

messagesRouter.get("/recipients/search", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ recipients: [] });
    return;
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const modeParsed = recipientSearchModeSchema.safeParse(req.query.mode ?? "name");
  if (!modeParsed.success) {
    res.status(400).json({ error: "Invalid search mode" });
    return;
  }
  const mode = modeParsed.data;
  if (!q) {
    res.json({ recipients: [] });
    return;
  }

  const viewerId = req.session.userId!;
  const friends = await listAcceptedFriendUsers(viewerId);

  type Scored = { user: PublicUser; score: number };
  const scored: Scored[] = [];

  for (const u of friends) {
    const display = u.displayName.toLowerCase();
    const username = u.username.toLowerCase();
    const email = u.email?.toLowerCase() ?? "";

    if (mode === "name") {
      const nameHit = display.includes(q) || username.includes(q);
      if (!nameHit) continue;
      const score =
        (display.startsWith(q) ? 0 : 10) + (username.startsWith(q) ? 0 : 5) + display.localeCompare(q);
      scored.push({ user: serializeUser(u), score });
    } else {
      if (!email || !email.includes(q)) continue;
      const score = (email.startsWith(q) ? 0 : 10) + display.localeCompare(q);
      scored.push({ user: serializeUser(u), score });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.user.displayName.localeCompare(b.user.displayName));

  res.json({
    recipients: scored.slice(0, 20).map((row) => ({
      user: recipientFromUser(row.user, mode),
    })),
  });
});
