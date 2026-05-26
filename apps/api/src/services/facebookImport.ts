import {
  extractFacebookReelUrl,
  isFacebookReelUrl,
  normalizeFacebookReelUrl,
  parseFacebookReelId,
  stripFacebookReelUrls,
  isRealFacebookUser,
} from "@socialmedialite/shared";
import type { StorageProvider } from "../storage/types.js";
import { buildStoredLinkPreview } from "./linkPreview.js";
import { processImageToMaxSize, resizeLinkPreviewHero } from "./image.js";
import {
  resolveFacebookReel,
  cleanReelMetadataField,
  downloadFacebookImage,
  type FacebookReelMetadata,
} from "./facebookReelMetadata.js";
import { prisma } from "../lib/prisma.js";
import type { PostType } from "@prisma/client";

export type FacebookPostPreview = {
  id: string;
  title: string;
  description: string;
  createdTime: string;
  permalinkUrl: string | null;
  previewType: "text" | "photo" | "link" | "reel";
  previewImageUrl: string | null;
  previewReelUrl: string | null;
  previewLinkTitle: string | null;
  previewLinkDescription: string | null;
  previewReelPublic: boolean;
};

type GraphAttachment = {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  target?: { id?: string };
  media?: { image?: { src?: string }; source?: string };
  subattachments?: { data?: GraphAttachment[] };
};

type GraphPost = {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: { data?: GraphAttachment[] };
};

const POST_FIELDS = [
  "id",
  "message",
  "story",
  "created_time",
  "permalink_url",
  "attachments{media,type,title,description,url,target{id},subattachments{media,type,title,description,url,target{id}}}",
].join(",");

/** Expanded fields when resolving reel embeds on a single post. */
export const REEL_POST_FIELDS = [
  "id",
  "message",
  "story",
  "created_time",
  "permalink_url",
  "full_picture",
  "attachments{media{image{src,width,height},source},type,title,description,url,unshimmed_url,target{id,url},subattachments{media{image{src,width,height},source},type,title,description,url,unshimmed_url,target{id,url}}}",
].join(",");

function graphVersion(): string {
  return process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
}

function allAttachments(post: GraphPost): GraphAttachment[] {
  const out: GraphAttachment[] = [];
  for (const top of post.attachments?.data ?? []) {
    for (const sub of top.subattachments?.data ?? []) out.push(sub);
    out.push(top);
  }
  return out;
}

function primaryAttachment(post: GraphPost): GraphAttachment | null {
  const top = post.attachments?.data?.[0];
  if (!top) return null;
  if (top.subattachments?.data?.[0]) return top.subattachments.data[0];
  return top;
}

function findReelUrl(post: GraphPost): string | null {
  const fromMessage = extractFacebookReelUrl(post.message);
  if (fromMessage) return fromMessage;

  for (const att of allAttachments(post)) {
    if (att.url && isFacebookReelUrl(att.url)) return normalizeFacebookReelUrl(att.url);
    if (att.media?.source && isFacebookReelUrl(att.media.source)) {
      return normalizeFacebookReelUrl(att.media.source);
    }
  }
  return null;
}

function findReelVideoId(post: GraphPost): string | null {
  for (const att of allAttachments(post)) {
    if (att.target?.id?.trim()) return att.target.id.trim();
  }
  const reelUrl = findReelUrl(post);
  return reelUrl ? parseFacebookReelId(reelUrl) : null;
}

function findEmbeddedReelAttachment(post: GraphPost): GraphAttachment | null {
  for (const att of allAttachments(post)) {
    const type = (att.type ?? "").toLowerCase();
    if (att.url && isFacebookReelUrl(att.url)) return att;
    if (type.includes("video") && att.media?.image?.src) return att;
  }
  return primaryAttachment(post);
}

function userCaptionWithoutReelUrl(post: GraphPost): string {
  return stripFacebookReelUrls(post.message?.trim() ?? "");
}

function deriveTitle(post: GraphPost): string {
  if (findReelUrl(post)) {
    const caption = userCaptionWithoutReelUrl(post);
    const firstLine = caption.split("\n").find((line) => line.trim())?.trim();
    if (firstLine) return firstLine.slice(0, 200);
    const embedded = findEmbeddedReelAttachment(post);
    const embeddedTitle = cleanReelMetadataField(embedded?.title);
    if (embeddedTitle) return embeddedTitle.slice(0, 200);
    return "Facebook Reel";
  }

  const message = post.message?.trim();
  if (message) {
    const firstLine = message.split("\n").find((line) => line.trim())?.trim();
    if (firstLine) return firstLine.slice(0, 200);
  }
  const attachment = primaryAttachment(post);
  if (attachment?.title?.trim()) return attachment.title.trim().slice(0, 200);
  if (post.story?.trim()) return post.story.trim().slice(0, 200);
  return "Facebook post";
}

