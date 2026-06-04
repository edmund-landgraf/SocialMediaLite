import { isFacebookReelUrl, normalizeFacebookReelUrl } from "./facebookReel.js";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isYouTubeHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(h)) return true;
  return h.endsWith(".youtube.com");
}

export function parseYouTubeVideoId(url: URL): string | null {
  if (!isYouTubeHostname(url.hostname)) return null;

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0]?.trim();
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }

  if (url.pathname === "/watch") {
    const v = url.searchParams.get("v")?.trim();
    return v && /^[\w-]{6,}$/.test(v) ? v : null;
  }

  const pathMatch = url.pathname.match(/^\/(shorts|embed|v|live)\/([\w-]{6,})/);
  return pathMatch?.[2] ?? null;
}

function isInstagramHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "instagram.com" || h === "www.instagram.com" || h.endsWith(".instagram.com");
}

export function parseInstagramEmbedPath(url: URL): string | null {
  if (!isInstagramHostname(url.hostname)) return null;
  const match = url.pathname.match(/^\/(reels?|p|tv)\/([\w-]+)/i);
  if (!match?.[1] || !match[2]) return null;
  const segment = match[1].toLowerCase();
  const id = match[2];
  // Instagram embed endpoints use /reel/{id}/ even when the share URL is /reels/{id}/.
  if (segment === "reel" || segment === "reels") return `/reel/${id}/`;
  return `/${segment}/${id}/`;
}

function isTikTokHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "tiktok.com" || h.endsWith(".tiktok.com");
}

export function parseTikTokVideoId(url: URL): string | null {
  if (!isTikTokHostname(url.hostname)) return null;
  const match = url.pathname.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
}

function isXHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "twitter.com" || h === "www.twitter.com" || h === "x.com" || h === "www.x.com";
}

export function parseXTweetId(url: URL): string | null {
  if (!isXHostname(url.hostname)) return null;
  const match = url.pathname.match(/\/status\/(\d+)/i);
  return match?.[1] ?? null;
}

/** Hosts where yt-dlp inline playback is supported. */
export function supportsYtDlpPlayback(url: URL): boolean {
  return (
    parseInstagramEmbedPath(url) != null ||
    parseTikTokVideoId(url) != null ||
    isTikTokHostname(url.hostname) ||
    parseXTweetId(url) != null
  );
}

export type InlineVideoEmbedLayout = "landscape" | "portrait";

export type InlineVideoNativeFallback = {
  pageUrl: string;
  externalLabel: string;
};

/** iframe = platform embed; native = yt-dlp HTML5 video; nativeFallback = try iframe, then inline stream. */
export type InlineVideoEmbed =
  | {
      kind: "iframe";
      embedUrl: string;
      layout: InlineVideoEmbedLayout;
      nativeFallback?: InlineVideoNativeFallback;
    }
  | { kind: "native"; pageUrl: string; layout: InlineVideoEmbedLayout; externalLabel: string };

export function resolveInlineVideoEmbed(pageUrl: string): InlineVideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return null;
  }

  const ytId = parseYouTubeVideoId(parsed);
  if (ytId) {
    return {
      kind: "iframe",
      embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`,
      layout: "landscape",
    };
  }

  const igPath = parseInstagramEmbedPath(parsed);
  if (igPath) {
    const layout: InlineVideoEmbedLayout = igPath.startsWith("/reel/") ? "portrait" : "landscape";
    return {
      kind: "iframe",
      embedUrl: `https://www.instagram.com${igPath}embed/`,
      layout,
      nativeFallback: { pageUrl: parsed.href, externalLabel: "Instagram" },
    };
  }

  const tiktokId = parseTikTokVideoId(parsed);
  if (tiktokId) {
    return {
      kind: "iframe",
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokId}?lang=en-US`,
      layout: "portrait",
      nativeFallback: { pageUrl: parsed.href, externalLabel: "TikTok" },
    };
  }
  if (isTikTokHostname(parsed.hostname)) {
    return {
      kind: "native",
      pageUrl: parsed.href,
      layout: "portrait",
      externalLabel: "TikTok",
    };
  }

  const tweetId = parseXTweetId(parsed);
  if (tweetId) {
    return {
      kind: "iframe",
      embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&dnt=true`,
      layout: "landscape",
      nativeFallback: { pageUrl: parsed.href, externalLabel: "X" },
    };
  }

  if (isFacebookReelUrl(pageUrl)) {
    const href = normalizeFacebookReelUrl(pageUrl);
    return {
      kind: "iframe",
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=true`,
      layout: "portrait",
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (host.includes("facebook.com") || host.includes("fb.watch")) {
    const href = parsed.href;
    if (/\/(watch|videos|reel|share\/r)\//i.test(parsed.pathname) || host.includes("fb.watch")) {
      return {
        kind: "iframe",
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=true`,
        layout: parsed.pathname.includes("/reel/") ? "portrait" : "landscape",
      };
    }
  }

  return null;
}

export function isInlineVideoLink(url: string): boolean {
  return resolveInlineVideoEmbed(url) != null;
}
