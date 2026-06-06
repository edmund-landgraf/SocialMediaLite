import dns from "node:dns/promises";
import net from "node:net";
import type { StorageProvider } from "../storage/types.js";
import { resizeLinkPreviewHero } from "./image.js";
import { parseKnownLinkHandler } from "@socialmedialite/shared";
import { fetchYouTubeMetadata, isYouTubeHostname } from "./youtubeMetadata.js";
import { probeYtDlpLinkHandler } from "./ytDlpClient.js";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 600_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const LINK_TITLE_MAX = 300;
const LINK_DESC_MAX = 1200;

/** Unfurl/crawler UA — Medium and similar sites block generic browsers (Cloudflare 403). */
const UA = "Twitterbot/1.0";
const UA_FALLBACK = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function isBlockedPreviewPage(title: string | null, html: string): boolean {
  const t = title?.trim().toLowerCase() ?? "";
  if (t.includes("just a moment")) return true;
  if (t === "access denied" || t === "forbidden") return true;
  // Only inspect early HTML (head / challenge shell), not article body text.
  const head = html.slice(0, 12_000);
  if (/cf-browser-verification|challenge-platform/i.test(head)) return true;
  if (/performing security verification/i.test(head)) return true;
  return false;
}

function clamp(s: string | null, max: number): string | null {
  if (s == null || s === "") return null;
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function isPrivateOrSpecialIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || (a === 169 && b === 254) || (a >= 224 && a <= 255)) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const x = ip.toLowerCase();
  if (x === "::1") return true;
  if (x.startsWith("fe80:")) return true;
  if (x.startsWith("fc") || x.startsWith("fd")) return true;
  return false;
}

/** Hostname blocklist for obvious SSRF / local targets (DNS check adds another layer). */
function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  if (h.endsWith(".internal")) return true;
  return false;
}

export async function assertOutboundUrlSafe(urlStr: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (isForbiddenHostname(u.hostname)) {
    throw new Error("URL host is not allowed");
  }
  if (net.isIP(u.hostname)) {
    if (isPrivateOrSpecialIp(u.hostname)) {
      throw new Error("URL host is not allowed");
    }
    return u;
  }
  const { address } = await dns.lookup(u.hostname);
  if (isPrivateOrSpecialIp(address)) {
    throw new Error("URL resolves to a disallowed network");
  }
  return u;
}

function metaAttributeContent(html: string, attr: "property" | "name", key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reKeyFirst = new RegExp(
    `<meta\\s[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "is",
  );
  const reContentFirst = new RegExp(
    `<meta\\s[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`,
    "is",
  );
  const m = html.match(reKeyFirst)?.[1] ?? html.match(reContentFirst)?.[1];
  const raw = m?.trim();
  return raw ? decodeBasicEntities(raw) : null;
}

function metaPropertyContent(html: string, property: string): string | null {
  return metaAttributeContent(html, "property", property);
}

function metaNameContent(html: string, name: string): string | null {
  return metaAttributeContent(html, "name", name);
}

function readTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,600}?)<\/title>/is);
  if (!m?.[1]) return null;
  const t = decodeBasicEntities(m[1].replace(/\s+/g, " ").trim());
  return t || null;
}

function pickOgImage(html: string): string | null {
  return (
    metaPropertyContent(html, "og:image:secure_url") ??
    metaPropertyContent(html, "og:image:url") ??
    metaPropertyContent(html, "og:image") ??
    metaPropertyContent(html, "twitter:image") ??
    metaNameContent(html, "twitter:image") ??
    metaNameContent(html, "twitter:image:src")
  );
}

function readJsonLdDescription(html: string): string | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const found = findDescriptionInJsonLd(parsed);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function findTitleInJsonLd(node: unknown): string | null {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const t = findTitleInJsonLd(item);
      if (t) return t;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  for (const key of ["headline", "name", "title"] as const) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return decodeBasicEntities(v.trim());
  }
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const t = findTitleInJsonLd(item);
      if (t) return t;
    }
  }
  return null;
}

function readJsonLdTitle(html: string): string | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const found = findTitleInJsonLd(parsed);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function findDescriptionInJsonLd(node: unknown): string | null {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const d = findDescriptionInJsonLd(item);
      if (d) return d;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const direct = obj.description;
  if (typeof direct === "string" && direct.trim()) return decodeBasicEntities(direct.trim());

  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const d = findDescriptionInJsonLd(item);
      if (d) return d;
    }
  }

  return null;
}

function pickDescription(html: string): string | null {
  const candidates = [
    metaPropertyContent(html, "og:description"),
    metaPropertyContent(html, "twitter:description"),
    metaNameContent(html, "description"),
    metaNameContent(html, "twitter:description"),
    readJsonLdDescription(html),
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return t;
  }
  return null;
}

function pickTitle(html: string): string | null {
  const candidates = [
    metaPropertyContent(html, "og:title"),
    metaPropertyContent(html, "twitter:title"),
    metaNameContent(html, "title"),
    metaNameContent(html, "twitter:title"),
    readJsonLdTitle(html),
    readTitleTag(html),
  ];
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return decodeBasicEntities(t);
  }
  return null;
}

function absolutize(candidate: string | null, base: URL): string | null {
  if (!candidate) return null;
  try {
    return new URL(candidate, base.href).href;
  } catch {
    return null;
  }
}

export function parseOgFromHtml(html: string, pageUrl: URL): {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
} {
  const ogImageAbs = absolutize(pickOgImage(html), pageUrl);
  return {
    title: pickTitle(html),
    description: pickDescription(html),
    imageUrl: ogImageAbs,
  };
}

async function fetchLimitedWithUa(
  urlStr: string,
  maxBytes: number,
  userAgent: string,
): Promise<{ finalUrl: string; buf: Buffer; contentType: string }> {
  let current = urlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertOutboundUrlSafe(current);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: ctl.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": userAgent,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect missing Location header");
      current = new URL(loc, current).href;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status})`);
    }

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab).subarray(0, maxBytes);
    const ct = res.headers.get("content-type") ?? "";
    return { finalUrl: current, buf, contentType: ct };
  }
  throw new Error("Too many redirects");
}