function deriveDescription(post: GraphPost): string {
  if (findReelUrl(post)) {
    const caption = userCaptionWithoutReelUrl(post);
    const lines = caption.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) return lines.slice(1).join("\n").slice(0, 4000);
    const embedded = findEmbeddedReelAttachment(post);
    const embeddedDescription = cleanReelMetadataField(embedded?.description);
    if (embeddedDescription) return embeddedDescription.slice(0, 4000);
    return "";
  }

  const message = post.message?.trim();
  const title = deriveTitle(post);
  if (message) {
    const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) return lines.slice(1).join("\n").slice(0, 4000);
    if (lines[0] && lines[0] !== title) return lines[0].slice(0, 4000);
  }
  const attachment = primaryAttachment(post);
  if (attachment?.description?.trim()) return attachment.description.trim().slice(0, 4000);
  if (post.story?.trim() && post.story.trim() !== title) return post.story.trim().slice(0, 4000);
  return "";
}

function derivePreviewType(post: GraphPost): FacebookPostPreview["previewType"] {
  if (findReelUrl(post)) return "reel";
  const attachment = primaryAttachment(post);
  if (!attachment) return "text";
  const type = (attachment.type ?? "").toLowerCase();
  if (type.includes("photo") || type.includes("album") || attachment.media?.image?.src) return "photo";
  if (type.includes("share") || type.includes("video") || attachment.url) return "link";
  return "text";
}

function derivePreviewImageUrl(post: GraphPost): string | null {
  const previewType = derivePreviewType(post);
  if (previewType === "photo" || previewType === "reel") {
    for (const att of allAttachments(post)) {
      const src = att.media?.image?.src?.trim();
      if (src) return src;
    }
  }
  return null;
}

function emptyReelPreviewFields(): Pick<
  FacebookPostPreview,
  "previewReelUrl" | "previewLinkTitle" | "previewLinkDescription" | "previewReelPublic"
> {
  return {
    previewReelUrl: null,
    previewLinkTitle: null,
    previewLinkDescription: null,
    previewReelPublic: false,
  };
}

function extractReelMetadataFromPost(post: GraphPost): FacebookReelMetadata | null {
  const reelUrl = findReelUrl(post);
  if (!reelUrl) return null;

  const reelId = findReelVideoId(post) ?? parseFacebookReelId(reelUrl);
  if (!reelId) return null;

  const embedded = findEmbeddedReelAttachment(post);
  let thumb: string | null = null;
  for (const att of allAttachments(post)) {
    const src = att.media?.image?.src?.trim();
    if (src) {
      thumb = src;
      break;
    }
  }

  return {
    title: cleanReelMetadataField(embedded?.title),
    description: cleanReelMetadataField(embedded?.description),
    thumbnailUrl: thumb ?? post.full_picture?.trim() ?? null,
    permalinkUrl: reelUrl,
    authorName: null,
  };
}

async function enrichReelPreview(
  accessToken: string,
  preview: FacebookPostPreview,
  graphPost: GraphPost,
): Promise<FacebookPostPreview> {
  if (preview.previewType !== "reel") return preview;

  let post = graphPost;
  try {
    post = await fetchFacebookPostById(accessToken, graphPost.id, { expanded: true });
  } catch {
    /* list payload is enough to attempt sideload */
  }

  const reelUrl = findReelUrl(post);
  if (!reelUrl) return preview;

  const videoId = findReelVideoId(post);
  const fromPost = extractReelMetadataFromPost(post);
  const resolved = await resolveFacebookReel(accessToken, reelUrl, {
    videoIdHint: videoId,
    postEmbed: fromPost,
  });

  if (!resolved.isPublic) {
    return {
      ...preview,
      previewReelUrl: reelUrl,
      previewImageUrl: null,
      previewLinkTitle: null,
      previewLinkDescription: null,
      previewReelPublic: false,
    };
  }

  const meta = resolved.metadata;
  return {
    ...preview,
    previewReelUrl: meta.permalinkUrl ?? reelUrl,
    previewImageUrl: meta.thumbnailUrl ?? preview.previewImageUrl ?? null,
    previewLinkTitle:
      meta.title ??
      (meta.authorName ? `${meta.authorName} on Facebook` : null),
    previewLinkDescription: meta.description ?? null,
    previewReelPublic: true,
  };
}

