import type { MessageFolderKind } from "@prisma/client";
import { isTrashRetentionExpired } from "@socialmedialite/shared";
import { prisma } from "../../lib/prisma.js";

export const SYSTEM_FOLDER_DEFS: Array<{ name: string; kind: MessageFolderKind; sortOrder: number }> = [
  { name: "Saved", kind: "SAVED", sortOrder: 0 },
  { name: "Archived", kind: "ARCHIVED", sortOrder: 1 },
  { name: "Trash", kind: "TRASH", sortOrder: 2 },
];

export async function ensureSystemMessageFolders(userId: string): Promise<void> {
  for (const def of SYSTEM_FOLDER_DEFS) {
    try {
      await prisma.messageFolder.upsert({
        where: { userId_name: { userId, name: def.name } },
        create: { userId, name: def.name, kind: def.kind, sortOrder: def.sortOrder },
        // Upgrade legacy custom folders that reused a system name (e.g. "Trash").
        update: { kind: def.kind, sortOrder: def.sortOrder },
      });
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : null;
      if (code !== "P2002") throw err;
      const existing = await prisma.messageFolder.findFirst({
        where: { userId, name: def.name },
      });
      if (!existing) throw err;
      await prisma.messageFolder.update({
        where: { id: existing.id },
        data: { kind: def.kind, sortOrder: def.sortOrder },
      });
    }
  }
}

export async function getTrashFolderForUser(userId: string) {
  await ensureSystemMessageFolders(userId);
  return prisma.messageFolder.findFirst({
    where: { userId, kind: "TRASH" },
  });
}

/** Permanently remove trashed threads older than retention for this viewer; delete orphan threads. */
export async function purgeExpiredTrashForUser(userId: string): Promise<number> {
  const trashFolder = await getTrashFolderForUser(userId);
  if (!trashFolder) return 0;

  const expired = await prisma.messageThreadParticipant.findMany({
    where: {
      userId,
      folderId: trashFolder.id,
      trashedAt: { not: null },
    },
    select: { id: true, threadId: true, trashedAt: true },
  });

  const toDelete = expired.filter((row) => row.trashedAt && isTrashRetentionExpired(row.trashedAt));
  if (toDelete.length === 0) return 0;

  const participantIds = toDelete.map((row) => row.id);
  const threadIds = [...new Set(toDelete.map((row) => row.threadId))];

  await prisma.messageThreadParticipant.deleteMany({
    where: { id: { in: participantIds } },
  });

  for (const threadId of threadIds) {
    const remaining = await prisma.messageThreadParticipant.count({ where: { threadId } });
    if (remaining === 0) {
      await prisma.messageThread.delete({ where: { id: threadId } });
    }
  }

  return toDelete.length;
}

export async function listMessageFoldersForUser(userId: string) {
  await ensureSystemMessageFolders(userId);
  await purgeExpiredTrashForUser(userId);

  const folders = await prisma.messageFolder.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const counts = await prisma.messageThreadParticipant.groupBy({
    by: ["folderId"],
    where: { userId, folderId: { not: null } },
    _count: { _all: true },
  });

  const countByFolder = new Map(
    counts.map((row) => [row.folderId!, row._count._all]),
  );

  const unfiledCount = await prisma.messageThreadParticipant.count({
    where: { userId, folderId: null },
  });

  return {
    unfiledCount,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind as "CUSTOM" | "SAVED" | "ARCHIVED" | "TRASH",
      sortOrder: f.sortOrder,
      threadCount: countByFolder.get(f.id) ?? 0,
    })),
  };
}

export async function folderOwnedByUser(folderId: string, userId: string) {
  return prisma.messageFolder.findFirst({
    where: { id: folderId, userId },
  });
}

export async function assignViewerThreadFolder(
  viewerId: string,
  threadId: string,
  folderId: string | null,
): Promise<{ folderId: string | null }> {
  await ensureSystemMessageFolders(viewerId);
  await purgeExpiredTrashForUser(viewerId);

  const participant = await prisma.messageThreadParticipant.findFirst({
    where: { threadId, userId: viewerId },
  });
  if (!participant) {
    throw new Error("THREAD_NOT_FOUND");
  }

  let trashedAt: Date | null = null;
  if (folderId) {
    const folder = await folderOwnedByUser(folderId, viewerId);
    if (!folder) {
      throw new Error("FOLDER_NOT_FOUND");
    }
    if (folder.kind === "TRASH") {
      trashedAt = new Date();
    }
  }

  await prisma.messageThreadParticipant.update({
    where: { id: participant.id },
    data: { folderId, trashedAt },
  });

  return { folderId };
}
