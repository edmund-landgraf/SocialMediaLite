import { DELETED_COMMENT_TEXT } from "@socialmedialite/shared";
import type { Request } from "express";
import { prisma } from "../lib/prisma.js";
import { AI_FRIEND } from "./aiFriend.js";

async function collectPostAssetKeys(userId: string): Promise<string[]> {
  const posts = await prisma.post.findMany({
    where: {
      OR: [{ authorId: userId }, { profileOwnerId: userId }],
    },
    select: { photoKey: true, linkPreviewImageKey: true },
  });
  const keys: string[] = [];
  for (const post of posts) {
    if (post.photoKey) keys.push(post.photoKey);
    if (post.linkPreviewImageKey) keys.push(post.linkPreviewImageKey);
  }
  return keys;
}

export async function deleteUserAccount(req: Request, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, bannerImageKey: true },
  });
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }
  if (user.username === AI_FRIEND.username) {
    throw new Error("CANNOT_DELETE_SYSTEM_USER");
  }

  const assetKeys = await collectPostAssetKeys(userId);
  if (user.bannerImageKey) assetKeys.push(user.bannerImageKey);

  await prisma.$transaction(async (tx) => {
    const survivingPostIds = (
      await tx.post.findMany({
        where: {
          authorId: { not: userId },
          profileOwnerId: { not: userId },
        },
        select: { id: true },
      })
    ).map((row) => row.id);

    if (survivingPostIds.length > 0) {
      await tx.comment.updateMany({
        where: {
          authorId: userId,
          postId: { in: survivingPostIds },
        },
        data: {
          text: DELETED_COMMENT_TEXT,
          authorId: null,
          deletedAt: new Date(),
        },
      });
    }

    await tx.postSyndicationAlias.deleteMany({ where: { userId } });

    await tx.user.delete({ where: { id: userId } });
  });

  await Promise.all(assetKeys.map((key) => req.storage.deleteObject(key).catch(() => undefined)));
}

export function isDeleteAccountError(code: string): code is "USER_NOT_FOUND" | "CANNOT_DELETE_SYSTEM_USER" {
  return code === "USER_NOT_FOUND" || code === "CANNOT_DELETE_SYSTEM_USER";
}
