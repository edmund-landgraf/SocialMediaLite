import type { FriendsFeedReviewStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const FRIENDS_FEED_DISCARD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type FriendsFeedBucket = "unread" | "read" | "saved" | "discarded";

export type FriendsFeedReviewAction = "read" | "save" | "discard";

const ACTION_TO_STATUS: Record<FriendsFeedReviewAction, FriendsFeedReviewStatus> = {
  read: "READ",
  save: "SAVED",
  discard: "DISCARDED",
};

export function friendsFeedReviewActionToStatus(action: FriendsFeedReviewAction): FriendsFeedReviewStatus {
  return ACTION_TO_STATUS[action];
}

export async function purgeExpiredDiscardedFriendsFeedReviews(viewerId: string, nowMs = Date.now()) {
  const cutoff = new Date(nowMs - FRIENDS_FEED_DISCARD_RETENTION_MS);
  await prisma.friendsFeedReview.deleteMany({
    where: {
      viewerId,
      status: "DISCARDED",
      updatedAt: { lt: cutoff },
    },
  });
}

export type FriendsFeedReviewRow = {
  postId: string;
  status: FriendsFeedReviewStatus;
  updatedAt: Date;
};

export function buildFriendsFeedBucketCounts(
  postIds: string[],
  reviews: FriendsFeedReviewRow[],
): Record<FriendsFeedBucket, number> {
  const byPostId = new Map(reviews.map((r) => [r.postId, r.status]));
  const counts: Record<FriendsFeedBucket, number> = {
    unread: 0,
    read: 0,
    saved: 0,
    discarded: 0,
  };
  for (const postId of postIds) {
    const status = byPostId.get(postId) ?? null;
    if (!status) counts.unread += 1;
    else if (status === "READ") counts.read += 1;
    else if (status === "SAVED") counts.saved += 1;
    else counts.discarded += 1;
  }
  return counts;
}

export function postMatchesFriendsFeedBucket(
  postId: string,
  reviewsByPostId: Map<string, FriendsFeedReviewStatus>,
  bucket: FriendsFeedBucket,
): boolean {
  const status = reviewsByPostId.get(postId) ?? null;
  if (bucket === "unread") return status === null;
  if (bucket === "read") return status === "READ";
  if (bucket === "saved") return status === "SAVED";
  return status === "DISCARDED";
}

export function sortPostsForFriendsFeedBucket<T extends { id: string; createdAt: Date }>(
  posts: T[],
  bucket: FriendsFeedBucket,
  reviewUpdatedAt: Map<string, Date>,
): T[] {
  if (bucket === "unread") return posts;
  return [...posts].sort((a, b) => {
    const aT = reviewUpdatedAt.get(a.id)?.getTime() ?? a.createdAt.getTime();
    const bT = reviewUpdatedAt.get(b.id)?.getTime() ?? b.createdAt.getTime();
    return bT - aT;
  });
}

export async function upsertFriendsFeedReview(
  viewerId: string,
  postId: string,
  action: FriendsFeedReviewAction,
) {
  const status = friendsFeedReviewActionToStatus(action);
  return prisma.friendsFeedReview.upsert({
    where: {
      viewerId_postId: { viewerId, postId },
    },
    create: { viewerId, postId, status },
    update: { status },
  });
}
