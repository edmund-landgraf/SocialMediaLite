import { getYtDlpVideoInfo, pickYtDlpThumbnail } from "./ytDlpClient.js";

export type YouTubeMetadata = {
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
};

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

/** Extract a YouTube video id from common watch / short / embed URLs. */
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

/** Canonical watch URL for oEmbed and yt-dlp. */
export function canonicalYouTubeWatchUrl(url: URL): string | null {
  const id = parseYouTubeVideoId(url);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

const OEMBED_TIMEOUT_MS = 8_000;

async function fetchViaYtDlp(watchUrl: string): Promise<YouTubeMetadata | null> {
  const info = await getYtDlpVideoInfo(watchUrl);
  if (!info) return null;

  const title = info.title?.trim();
  if (!title) return null;

  const channel = info.channel?.trim() || info.uploader?.trim();
  const description =
    info.description?.trim() ||
    (channel ? `By ${channel}` : null);

  return {
    title,
    description: description || null,
    thumbnailUrl: pickYtDlpThumbnail(info),
  };
}

type OEmbedPayload = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

async function fetchViaOEmbed(watchUrl: string): Promise<YouTubeMetadata | null> {
  const oembedUrl = new URL("https://www.youtube.com/oembed");
  oembedUrl.searchParams.set("url", watchUrl);
  oembedUrl.searchParams.set("format", "json");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(oembedUrl.href, {
      signal: ctl.signal,
      headers: { Accept: "application/json", "User-Agent": "SocialMediaLite-LinkPreview/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OEmbedPayload;
    const title = data.title?.trim();
    if (!title) return null;
    const author = data.author_name?.trim();
    return {
      title,
      description: author ? `By ${author}` : null,
      thumbnailUrl: data.thumbnail_url?.startsWith("http") ? data.thumbnail_url : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve YouTube title, description, and thumbnail via yt-dlp, with oEmbed fallback.
 */
export async function fetchYouTubeMetadata(pageUrl: URL): Promise<YouTubeMetadata | null> {
  const watchUrl = canonicalYouTubeWatchUrl(pageUrl);
  if (!watchUrl) return null;

  const viaDlp = await fetchViaYtDlp(watchUrl);
  if (viaDlp) return viaDlp;

  return fetchViaOEmbed(watchUrl);
}
