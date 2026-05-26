import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const YTDlpWrap = require("yt-dlp-wrap").default as {
  new (binaryPath?: string): {
    getVideoInfo(ytDlpArguments: string | string[]): Promise<unknown>;
  };
  downloadFromGithub(
    filePath?: string,
    version?: string,
    platform?: NodeJS.Platform,
  ): Promise<void>;
};

const OEMBED_TIMEOUT_MS = 8_000;
const YTDLP_TIMEOUT_MS = 25_000;

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

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ytDlpCacheDir = path.join(apiRoot, ".cache", "yt-dlp");
const ytDlpBinaryPath = path.join(ytDlpCacheDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

let ytDlpInit: Promise<InstanceType<typeof YTDlpWrap>> | null = null;

async function ensureYtDlpBinary(): Promise<InstanceType<typeof YTDlpWrap>> {
  if (!ytDlpInit) {
    ytDlpInit = (async () => {
      const envPath = process.env.YT_DLP_PATH?.trim();
      if (envPath) {
        return new YTDlpWrap(envPath);
      }

      try {
        await fs.access(ytDlpBinaryPath);
      } catch {
        await fs.mkdir(ytDlpCacheDir, { recursive: true });
        await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath, undefined, process.platform);
      }
      return new YTDlpWrap(ytDlpBinaryPath);
    })();
  }
  return ytDlpInit;
}

type YtDlpVideoJson = {
  title?: string;
  description?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; height?: number }>;
  channel?: string;
  uploader?: string;
};

function pickThumbnail(info: YtDlpVideoJson): string | null {
  if (info.thumbnail?.startsWith("http")) return info.thumbnail;
  const thumbs = info.thumbnails?.filter((t) => t.url?.startsWith("http")) ?? [];
  if (thumbs.length === 0) return null;
  const sorted = [...thumbs].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return sorted[0]?.url ?? null;
}

async function fetchViaYtDlp(watchUrl: string): Promise<YouTubeMetadata | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), YTDLP_TIMEOUT_MS);
  try {
    const wrap = await ensureYtDlpBinary();
    const info = (await wrap.getVideoInfo(watchUrl)) as YtDlpVideoJson;

    const title = info.title?.trim();
    if (!title) return null;

    const channel = info.channel?.trim() || info.uploader?.trim();
    const description =
      info.description?.trim() ||
      (channel ? `By ${channel}` : null);

    return {
      title,
      description: description || null,
      thumbnailUrl: pickThumbnail(info),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
