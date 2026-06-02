import {
  normalizeFacebookReelUrl,
  parseFacebookReelId,
} from "@socialmedialite/shared";
import { getYtDlpVideoInfo, pickYtDlpThumbnail } from "./ytDlpClient.js";

export type FacebookReelMetadata = {
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  permalinkUrl: string;
  authorName: string | null;
};

const UNAVAILABLE_PATTERNS = [
  /this content isn't available right now/i,
  /content isn't available/i,
  /no longer available/i,
  /when this happens, it's usually because/i,
  /owner only shared it with a small group/i,
  /changed who can see it/i,
  /see more on facebook/i,
  /log in to facebook/i,
  /email or phone number/i,
];

/** Graph Video node uses `name`, not `title`. Never fetch facebook.com/reel HTML — anonymous pages show a login modal. */
const VIDEO_FIELDS = [
  "name",
  "description",
  "picture",
  "format",
  "permalink_url",
  "embed_html",
  "from{name}",
].join(",");

function graphVersion(): string {
  return process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
}

function appAccessToken(): string | null {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return `${appId}|${appSecret}`;
}

export function isUnavailableFacebookMetadata(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text));
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? text.trim();
}

export function cleanReelMetadataField(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || isUnavailableFacebookMetadata(trimmed)) return null;
  return trimmed;
}

type GraphReelPayload = {
  name?: string;
  description?: string;
  picture?: string | { data?: { url?: string } };
  permalink_url?: string;
  embed_html?: string;
  from?: { name?: string };
  format?: Array<{ picture?: string }>;
  error?: { message?: string; code?: number; type?: string };
};

function pictureUrl(value: GraphReelPayload["picture"]): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  return value.data?.url?.trim() || null;
}

function parseEmbedHtmlThumbnail(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  const srcMatch = html.match(/\bsrc=["']([^"']+)["']/i);
  const src = srcMatch?.[1]?.trim();
  if (!src) return null;
  if (src.includes("fbcdn.net") || src.includes("facebook.com")) return src;
  return null;
}

function pickFormatPicture(payload: GraphReelPayload): string | null {
  for (const fmt of payload.format ?? []) {
    const pic = fmt.picture?.trim();
    if (pic) return pic;
  }
  return null;
}

function payloadToMetadata(reelId: string, payload: GraphReelPayload): FacebookReelMetadata {
  let title = cleanReelMetadataField(payload.name) ?? null;
  let description = cleanReelMetadataField(payload.description) ?? null;
  if (!title && description) title = firstLine(description);

  const authorName = payload.from?.name?.trim() || null;
  const thumbnailUrl =
    parseEmbedHtmlThumbnail(payload.embed_html) ??
    pickFormatPicture(payload) ??
    pictureUrl(payload.picture);

  return {
    title,
    description,
    thumbnailUrl,
    permalinkUrl: payload.permalink_url?.trim() || normalizeFacebookReelUrl(reelId),
    authorName,
  };
}

function mergeMetadata(
  reelId: string,
  ...parts: Array<FacebookReelMetadata | null | undefined>
): FacebookReelMetadata | null {
  const available = parts.filter(Boolean) as FacebookReelMetadata[];
  if (available.length === 0) return null;

  // Prefer earliest non-null thumbnail (post embed) then later graph results.
  return {
    title: available.find((p) => p.title)?.title ?? null,
    description: available.find((p) => p.description)?.description ?? null,
    thumbnailUrl: available.find((p) => p.thumbnailUrl)?.thumbnailUrl ?? null,
    permalinkUrl:
      available.find((p) => p.permalinkUrl)?.permalinkUrl ?? normalizeFacebookReelUrl(reelId),
    authorName: available.find((p) => p.authorName)?.authorName ?? null,
  };
}

async function graphVideoFetch(token: string, reelId: string): Promise<GraphReelPayload | null> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(reelId)}`);
  url.searchParams.set("fields", VIDEO_FIELDS);
  url.searchParams.set("access_token", token);

  const res = await fetch(url);
  const payload = (await res.json()) as GraphReelPayload;
  if (!res.ok || payload.error?.message) {
    if (process.env.FB_GRAPH_DEBUG === "1") {
      console.warn("[fb-reel-graph] video", reelId, payload.error?.message ?? res.status);
    }
    return null;
  }
  return payload;
}

async function fetchVideoThumbnailsEdge(token: string, reelId: string): Promise<string | null> {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(reelId)}/thumbnails`,
  );
  url.searchParams.set("fields", "uri,is_preferred");
  url.searchParams.set("limit", "5");
  url.searchParams.set("access_token", token);

  const res = await fetch(url);
  if (!res.ok) return null;

  const payload = (await res.json()) as {
    data?: Array<{ uri?: string; is_preferred?: boolean }>;
    error?: { message?: string };
  };
  if (payload.error?.message) return null;

  const preferred = payload.data?.find((t) => t.is_preferred)?.uri;
  const first = payload.data?.[0]?.uri;
  return preferred?.trim() || first?.trim() || null;
}

