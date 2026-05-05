import dns from "node:dns/promises";
import net from "node:net";
import type { StorageProvider } from "../storage/types.js";
import { resizeLinkPreviewHero } from "./image.js";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 600_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const LINK_TITLE_MAX = 300;
const LINK_DESC_MAX = 600;

const UA = "SocialMediaLite-LinkPreview/1.0 (+https://github.com/)";

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

function metaPropertyContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rePropFirst = new RegExp(
    `<meta\\s[^>]*property=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "is",
  );
  const reContentFirst = new RegExp(
    `<meta\\s[^>]*content=["']([^"']*)["'][^>]*property=["']${escaped}["']`,
    "is",
  );
  const m = html.match(rePropFirst)?.[1] ?? html.match(reContentFirst)?.[1];
  const raw = m?.trim();
  return raw ? decodeBasicEntities(raw) : null;
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
    metaPropertyContent(html, "twitter:image")
  );
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
  const ogTitle =
    metaPropertyContent(html, "og:title") ?? metaPropertyContent(html, "twitter:title");
  const ogDesc =
    metaPropertyContent(html, "og:description") ??
    metaPropertyContent(html, "twitter:description");
  const ogImageAbs = absolutize(pickOgImage(html), pageUrl);

  const titleFallback = readTitleTag(html);
  const title = ogTitle?.trim() || titleFallback?.trim() || null;
  const description = ogDesc?.trim() || null;

  return { title: title ? decodeBasicEntities(title) : null, description, imageUrl: ogImageAbs };
}

async function fetchLimited(
  urlStr: string,
  maxBytes: number,
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
          "User-Agent": UA,
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
export async function fetchLinkPreviewMetadata(pageUrlStr: string): Promise<{
  url: string;
  hostname: string;
  title: string | null;
  description: string | null;
  remoteImageUrl: string | null;
}> {
  const first = await assertOutboundUrlSafe(pageUrlStr);
  const hostname = first.hostname;

  try {
    const { finalUrl, buf } = await fetchLimited(pageUrlStr, MAX_HTML_BYTES);
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
    };
  } catch {
    return {
      url: pageUrlStr.split("#")[0]!,
      hostname,
      title: clamp(hostname.replace(/^www\./, ""), LINK_TITLE_MAX),
      description: null,
      remoteImageUrl: null,
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