async function fetchLimited(
  urlStr: string,
  maxBytes: number,
): Promise<{ finalUrl: string; buf: Buffer; contentType: string }> {
  let lastErr: Error | null = null;
  for (const ua of [UA, UA_FALLBACK]) {
    try {
      const fetched = await fetchLimitedWithUa(urlStr, maxBytes, ua);
      const page = await assertOutboundUrlSafe(fetched.finalUrl);
      const html = fetched.buf.toString("utf8");
      const { title } = parseOgFromHtml(html, page);
      if (!isBlockedPreviewPage(title, html)) return fetched;
      lastErr = new Error("Preview blocked by bot protection");
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Fetch failed");
}

async function fetchImageBuffer(imageUrlStr: string): Promise<Buffer> {
  let current = imageUrlStr;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertOutboundUrlSafe(current);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: ctl.signal,
        headers: { Accept: "image/*,*/*;q=0.8", "User-Agent": UA },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Image redirect missing Location");
      current = new URL(loc, current).href;
      continue;
    }

    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);

    const ab = await res.arrayBuffer();
    return Buffer.from(ab).subarray(0, MAX_IMAGE_BYTES);
  }
  throw new Error("Too many image redirects");
}

/**
 * Lightweight metadata for the composer (no stored thumbnail).
 */
async function resolvePlaybackHandlerFlag(pageUrlStr: string): Promise<boolean> {
  if (parseKnownLinkHandler(pageUrlStr)) return true;
  return probeYtDlpLinkHandler(pageUrlStr);
}

export async function fetchLinkPreviewMetadata(pageUrlStr: string): Promise<{
  url: string;
  hostname: string;
  title: string | null;
  description: string | null;
  remoteImageUrl: string | null;
  hasPlaybackHandler: boolean;
}> {
  const first = await assertOutboundUrlSafe(pageUrlStr);
  const hostname = first.hostname;
  const canonicalUrl = first.href.split("#")[0] ?? first.href;

  if (isYouTubeHostname(hostname)) {
    try {
      const [yt, hasPlaybackHandler] = await Promise.all([
        fetchYouTubeMetadata(first),
        resolvePlaybackHandlerFlag(pageUrlStr),
      ]);
      if (yt) {
        return {
          url: canonicalUrl,
          hostname,
          title: clamp(yt.title, LINK_TITLE_MAX),
          description: clamp(yt.description, LINK_DESC_MAX),
          remoteImageUrl: yt.thumbnailUrl,
          hasPlaybackHandler,
        };
      }
    } catch {
      /* fall through to HTML / hostname fallback */
    }
  }

  try {
    const [{ finalUrl, buf }, hasPlaybackHandler] = await Promise.all([
      fetchLimited(pageUrlStr, MAX_HTML_BYTES),
      resolvePlaybackHandlerFlag(pageUrlStr),
    ]);
    const page = await assertOutboundUrlSafe(finalUrl);
    const html = buf.toString("utf8");

    let { title, description, imageUrl } = parseOgFromHtml(html, page);

    title = clamp(title, LINK_TITLE_MAX);
    description = clamp(description, LINK_DESC_MAX);
    if (!title) title = clamp(page.hostname.replace(/^www\./, ""), LINK_TITLE_MAX);

    return {
      url: page.href.split("#")[0] ?? page.href,
      hostname,
      title,
      description,
      remoteImageUrl: imageUrl,
      hasPlaybackHandler,
    };
  } catch {
    const hasPlaybackHandler = await resolvePlaybackHandlerFlag(pageUrlStr).catch(() => false);
    return {
      url: pageUrlStr.split("#")[0]!,
      hostname,
      title: clamp(hostname.replace(/^www\./, ""), LINK_TITLE_MAX),
      description: null,
      remoteImageUrl: null,
      hasPlaybackHandler,
    };
  }
}