async function fetchReelPictureUrl(token: string, reelId: string): Promise<string | null> {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(reelId)}/picture`,
  );
  url.searchParams.set("redirect", "0");
  url.searchParams.set("type", "large");
  url.searchParams.set("access_token", token);

  const res = await fetch(url);
  if (!res.ok) return null;

  const payload = (await res.json()) as { data?: { url?: string }; error?: { message?: string } };
  if (payload.error?.message) return null;
  return payload.data?.url?.trim() || null;
}

/** Authenticated Graph Video node + thumbnail edges only — no reel URL HTML scrape (login wall). */
async function sideloadVideoNode(
  token: string,
  reelId: string,
): Promise<{ metadata: FacebookReelMetadata | null; signals: ReelGraphSignals }> {
  const payload = await graphVideoFetch(token, reelId);
  const fromVideo = payload ? payloadToMetadata(reelId, payload) : null;

  const [thumbEdge, picture] = await Promise.all([
    fetchVideoThumbnailsEdge(token, reelId),
    fetchReelPictureUrl(token, reelId),
  ]);

  const graphThumbnailOk = Boolean(thumbEdge || picture);
  const signals: ReelGraphSignals = {
    videoNodeOk: payload != null,
    graphThumbnailOk,
    postEmbedOk: false,
    ytDlpOk: false,
  };

  if (!fromVideo && !graphThumbnailOk) {
    return { metadata: null, signals };
  }

  const metadata = mergeMetadata(
    reelId,
    fromVideo,
    graphThumbnailOk
      ? {
          title: null,
          description: null,
          thumbnailUrl: thumbEdge ?? picture,
          permalinkUrl: normalizeFacebookReelUrl(reelId),
          authorName: null,
        }
      : null,
  );

  return { metadata, signals };
}

export type FetchFacebookReelMetadataOpts = {
  videoIdHint?: string | null;
  /** Embed from the user's own timeline post (Graph /me/posts) — avoids anonymous reel page login wall. */
  postEmbed?: FacebookReelMetadata | null;
  /**
   * When true (default), skip Graph Video node sideload — saves app-level API quota.
   * Post embed + yt-dlp resolve public reels without extra Graph calls.
   */
  skipGraphSideload?: boolean;
};

function graphSideloadEnabled(): boolean {
  return process.env.FB_REEL_GRAPH_SIDELOAD === "1";
}

export type ReelGraphSignals = {
  videoNodeOk: boolean;
  graphThumbnailOk: boolean;
  /** Timeline post embed from user_posts — valid when FB returned attachment media on the user's post. */
  postEmbedOk: boolean;
  /** Public reel metadata/thumbnail resolved via yt-dlp (bypasses Graph login wall for public reels). */
  ytDlpOk: boolean;
};

export type FacebookReelResolution = {
  metadata: FacebookReelMetadata;
  isPublic: boolean;
};

function hasRenderableMetadata(metadata: FacebookReelMetadata | null | undefined): boolean {
  if (!metadata) return false;
  return Boolean(
    metadata.thumbnailUrl?.trim() ||
      cleanReelMetadataField(metadata.title) ||
      cleanReelMetadataField(metadata.description),
  );
}

function postEmbedSignals(postEmbed: FacebookReelMetadata | null | undefined): ReelGraphSignals {
  return {
    videoNodeOk: false,
    graphThumbnailOk: false,
    postEmbedOk: hasRenderableMetadata(postEmbed),
    ytDlpOk: false,
  };
}

/** yt-dlp titles for Facebook reels: "views · reactions | caption | page name". */
export function parseYtDlpFacebookReelTitle(raw: string): {
  title: string | null;
  authorName: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { title: null, authorName: null };

  const parts = trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const caption = cleanReelMetadataField(parts[1]) ?? parts[1] ?? null;
    const authorName = parts[parts.length - 1]?.trim() || null;
    return { title: caption, authorName };
  }
  if (parts.length === 2) {
    const first = parts[0] ?? "";
    const looksLikeStats = /\bviews\b/i.test(first) || /\breactions?\b/i.test(first);
    if (looksLikeStats) {
      return {
        title: cleanReelMetadataField(parts[1]) ?? parts[1] ?? null,
        authorName: null,
      };
    }
    return {
      title: cleanReelMetadataField(first) ?? first,
      authorName: parts[1]?.trim() || null,
    };
  }

  const withoutStats = trimmed.replace(/^[\d.,KMB]+\s*views?\s*·\s*[\d.,KMB]+\s*reactions?\s*·?\s*/i, "");
  return {
    title: cleanReelMetadataField(withoutStats) ?? withoutStats,
    authorName: null,
  };
}

async function sideloadViaYtDlp(reelUrl: string): Promise<{
  metadata: FacebookReelMetadata | null;
  ytDlpOk: boolean;
}> {
  const info = await getYtDlpVideoInfo(reelUrl);
  const thumbnailUrl = info ? pickYtDlpThumbnail(info) : null;
  if (!info || !thumbnailUrl) {
    return { metadata: null, ytDlpOk: false };
  }

  const parsed = parseYtDlpFacebookReelTitle(info.title ?? "");
  const description = cleanReelMetadataField(info.description?.trim() ?? null);

  return {
    ytDlpOk: true,
    metadata: {
      title: parsed.title,
      description,
      thumbnailUrl,
      permalinkUrl: reelUrl,
      authorName: parsed.authorName,
    },
  };
}

/** True when Graph, post embed, or yt-dlp confirms renderable public metadata. */
export function isPublicReel(
  metadata: FacebookReelMetadata | null | undefined,
  signals: ReelGraphSignals,
): boolean {
  if (!metadata || !hasRenderableMetadata(metadata)) return false;
  if (
    signals.videoNodeOk ||
    signals.graphThumbnailOk ||
    signals.postEmbedOk ||
    signals.ytDlpOk
  ) {
    return true;
  }
  return false;
}

function emptyReelMetadata(reelUrl: string): FacebookReelMetadata {
  const reelId = parseFacebookReelId(reelUrl);
  return {
    title: null,
    description: null,
    thumbnailUrl: null,
    permalinkUrl: reelId ? normalizeFacebookReelUrl(reelId) : reelUrl,
    authorName: null,
  };
}

/**
 * Resolve reel metadata via authenticated Graph API.
 * Returns isPublic=false for private/restricted reels — callers should skip preview UI.
 */
export async function resolveFacebookReel(
  userAccessToken: string,
  reelUrl: string,
  opts?: FetchFacebookReelMetadataOpts | string | null,
): Promise<FacebookReelResolution> {
  const normalizedOpts: FetchFacebookReelMetadataOpts =
    typeof opts === "string" || opts == null ? { videoIdHint: opts } : opts;

  const reelId =
    normalizedOpts.videoIdHint?.trim() ||
    (normalizedOpts.postEmbed?.permalinkUrl
      ? parseFacebookReelId(normalizedOpts.postEmbed.permalinkUrl)
      : null) ||
    parseFacebookReelId(reelUrl);

  const canonical = reelId ? normalizeFacebookReelUrl(reelId) : reelUrl;
  if (!reelId) {
    return { isPublic: false, metadata: emptyReelMetadata(reelUrl) };
  }

  let merged = normalizedOpts.postEmbed ?? null;
  let signals: ReelGraphSignals = {
    ...postEmbedSignals(normalizedOpts.postEmbed),
  };

  if (!isPublicReel(merged, signals)) {
    const viaYtDlp = await sideloadViaYtDlp(canonical);
    merged = mergeMetadata(reelId, merged, viaYtDlp.metadata);
    signals = {
      ...signals,
      ytDlpOk: viaYtDlp.ytDlpOk,
    };
  }

  const skipGraph = normalizedOpts.skipGraphSideload !== false && !graphSideloadEnabled();
  if (!skipGraph && !isPublicReel(merged, signals)) {
    const userGraph = await sideloadVideoNode(userAccessToken, reelId);
    merged = mergeMetadata(reelId, merged, userGraph.metadata);
    signals = {
      videoNodeOk: userGraph.signals.videoNodeOk,
      graphThumbnailOk: userGraph.signals.graphThumbnailOk,
      postEmbedOk: signals.postEmbedOk,
      ytDlpOk: signals.ytDlpOk,
    };

    if (!isPublicReel(merged, signals)) {
      const appToken = appAccessToken();
      if (appToken && appToken !== userAccessToken) {
        const appGraph = await sideloadVideoNode(appToken, reelId);
        merged = mergeMetadata(reelId, merged, appGraph.metadata);
        signals = {
          videoNodeOk: signals.videoNodeOk || appGraph.signals.videoNodeOk,
          graphThumbnailOk: signals.graphThumbnailOk || appGraph.signals.graphThumbnailOk,
          postEmbedOk: signals.postEmbedOk,
          ytDlpOk: signals.ytDlpOk,
        };
      }
    }
  }

  const metadata: FacebookReelMetadata = merged ?? emptyReelMetadata(canonical);
  if (!isPublicReel(metadata, signals)) {
    return { isPublic: false, metadata: emptyReelMetadata(canonical) };
  }

  return {
    isPublic: true,
    metadata: {
      ...metadata,
      permalinkUrl: metadata.permalinkUrl || canonical,
    },
  };
}

export async function fetchFacebookReelMetadata(
  userAccessToken: string,
  reelUrl: string,
  opts?: FetchFacebookReelMetadataOpts | string | null,
): Promise<FacebookReelMetadata | null> {
  const resolved = await resolveFacebookReel(userAccessToken, reelUrl, opts);
  return resolved.metadata;
}

/** Download a Facebook CDN / Graph image using an access token (for preview proxy + import). */
export async function downloadFacebookImage(
  imageUrl: string,
  accessToken: string,
): Promise<Buffer | null> {
  try {
    const parsed = new URL(imageUrl);
    if (!parsed.searchParams.has("access_token")) {
      parsed.searchParams.set("access_token", accessToken);
    }
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SocialMediaLite/1.0)" },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
