import { generatePostSyndicationAlias } from "@socialmedialite/shared";
import type {
  PostSyndicationCommentSnapshot,
  PostSyndicationPostSnapshot,
  PostSyndicationSnapshot,
} from "@socialmedialite/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type RawPostSyndicationComment = PostSyndicationCommentSnapshot & { authorId: string | null };

export type RawPostSyndicationSnapshot = {
  post: PostSyndicationPostSnapshot;
  postAuthorId: string;
  comments: RawPostSyndicationComment[];
};

export async function loadPostSyndicationAliasMap(
  syndicationId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.postSyndicationAlias.findMany({
    where: { syndicationId },
    select: { userId: true, alias: true },
  });
  return new Map(rows.map((row) => [row.userId, row.alias]));
}

export async function ensurePostSyndicationAliases(
  syndicationId: string,
  userIds: string[],
  tx: Prisma.TransactionClient = prisma,
): Promise<Map<string, string>> {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) return new Map();

  const existing = await tx.postSyndicationAlias.findMany({
    where: { syndicationId },
    select: { userId: true, alias: true },
  });
  const aliasByUserId = new Map(existing.map((row) => [row.userId, row.alias]));
  const usedAliases = new Set(existing.map((row) => row.alias));

  const missingUserIds = uniqueUserIds.filter((userId) => !aliasByUserId.has(userId));
  for (let i = 0; i < missingUserIds.length; i++) {
    const userId = missingUserIds[i]!;
    const alias = generatePostSyndicationAlias(usedAliases, i);
    usedAliases.add(alias);
    await tx.postSyndicationAlias.create({
      data: { syndicationId, userId, alias },
    });
    aliasByUserId.set(userId, alias);
  }

  return aliasByUserId;
}

export function applyRandomizedNamesToSnapshot(
  raw: RawPostSyndicationSnapshot,
  aliasByUserId: Map<string, string>,
): PostSyndicationSnapshot {
  return {
    post: raw.post,
    comments: raw.comments.map((comment) => {
      if (comment.authorId == null || comment.authorId === raw.postAuthorId) {
        const { authorId: _authorId, ...rest } = comment;
        return rest;
      }
      const alias = aliasByUserId.get(comment.authorId);
      if (!alias) {
        const { authorId: _authorId, ...rest } = comment;
        return rest;
      }
      const { authorId: _authorId, ...rest } = comment;
      return {
        ...rest,
        author: {
          displayName: alias,
          username: alias,
          profilePicUrl: null,
        },
      };
    }),
  };
}

export function finalizePostSyndicationSnapshot(
  raw: RawPostSyndicationSnapshot,
  randomizeNames: boolean,
  aliasByUserId: Map<string, string>,
): PostSyndicationSnapshot {
  if (!randomizeNames) {
    return {
      post: raw.post,
      comments: raw.comments.map(({ authorId: _authorId, ...comment }) => comment),
    };
  }

  const commentAuthorIds = raw.comments
    .map((comment) => comment.authorId)
    .filter((userId): userId is string => userId != null && userId !== raw.postAuthorId);

  for (const userId of commentAuthorIds) {
    if (!aliasByUserId.has(userId)) {
      throw new Error(`Missing alias for syndication commenter ${userId}`);
    }
  }

  return applyRandomizedNamesToSnapshot(raw, aliasByUserId);
}
