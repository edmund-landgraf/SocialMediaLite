import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePlaybackPageUrl } from "@socialmedialite/shared";
import { writeVideoPlayerLog } from "./videoPlayerLog.js";

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

export type YtDlpVideoJson = {
  title?: string;
  description?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; height?: number }>;
  channel?: string;
  uploader?: string;
};

export type YtDlpPlayback = {
  url: string;
  requestHeaders: Record<string, string>;
};

type YtDlpFormatRow = {
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  format_id?: string;
  height?: number;
  protocol?: string;
  format_note?: string;
  http_headers?: Record<string, string>;
  cookies?: string;
};

type YtDlpInfoJson = YtDlpFormatRow & {
  formats?: YtDlpFormatRow[];
  webpage_url?: string;
  extractor?: string;
  extractor_key?: string;
  _type?: string;
};

function formatHasVideoCodec(format: YtDlpFormatRow): boolean {
  return format.vcodec != null && format.vcodec !== "none";
}

/** @internal Exported for unit tests — true when yt-dlp resolved playable video for a URL. */
export function infoHasYtDlpPlaybackHandler(info: YtDlpInfoJson, pageUrl: string): boolean {
  if (pickYtDlpPlaybackFormat(info, pageUrl)) return true;

  const formats = info.formats ?? [];
  if (formats.some(formatHasVideoCodec)) return true;

  if (info.url?.startsWith("http") && formatHasVideoCodec(info)) return true;

  return false;
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ytDlpCacheDir = path.join(apiRoot, ".cache", "yt-dlp");
const ytDlpBinaryPath = path.join(ytDlpCacheDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

const DEFAULT_PLAYBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

/** Resolved yt-dlp binary path (downloads to cache when needed). */
export async function resolveYtDlpExecutable(): Promise<string> {
  const envPath = process.env.YT_DLP_PATH?.trim();
  if (envPath) return envPath;
  await ensureYtDlpBinary();
  return ytDlpBinaryPath;
}

function cookieHeaderFromYtDlp(raw: string): string {
  const skip = new Set(["domain", "path", "expires", "secure", "httponly", "samesite"]);
  const pairs: string[] = [];
  const re = /(?:^|;\s*)([A-Za-z0-9_.-]+)=([^;]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const name = match[1];
    if (!name || skip.has(name.toLowerCase())) continue;
    pairs.push(`${name}=${match[2]}`);
  }
  return [...new Set(pairs)].join("; ");
}

export function pickYtDlpThumbnail(info: YtDlpVideoJson): string | null {
  if (info.thumbnail?.startsWith("http")) return info.thumbnail;
  const thumbs = info.thumbnails?.filter((t) => t.url?.startsWith("http")) ?? [];
  if (thumbs.length === 0) return null;
  const sorted = [...thumbs].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return sorted[0]?.url ?? null;
}

function playbackHeaders(format: YtDlpFormatRow, pageUrl: string): Record<string, string> {
  const fromFormat = format.http_headers ?? {};
  const referer =
    typeof fromFormat.Referer === "string"
      ? fromFormat.Referer
      : typeof fromFormat.referer === "string"
        ? fromFormat.referer
        : pageUrl;
  const headers: Record<string, string> = {
    "User-Agent":
      typeof fromFormat["User-Agent"] === "string" ? fromFormat["User-Agent"] : DEFAULT_PLAYBACK_UA,
    Referer: referer,
    Accept: "*/*",
  };
  try {
    headers.Origin = new URL(referer).origin;
  } catch {
    /* keep Referer only */
  }
  if (typeof format.cookies === "string" && format.cookies.trim()) {
    const cookie = cookieHeaderFromYtDlp(format.cookies);
    if (cookie) headers.Cookie = cookie;
  }
  return headers;
}

function isHlsFormat(f: YtDlpFormatRow): boolean {
  const protocol = f.protocol?.toLowerCase() ?? "";
  if (protocol.includes("m3u8")) return true;
  const url = f.url ?? "";
  return url.includes(".m3u8") || url.includes("/m3u8/");
}

function isMergedProtocol(f: YtDlpFormatRow): boolean {
  const protocol = f.protocol?.toLowerCase() ?? "";
  return protocol.includes("+");
}

/** Progressive stream the browser <video> tag can play (not HLS). */
function isProgressiveFormat(f: YtDlpFormatRow): boolean {
  if (!f.url?.startsWith("http") || isHlsFormat(f) || isMergedProtocol(f)) return false;
  if (f.vcodec == null || f.vcodec === "none") return false;
  if (f.acodec == null || f.acodec === "none") return false;
  return true;
}

function formatPlaybackScore(f: YtDlpFormatRow): number {
  let score = f.height ?? 0;
  if (f.format_id === "download") score += 20_000;
  if (f.format_note?.toLowerCase().includes("progressive")) score += 15_000;
  if (f.ext === "mp4") score += 10_000;
  else if (f.ext === "webm") score += 5_000;
  const v = f.vcodec?.toLowerCase() ?? "";
  if (v.includes("264") || v.includes("avc")) score += 5_000;
  const a = f.acodec?.toLowerCase() ?? "";
  if (a.includes("aac") || a.includes("mp4a")) score += 1_000;
  return score;
}

/** @internal Exported for unit tests. */
export function pickYtDlpPlaybackFormat(info: YtDlpInfoJson, pageUrl: string): YtDlpPlayback | null {
  const formats = info.formats ?? [];
  const candidates = formats.filter(isProgressiveFormat);
  const sorted = [...candidates].sort((a, b) => formatPlaybackScore(b) - formatPlaybackScore(a));
  const chosen = sorted[0];

  if (chosen?.url) {
    return { url: chosen.url, requestHeaders: playbackHeaders(chosen, pageUrl) };
  }

  if (info.url?.startsWith("http") && isProgressiveFormat(info)) {
    return { url: info.url, requestHeaders: playbackHeaders(info, pageUrl) };
  }

  return null;
}

const YTDLP_FORMAT_SELECTOR =
  "best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4][vcodec!=none]/best[ext=mp4]/best[acodec!=none]/best";

/** Direct progressive stream URL + headers required by the CDN (TikTok, Instagram, etc.). */
export async function getYtDlpPlayback(
  pageUrl: string,
  timeoutMs = 45_000,
): Promise<YtDlpPlayback | null> {
  const normalized = normalizePlaybackPageUrl(pageUrl);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const wrap = await ensureYtDlpBinary();
    let raw = await wrap.getVideoInfo(["-j", "--no-playlist", normalized]);
    let playback = pickYtDlpPlaybackFormat(raw as YtDlpInfoJson, normalized);
    if (!playback) {
      raw = await wrap.getVideoInfo([
        "-j",
        "--no-playlist",
        "-f",
        YTDLP_FORMAT_SELECTOR,
        normalized,
      ]);
      playback = pickYtDlpPlaybackFormat(raw as YtDlpInfoJson, normalized);
    }
    return playback;
  } catch (err) {
    await writeVideoPlayerLog({
      source: "api",
      kind: "ytdlp.resolve.error",
      pageUrl: normalized,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Use getYtDlpPlayback */
export async function getYtDlpPlaybackUrl(
  pageUrl: string,
  timeoutMs = 45_000,
): Promise<string | null> {
  const playback = await getYtDlpPlayback(pageUrl, timeoutMs);
  return playback?.url ?? null;
}

/**
 * Probe whether yt-dlp has a video handler for a generic web URL (Yahoo = yes, Medium article = no).
 * Skips URLs that already match a dedicated platform embed handler.
 */
export async function probeYtDlpLinkHandler(
  pageUrl: string,
  timeoutMs = 12_000,
): Promise<boolean> {
  const normalized = normalizePlaybackPageUrl(pageUrl);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const wrap = await ensureYtDlpBinary();
    const raw = await wrap.getVideoInfo(["-j", "--no-playlist", "--simulate", normalized]);
    return infoHasYtDlpPlaybackHandler(raw as YtDlpInfoJson, normalized);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve public video metadata via yt-dlp (works for YouTube, public Facebook reels, etc.). */
export async function getYtDlpVideoInfo(
  pageUrl: string,
  timeoutMs = 25_000,
): Promise<YtDlpVideoJson | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const wrap = await ensureYtDlpBinary();
    return (await wrap.getVideoInfo(pageUrl)) as YtDlpVideoJson;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
