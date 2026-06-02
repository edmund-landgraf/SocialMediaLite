import { prisma } from "../../lib/prisma.js";

const DEFAULT_MAX_POSTS = 200;
const DEFAULT_PER_POST_CHARS = 4_000;
const DEFAULT_MAX_CORPUS_CHARS = 48_000;
const DEFAULT_MAX_COMMENT_CHARS = 500;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncate(value: string, max: number): string {
  const clean = normalizeWhitespace(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

/** Merge every text-bearing field on a post into one block for the LLM. */
export function extractPostTextContent(post: {
  type: string;
  text: string | null;
  photoCaption: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  videoUrl: string | null;
}): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const raw of [
    post.text,
    post.photoCaption,
    post.linkTitle,
    post.linkDescription,
    post.videoUrl,
  ]) {
    if (!raw?.trim()) continue;
    const normalized = normalizeWhitespace(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    parts.push(normalized);
  }

  return parts.join("\n\n");
}

export type WallPostCorpusItem = {
  type: string;
  createdAt: string;
  content: string;
};

export type CommentCorpusItem = {
  createdAt: string;
  content: string;
};

export type SelfSummaryAggregate = {
  profile: {
    displayName: string;
    username: string;
    memberSince: string;
  };
  stats: {
    postsOnWall: number;
    postsAuthored: number;
    commentsWritten: number;
    reactionsGiven: number;
  };
  wallPosts: WallPostCorpusItem[];
  comments: CommentCorpusItem[];
};

export function formatAggregateForLlm(aggregate: SelfSummaryAggregate): string {
  const lines: string[] = [
    `Display name: ${aggregate.profile.displayName}`,
    `Username: @${aggregate.profile.username}`,
    `Member since: ${aggregate.profile.memberSince}`,
    "",
    "Activity counts:",
    `- Posts on my wall: ${aggregate.stats.postsOnWall}`,
    `- Posts I authored (any wall): ${aggregate.stats.postsAuthored}`,
    `- Comments I wrote: ${aggregate.stats.commentsWritten}`,
    `- Reactions I gave: ${aggregate.stats.reactionsGiven}`,
    "",
    "=== Timeline posts on my profile (newest first) ===",
  ];

  if (aggregate.wallPosts.length === 0) {
    lines.push("(no posts with text)");
  } else {
    for (const post of aggregate.wallPosts) {
      const when = new Date(post.createdAt).toISOString().slice(0, 10);
      lines.push("");
      lines.push(`--- ${when} | ${post.type} ---`);
      lines.push(post.content || "(no text)");
    }
  }

  lines.push("");
  lines.push("=== Comments I wrote (newest first) ===");
  if (aggregate.comments.length === 0) {
    lines.push("(no comments)");
  } else {
    for (const comment of aggregate.comments) {
      const when = new Date(comment.createdAt).toISOString().slice(0, 10);
      lines.push("");
      lines.push(`--- ${when} ---`);
      lines.push(comment.content);
    }
  }

  return lines.join("\n");
}

function applyCorpusBudget(
  wallPosts: WallPostCorpusItem[],
  comments: CommentCorpusItem[],
  maxCorpusChars: number,
): { wallPosts: WallPostCorpusItem[]; comments: CommentCorpusItem[] } {
  let used = 0;
  const keptPosts: WallPostCorpusItem[] = [];

  for (const post of wallPosts) {
    const block = post.content;
    if (!block) continue;
    if (used + block.length > maxCorpusChars) break;
    keptPosts.push(post);
    used += block.length;
  }

  const keptComments: CommentCorpusItem[] = [];
  for (const comment of comments) {
    const block = comment.content;
    if (!block) continue;
    if (used + block.length > maxCorpusChars) break;
    keptComments.push(comment);
    used += block.length;
  }

  return { wallPosts: keptPosts, comments: keptComments };
}

export async function aggregateSelfActivity(userId: string): Promise<SelfSummaryAggregate> {
  const maxPosts = Number(process.env.AI_SUMMARY_MAX_POSTS ?? DEFAULT_MAX_POSTS);
  const perPostChars = Number(process.env.AI_SUMMARY_PER_POST_CHARS ?? DEFAULT_PER_POST_CHARS);
  const maxCorpusChars = Number(process.env.AI_SUMMARY_MAX_CORPUS_CHARS ?? DEFAULT_MAX_CORPUS_CHARS);
  const maxCommentChars = Number(process.env.AI_SUMMARY_MAX_COMMENT_CHARS ?? DEFAULT_MAX_COMMENT_CHARS);
  const maxComments = Number(process.env.AI_SUMMARY_MAX_COMMENTS ?? 100);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, username: true, createdAt: true },
  });
  if (!user) throw new Error("User not found");

  const [postsOnWall, postsAuthored, commentsWritten, reactionsGiven, wallPosts, comments] =
    await Promise.all([
      prisma.post.count({ where: { profileOwnerId: userId } }),
      prisma.post.count({ where: { authorId: userId } }),
      prisma.comment.count({ where: { authorId: userId } }),
      prisma.postReaction.count({ where: { userId } }),
      prisma.post.findMany({
        where: { profileOwnerId: userId },
        orderBy: { createdAt: "desc" },
        take: maxPosts,
        select: {
          type: true,
          text: true,
          photoCaption: true,
          linkTitle: true,
          linkDescription: true,
          videoUrl: true,
          createdAt: true,
        },
      }),
      prisma.comment.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: "desc" },
        take: maxComments,
        select: { text: true, createdAt: true },
      }),
    ]);

  const wallPostItems: WallPostCorpusItem[] = wallPosts
    .map((p) => {
      const content = truncate(extractPostTextContent(p), perPostChars);
      return {
        type: p.type,
        createdAt: p.createdAt.toISOString(),
        content,
      };
    })
    .filter((p) => p.content.length > 0);

  const commentItems: CommentCorpusItem[] = comments
    .map((c) => ({
      createdAt: c.createdAt.toISOString(),
      content: truncate(c.text, maxCommentChars),
    }))
    .filter((c) => c.content.length > 0);

  const budgeted = applyCorpusBudget(wallPostItems, commentItems, maxCorpusChars);

  return {
    profile: {
      displayName: user.displayName,
      username: user.username,
      memberSince: user.createdAt.toISOString(),
    },
    stats: {
      postsOnWall,
      postsAuthored,
      commentsWritten,
      reactionsGiven,
    },
    wallPosts: budgeted.wallPosts,
    comments: budgeted.comments,
  };
}
