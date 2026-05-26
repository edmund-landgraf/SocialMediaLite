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

export type YtDlpVideoJson = {
  title?: string;
  description?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; height?: number }>;
  channel?: string;
  uploader?: string;
};

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

export function pickYtDlpThumbnail(info: YtDlpVideoJson): string | null {
  if (info.thumbnail?.startsWith("http")) return info.thumbnail;
  const thumbs = info.thumbnails?.filter((t) => t.url?.startsWith("http")) ?? [];
  if (thumbs.length === 0) return null;
  const sorted = [...thumbs].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return sorted[0]?.url ?? null;
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
