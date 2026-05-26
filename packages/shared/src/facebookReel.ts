const REEL_URL_PATTERN = /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/reel\/(\d+)/gi;
const REEL_PATH_PATTERN = /facebook\.com\/reel\/(\d+)/i;

export function parseFacebookReelId(urlOrText: string): string | null {
  REEL_URL_PATTERN.lastIndex = 0;
  const fromFull = REEL_URL_PATTERN.exec(urlOrText);
  if (fromFull?.[1]) return fromFull[1];
  const fromPath = urlOrText.match(REEL_PATH_PATTERN);
  return fromPath?.[1] ?? null;
}

export function isFacebookReelUrl(url: string): boolean {
  return parseFacebookReelId(url) != null;
}

export function normalizeFacebookReelUrl(urlOrId: string): string {
  const id = parseFacebookReelId(urlOrId) ?? urlOrId.replace(/\D/g, "");
  return `https://www.facebook.com/reel/${id}`;
}

/** Extract the first reel URL from post text, if any. */
export function extractFacebookReelUrl(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  REEL_URL_PATTERN.lastIndex = 0;
  const match = REEL_URL_PATTERN.exec(text);
  if (!match?.[1]) return null;
  return normalizeFacebookReelUrl(match[1]);
}

/** Remove reel URL lines from a caption while preserving other text. */
export function stripFacebookReelUrls(text: string): string {
  REEL_URL_PATTERN.lastIndex = 0;
  return text
    .replace(REEL_URL_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