export async function buildStoredLinkPreview(opts: {
  pageUrlStr: string;
  authorId: string;
  storage: StorageProvider;
}): Promise<{
  linkTitle: string | null;
  linkDescription: string | null;
  linkPreviewImageKey: string | null;
}> {
  let pageSafe: URL;
  try {
    pageSafe = await assertOutboundUrlSafe(opts.pageUrlStr);
  } catch {
    try {
      const u = new URL(opts.pageUrlStr);
      return {
        linkTitle: clamp(u.hostname.replace(/^www\./, ""), LINK_TITLE_MAX),
        linkDescription: null,
        linkPreviewImageKey: null,
      };
    } catch {
      return { linkTitle: "Link", linkDescription: null, linkPreviewImageKey: null };
    }
  }

  let linkTitle: string | null = null;
  let linkDescription: string | null = null;
  let linkPreviewImageKey: string | null = null;

  if (isYouTubeHostname(pageSafe.hostname)) {
    try {
      const yt = await fetchYouTubeMetadata(pageSafe);
      if (yt) {
        linkTitle = clamp(yt.title, LINK_TITLE_MAX);
        linkDescription = clamp(yt.description, LINK_DESC_MAX);
        let imgUrl: string | null = yt.thumbnailUrl;
        if (imgUrl) {
          try {
            await assertOutboundUrlSafe(imgUrl);
          } catch {
            imgUrl = null;
          }
        }
        if (imgUrl) {
          try {
            const rawImg = await fetchImageBuffer(imgUrl);
            const processed = await resizeLinkPreviewHero(rawImg);
            const key = `users/${opts.authorId}/link-preview-${Date.now()}.webp`;
            await opts.storage.putObject({
              key,
              contentType: processed.contentType,
              buffer: processed.buffer,
            });
            linkPreviewImageKey = key;
          } catch {
            linkPreviewImageKey = null;
          }
        }
        return { linkTitle, linkDescription, linkPreviewImageKey };
      }
    } catch {
      /* fall through to HTML scrape */
    }
  }

  try {
    const { finalUrl, buf } = await fetchLimited(opts.pageUrlStr, MAX_HTML_BYTES);
    const page = await assertOutboundUrlSafe(finalUrl);
    const html = buf.toString("utf8");
    const parsed = parseOgFromHtml(html, page);

    linkTitle = clamp(parsed.title, LINK_TITLE_MAX) ?? clamp(page.hostname.replace(/^www\./, ""), LINK_TITLE_MAX);
    linkDescription = clamp(parsed.description, LINK_DESC_MAX);

    let imgUrl: string | null = null;
    if (parsed.imageUrl) {
      try {
        await assertOutboundUrlSafe(parsed.imageUrl);
        imgUrl = parsed.imageUrl;
      } catch {
        imgUrl = null;
      }
    }

    if (imgUrl) {
      try {
        const rawImg = await fetchImageBuffer(imgUrl);
        const processed = await resizeLinkPreviewHero(rawImg);
        const key = `users/${opts.authorId}/link-preview-${Date.now()}.webp`;
        await opts.storage.putObject({
          key,
          contentType: processed.contentType,
          buffer: processed.buffer,
        });
        linkPreviewImageKey = key;
      } catch {
        linkPreviewImageKey = null;
      }
    }
  } catch {
    linkTitle = clamp(pageSafe.hostname.replace(/^www\./, ""), LINK_TITLE_MAX);
    linkDescription = null;
    linkPreviewImageKey = null;
  }

  return { linkTitle, linkDescription, linkPreviewImageKey };
}