export function mapGraphPostToPreview(post: GraphPost): FacebookPostPreview {
  return {
    id: post.id,
    title: deriveTitle(post),
    description: deriveDescription(post),
    createdTime: post.created_time ?? new Date().toISOString(),
    permalinkUrl: post.permalink_url ?? null,
    previewType: derivePreviewType(post),
    previewImageUrl: derivePreviewImageUrl(post),
    ...emptyReelPreviewFields(),
  };
}

export async function fetchFacebookPostsFromGraph(
  accessToken: string,
  limit: number,
): Promise<FacebookPostPreview[]> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/me/posts`);
  url.searchParams.set("fields", POST_FIELDS);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 50)));
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook Graph API failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as { data?: GraphPost[]; error?: { message?: string } };
  if (payload.error?.message) throw new Error(payload.error.message);
  const graphPosts = payload.data ?? [];
  const previews = graphPosts.map(mapGraphPostToPreview);
  return Promise.all(
    previews.map((preview, index) => enrichReelPreview(accessToken, preview, graphPosts[index]!)),
  );
}

export function filterFacebookPostsByTitle(
  posts: FacebookPostPreview[],
  query: string,
): FacebookPostPreview[] {
  const q = query.trim().toLowerCase();
  if (!q) return posts;
  return posts.filter(
    (post) =>
      post.title.toLowerCase().includes(q) ||
      post.description.toLowerCase().includes(q),
  );
}

export async function fetchFacebookPostById(
  accessToken: string,
  fbPostId: string,
  opts?: { expanded?: boolean },
): Promise<GraphPost> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(fbPostId)}`);
  url.searchParams.set("fields", opts?.expanded ? REEL_POST_FIELDS : POST_FIELDS);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook post fetch failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const payload = (await res.json()) as GraphPost & { error?: { message?: string } };
  if (payload.error?.message) throw new Error(payload.error.message);
  if (!payload.id) throw new Error("Facebook post payload missing id");
  return payload;
}

