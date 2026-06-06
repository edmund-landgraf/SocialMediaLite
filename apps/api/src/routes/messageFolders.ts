import { Router } from "express";
import { z } from "zod";
import {
  assignThreadFolderSchema,
  createMessageFolderSchema,
  MESSAGE_CUSTOM_FOLDERS_MAX,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  assignViewerThreadFolder,
  folderOwnedByUser,
  listMessageFoldersForUser,
} from "../services/messages/folders.js";
import { isOfflineTestUserSession, respondOfflineWritesDisabled } from "../services/offlineTestUser.js";

const folderIdSchema = z.string().uuid();
const threadIdSchema = z.string().uuid();

export const messageFoldersRouter = Router();
messageFoldersRouter.use(requireAuth);

messageFoldersRouter.get("/folders", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.json({ unfiledCount: 0, folders: [] });
    return;
  }
  const viewerId = req.session.userId!;
  const data = await listMessageFoldersForUser(viewerId);
  res.json(data);
});

messageFoldersRouter.post("/folders", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsed = createMessageFolderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  const name = parsed.data.name;

  const reserved = new Set(["saved", "archived", "trash"]);
  if (reserved.has(name.toLowerCase())) {
    res.status(400).json({ error: "Reserved folder name" });
    return;
  }

  const customCount = await prisma.messageFolder.count({
    where: { userId: viewerId, kind: "CUSTOM" },
  });
  if (customCount >= MESSAGE_CUSTOM_FOLDERS_MAX) {
    res.status(400).json({ error: `Maximum ${MESSAGE_CUSTOM_FOLDERS_MAX} custom folders` });
    return;
  }

  const maxSort = await prisma.messageFolder.aggregate({
    where: { userId: viewerId, kind: "CUSTOM" },
    _max: { sortOrder: true },
  });

  try {
    const folder = await prisma.messageFolder.create({
      data: {
        userId: viewerId,
        name,
        kind: "CUSTOM",
        sortOrder: (maxSort._max.sortOrder ?? 1) + 1,
      },
    });
    res.status(201).json({
      folder: {
        id: folder.id,
        name: folder.name,
        kind: folder.kind,
        sortOrder: folder.sortOrder,
        threadCount: 0,
      },
    });
  } catch {
    res.status(409).json({ error: "Folder name already exists" });
  }
});

messageFoldersRouter.delete("/folders/:folderId", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsedId = folderIdSchema.safeParse(req.params.folderId);
  if (!parsedId.success) {
    res.status(400).json({ error: "Invalid folder id" });
    return;
  }

  const viewerId = req.session.userId!;
  const folder = await folderOwnedByUser(parsedId.data, viewerId);
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  if (folder.kind !== "CUSTOM") {
    res.status(403).json({ error: "System folders cannot be deleted" });
    return;
  }

  await prisma.$transaction([
    prisma.messageThreadParticipant.updateMany({
      where: { userId: viewerId, folderId: folder.id },
      data: { folderId: null },
    }),
    prisma.messageFolder.delete({ where: { id: folder.id } }),
  ]);

  res.json({ ok: true });
});

messageFoldersRouter.patch("/threads/:threadId/folder", async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    respondOfflineWritesDisabled(res);
    return;
  }
  const parsedThreadId = threadIdSchema.safeParse(req.params.threadId);
  if (!parsedThreadId.success) {
    res.status(400).json({ error: "Invalid thread id" });
    return;
  }
  const parsed = assignThreadFolderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const viewerId = req.session.userId!;
  try {
    const result = await assignViewerThreadFolder(viewerId, parsedThreadId.data, parsed.data.folderId);
    res.json({ ok: true, folderId: result.folderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "THREAD_NOT_FOUND") {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    if (msg === "FOLDER_NOT_FOUND") {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    throw err;
  }
});
