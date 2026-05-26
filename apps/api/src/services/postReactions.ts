import { POST_REACTIONS, reactionCollectsDetails, type PostReactionCount, type PostReactionKind } from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";

export type PostReactionSummary = {
  reactions: PostReactionCount[];
  viewerReaction: PostReactionKind | null;
  reactionTotal: number;
};

function emptySummary(): PostReactionSummary {
  return { reactions: [], viewerReaction: null, reactionTotal: 0 };
}

function buildSummary(
  rows: Array<{ kind: string; userId: string }>,
  viewerId: string,
): PostReactionSummary {
  const counts = new Map<string, number>();
  let viewerReaction: PostReactionKind | null = null;

  for (const row of rows) {
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
    if (row.userId === viewerId && row.kind) {
      viewerReaction = row.kind as PostReactionKind;
    }
  }

  const reactions: PostReactionCount[] = POST_REACTIONS.map((def) => ({
    kind: def.id,
    count: counts.get(def.id) ?? 0,
  })).filter((r) => r.count > 0);

  const reactionTotal = reactions.reduce((sum, r) => sum + r.count, 0);
  return { reactions, viewerReaction, reactionTotal };
}

export async function loadPostReactionSummaries(
  postIds: string[],
  viewerId: string,
): Promise<Map<string, PostReactionSummary>> {
  const out = new Map<string, PostReactionSummary>();
  if (postIds.length === 0) return out;

  const rows = await prisma.postReaction.findMany({
    where: { postId: { in: postIds } },
    select: { postId: true, kind: true, userId: true },
  });

  const byPost = new Map<string, Array<{ kind: string; userId: string }>>();
  for (const id of postIds) {
    byPost.set(id, []);
    out.set(id, emptySummary());
  }
  for (const row of rows) {
    byPost.get(row.postId)?.push({ kind: row.kind, userId: row.userId });
  }
  for (const [postId, postRows] of byPost) {
    out.set(postId, buildSummary(postRows, viewerId));
  }
  return out;
}

export async function upsertPostReaction(
  postId: string,
  userId: string,
  kind: PostReactionKind,
  details?: string | null,
) {
  const storedDetails = reactionCollectsDetails(kind) ? (details?.trim() || null) : null;
  return prisma.postReaction.upsert({
    where: { postId_userId: { postId, userId } },
    create: { postId, userId, kind, details: storedDetails },
    update: { kind, details: storedDetails },
  });
}