async function downloadImageBuffer(imageUrl: string, accessToken?: string): Promise<Buffer> {
  if (accessToken) {
    const viaGraph = await downloadFacebookImage(imageUrl, accessToken);
    if (viaGraph) return viaGraph;
  }

  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SocialMediaLite/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to download Facebook photo (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function storeImageFromUrl(args: {
  imageUrl: string;
  authorId: string;
  storage: StorageProvider;
  keyPrefix: string;
  accessToken?: string;
  heroCrop?: boolean;
}): Promise<string | null> {
  try {
    const raw = await downloadImageBuffer(args.imageUrl, args.accessToken);
    const processed = args.heroCrop
      ? await resizeLinkPreviewHero(raw)
      : await processImageToMaxSize(raw);
    const key = `users/${args.authorId}/${args.keyPrefix}-${Date.now()}.webp`;
    await args.storage.putObject({
      key,
      contentType: processed.contentType,
      buffer: processed.buffer,
    });
    return key;
  } catch {
    return null;
  }
}

async function resolveReelThumbnailKey(args: {
  sideloadThumbnailUrl: string | null;
  reelUrl: string;
  graphPost: GraphPost;
  authorId: string;
  storage: StorageProvider;
  accessToken: string;
}): Promise<string | null> {
  const candidates = [
    args.sideloadThumbnailUrl,
    findEmbeddedReelAttachment(args.graphPost)?.media?.image?.src ?? null,
  ].filter((url): url is string => Boolean(url?.trim()));

  for (const imageUrl of candidates) {
    const key = await storeImageFromUrl({
      imageUrl,
      authorId: args.authorId,
      storage: args.storage,
      keyPrefix: "fb-reel",
      accessToken: args.accessToken,
      heroCrop: true,
    });
    if (key) return key;
  }

  const retryResolved = await resolveFacebookReel(args.accessToken, args.reelUrl, {
    videoIdHint: findReelVideoId(args.graphPost),
    postEmbed: extractReelMetadataFromPost(args.graphPost),
  });
  if (
    retryResolved.isPublic &&
    retryResolved.metadata.thumbnailUrl &&
    !candidates.includes(retryResolved.metadata.thumbnailUrl)
  ) {
    return storeImageFromUrl({
      imageUrl: retryResolved.metadata.thumbnailUrl,
      authorId: args.authorId,
      storage: args.storage,
      keyPrefix: "fb-reel",
      accessToken: args.accessToken,
      heroCrop: true,
    });
  }

  return null;
}

function cleanEmbeddedField(value: string | null | undefined): string | null {
  return cleanReelMetadataField(value);
}

export async function importFacebookPostToWall(args: {
  fbPostId: string;
  accessToken: string;
  authorId: string;
  profileOwnerId: string;
  storage: StorageProvider;
}) {
  const user = await prisma.user.findUnique({
    where: { id: args.authorId },
    select: { fbUserId: true },
  });
  if (!user || !isRealFacebookUser(user.fbUserId)) {
    throw new Error("Facebook import requires a real Facebook login");
  }

  const existing = await prisma.post.findUnique({ where: { fbPostId: args.fbPostId } });
  if (existing) {
    throw new Error("This Facebook post was already imported");
  }

  const graphPost = await fetchFacebookPostById(args.accessToken, args.fbPostId, { expanded: true });
  const reelUrl = findReelUrl(graphPost);
  const attachment = primaryAttachment(graphPost);
  const previewType = derivePreviewType(graphPost);
  const message = graphPost.message?.trim() || null;

  let type: PostType = "TEXT";
  let data: {
    authorId: string;
    profileOwnerId: string;
    fbPostId: string;
    type: PostType;
    text?: string | null;
    photoKey?: string | null;
    photoCaption?: string | null;
    videoUrl?: string | null;
    linkTitle?: string | null;
    linkDescription?: string | null;
    linkPreviewImageKey?: string | null;
  } = {
    authorId: args.authorId,
    profileOwnerId: args.profileOwnerId,
    fbPostId: args.fbPostId,
    type: "TEXT",
    text: message,
  };

  if (reelUrl) {
    const userCaption = userCaptionWithoutReelUrl(graphPost);
    const fromPost = extractReelMetadataFromPost(graphPost);
    const resolved = await resolveFacebookReel(args.accessToken, reelUrl, {
      videoIdHint: findReelVideoId(graphPost),
      postEmbed: fromPost,
    });

    let linkPreviewImageKey: string | null = null;
    let reelTitle: string | null = null;
    let reelDescription: string | null = null;

    if (resolved.isPublic) {
      linkPreviewImageKey = await resolveReelThumbnailKey({
        sideloadThumbnailUrl: resolved.metadata.thumbnailUrl ?? null,
        reelUrl,
        graphPost,
        authorId: args.authorId,
        storage: args.storage,
        accessToken: args.accessToken,
      });
      reelTitle =
        resolved.metadata.title ??
        (resolved.metadata.authorName ? `${resolved.metadata.authorName} on Facebook` : null);
      reelDescription = resolved.metadata.description ?? null;
    }

    type = "REEL";
    data = {
      ...data,
      type,
      videoUrl: resolved.metadata.permalinkUrl ?? reelUrl,
      text: userCaption || null,
      linkTitle: reelTitle,
      linkDescription: reelDescription,
      linkPreviewImageKey,
    };
  } else if (previewType === "photo") {
    const imageUrl = attachment?.media?.image?.src;
    if (imageUrl) {
      const raw = await downloadImageBuffer(imageUrl);
      const processed = await processImageToMaxSize(raw);
      const key = `users/${args.authorId}/fb-import-${Date.now()}.webp`;
      await args.storage.putObject({
        key,
        contentType: processed.contentType,
        buffer: processed.buffer,
      });
      type = "PHOTO";
      data = {
        ...data,
        type,
        text: null,
        photoKey: key,
        photoCaption: message && message.length <= 80 ? message : message?.slice(0, 80) ?? null,
      };
    }
  } else if (previewType === "link") {
    const linkUrl = attachment?.url?.trim();
    if (linkUrl && !isFacebookReelUrl(linkUrl)) {
      const preview = await buildStoredLinkPreview({
        pageUrlStr: linkUrl,
        authorId: args.authorId,
        storage: args.storage,
      });
      type = "VIDEO_LINK";
      data = {
        ...data,
        type,
        videoUrl: linkUrl,
        text: message,
        linkTitle: preview.linkTitle ?? attachment?.title ?? null,
        linkDescription: preview.linkDescription ?? attachment?.description ?? null,
        linkPreviewImageKey: preview.linkPreviewImageKey,
      };
    }
  }

  if (type === "TEXT" && !data.text) {
    data.text = graphPost.story?.trim() || deriveTitle(graphPost);
  }

  const post = await prisma.post.create({
    data,
    include: {
      author: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
      profileOwner: {
        select: { id: true, username: true, displayName: true, profilePicUrl: true },
      },
      _count: { select: { comments: true } },
    },
  });

  return post;
}
