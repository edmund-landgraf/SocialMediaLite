/** Canonical page URL before yt-dlp / playback-stream (improves extractor success). */
export function normalizePlaybackPageUrl(pageUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return pageUrl;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "tiktok.com") {
    parsed.hostname = "www.tiktok.com";
  }

  if (host.includes("instagram.com")) {
    parsed.pathname = parsed.pathname.replace(/^\/reels\//i, "/reel/");
  }

  return parsed.href;
}
