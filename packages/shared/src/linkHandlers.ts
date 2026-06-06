import { resolveInlineVideoEmbed, type InlineVideoEmbed } from "./videoEmbeds.js";

export type YtDlpWebLinkHandler = {
  source: "ytdlp";
  pageUrl: string;
  hostname: string;
  layout: "landscape" | "portrait";
  externalLabel: string;
};

export type ParsedLinkHandler =
  | { source: "embed"; embed: InlineVideoEmbed }
  | YtDlpWebLinkHandler;

/** Fast client/server check for known iframe or native embed handlers (YouTube, TikTok, etc.). */
export function parseKnownLinkHandler(url: string): ParsedLinkHandler | null {
  const embed = resolveInlineVideoEmbed(url);
  if (!embed) return null;
  return { source: "embed", embed };
}

/** yt-dlp probe result for generic web pages (e.g. Yahoo video = yes, Medium article = no). */
export function parseYtDlpWebLinkHandler(url: string, hasYtDlpHandler: boolean): YtDlpWebLinkHandler | null {
  if (!hasYtDlpHandler) return null;
  let hostname = "site";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep fallback label */
  }
  return {
    source: "ytdlp",
    pageUrl: url,
    hostname,
    layout: "landscape",
    externalLabel: hostname,
  };
}

/**
 * Resolve inline playback for a web link: known embed handlers first, then yt-dlp when probed.
 */
export function resolveWebLinkHandler(url: string, hasYtDlpHandler = false): ParsedLinkHandler | null {
  return parseKnownLinkHandler(url) ?? parseYtDlpWebLinkHandler(url, hasYtDlpHandler);
}
