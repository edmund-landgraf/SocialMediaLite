/**
 * Stub ranking for a viewer's Friends feed tab.
 * Inputs are explicit so the real algorithm can replace this later.
 */

export type FriendsFeedCandidate = {
  postId: string;
  authorId: string;
  profileOwnerId: string;
  createdAt: Date;
  /** Comment count on the post (engagement proxy). */
  commentCount: number;
  /** How many posts this author has marked shared (volume / diversity signal). */
  authorSharedPostCount: number;
};

/** Per-viewer history: how often each author has appeared on this feed recently. */
export type FriendsFeedAppearanceHistory = Record<string, number>;

export type RankFriendsFeedResult = {
  ranked: FriendsFeedCandidate[];
  /** Updated appearance counts after applying this page of results. */
  nextAppearanceHistory: FriendsFeedAppearanceHistory;
  meta: {
    sharableTotal: number;
    rankedCount: number;
  };
};

const RECENCY_HOURS = 72;
const MAX_ENGAGEMENT_COMMENTS = 10;

function recencyScore(createdAt: Date, nowMs: number): number {
  const ageHours = (nowMs - createdAt.getTime()) / (1000 * 60 * 60);
  return Math.max(0, RECENCY_HOURS - ageHours) / RECENCY_HOURS;
}

function engagementScore(commentCount: number): number {
  return Math.min(commentCount / MAX_ENGAGEMENT_COMMENTS, 1);
}

/** Fewer prior appearances → higher score (rotate quiet friends up). */
function appearanceDiversityScore(authorId: string, history: FriendsFeedAppearanceHistory): number {
  const appearances = history[authorId] ?? 0;
  return 1 / (1 + appearances * 0.5);
}

/** Authors who share less often get a small boost when they do share. */
function lowVolumeAuthorScore(authorSharedPostCount: number): number {
  return 1 / (1 + authorSharedPostCount * 0.2);
}

export function scoreFriendsFeedCandidate(
  candidate: FriendsFeedCandidate,
  history: FriendsFeedAppearanceHistory,
  nowMs: number = Date.now(),
): number {
  return (
    recencyScore(candidate.createdAt, nowMs) * 40 +
    engagementScore(candidate.commentCount) * 30 +
    appearanceDiversityScore(candidate.authorId, history) * 20 +
    lowVolumeAuthorScore(candidate.authorSharedPostCount) * 10
  );
}

/**
 * Rank sharable candidates for one viewer's Friends feed.
 * `limit` caps how many posts are returned; appearance history is updated for those authors.
 */
export function rankFriendsFeedPosts(
  candidates: FriendsFeedCandidate[],
  appearanceHistory: FriendsFeedAppearanceHistory,
  options?: { limit?: number; nowMs?: number },
): RankFriendsFeedResult {
  const limit = options?.limit ?? 50;
  const nowMs = options?.nowMs ?? Date.now();
  const sharableTotal = candidates.length;

  const ranked = [...candidates]
    .sort(
      (a, b) =>
        scoreFriendsFeedCandidate(b, appearanceHistory, nowMs) -
        scoreFriendsFeedCandidate(a, appearanceHistory, nowMs),
    )
    .slice(0, limit);

  const nextAppearanceHistory = { ...appearanceHistory };
  for (const row of ranked) {
    nextAppearanceHistory[row.authorId] = (nextAppearanceHistory[row.authorId] ?? 0) + 1;
  }

  return {
    ranked,
    nextAppearanceHistory,
    meta: { sharableTotal, rankedCount: ranked.length },
  };
}
