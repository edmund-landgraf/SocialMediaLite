import type { PostSyndicationSnapshot } from "./postSyndication.js";

/** Registered syndication push partners (extend when adding Twitter, LinkedIn, etc.). */
export const SYNDICATION_PUSH_PARTNER_IDS = ["facebook"] as const;

export type SyndicationPushPartnerId = (typeof SYNDICATION_PUSH_PARTNER_IDS)[number];

export function isSyndicationPushPartnerId(value: string): value is SyndicationPushPartnerId {
  return (SYNDICATION_PUSH_PARTNER_IDS as readonly string[]).includes(value);
}

export type SyndicationPushMethod = "share_dialog" | "page_api";

export type SyndicationPushPartnerMeta = {
  id: SyndicationPushPartnerId;
  label: string;
  configured: boolean;
  methods: SyndicationPushMethod[];
};

export type SyndicationPushAction = {
  partnerId: SyndicationPushPartnerId;
  label: string;
  method: SyndicationPushMethod;
  href: string;
};

/** Short message template for partner posts (profile share or Page API `message`). */
export function buildSyndicationPushMessage(snapshot: PostSyndicationSnapshot): string {
  const post = snapshot.post;
  const excerpt =
    post.text?.trim() ||
    post.photoCaption?.trim() ||
    post.linkTitle?.trim() ||
    `${post.author.displayName} on SocialMediaLite`;
  const oneLine = excerpt.replace(/\s+/g, " ").trim();
  const clipped = oneLine.length > 400 ? `${oneLine.slice(0, 397)}…` : oneLine;
  return `${clipped}\n\nJoin the deeper discussion on SocialMediaLite.`;
}
