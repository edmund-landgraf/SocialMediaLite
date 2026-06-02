import { z } from "zod";

/** Modular reaction catalog — add or edit entries here to change the picker. */
export const POST_REACTIONS = [
  { id: "like", label: "Like", emoji: "👍" },
  { id: "love", label: "Love", emoji: "❤️" },
  { id: "care", label: "Care", emoji: "🤗" },
  { id: "agree", label: "Agree", emoji: "✅" },
  { id: "disagree", label: "Disagree", emoji: "👎" },
  { id: "celebrate", label: "Celebrate", emoji: "🎉" },
  { id: "funny", label: "Funny", emoji: "😂" },
] as const;

export type PostReactionKind = (typeof POST_REACTIONS)[number]["id"];

export type PostReactionDef = (typeof POST_REACTIONS)[number];

export const POST_REACTION_KINDS = POST_REACTIONS.map((r) => r.id) as PostReactionKind[];

export function getPostReaction(kind: string): PostReactionDef | null {
  return POST_REACTIONS.find((r) => r.id === kind) ?? null;
}

export function isPostReactionKind(kind: string): kind is PostReactionKind {
  return POST_REACTION_KINDS.includes(kind as PostReactionKind);
}

export const postReactionKindSchema = z.enum(
  POST_REACTION_KINDS as unknown as [PostReactionKind, ...PostReactionKind[]],
);

/** Reactions that may collect optional free-text details from the viewer. */
export const POST_REACTIONS_WITH_DETAILS = ["disagree"] as const satisfies readonly PostReactionKind[];

export function reactionCollectsDetails(kind: PostReactionKind): boolean {
  return (POST_REACTIONS_WITH_DETAILS as readonly PostReactionKind[]).includes(kind);
}

export const postReactionDetailsSchema = z.string().trim().max(2000);

export type PostReactionCount = {
  kind: PostReactionKind;
  count: number;
};
