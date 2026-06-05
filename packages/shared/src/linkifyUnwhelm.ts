/** Escape HTML special characters for safe text rendering. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const UNWHELM_ORIGIN = "https://unwhelm.online";
const UNWHELM_HTTP = "http://unwhelm.online";

const ABSOLUTE_RE = /https?:\/\/unwhelm\.online[^\s<>"']*/gi;
const RELATIVE_RE = /\/(?:friends|messages|blog|feedback|login|[a-zA-Z0-9_]+)(?:\/[^\s<>"']*)?/g;

export type LinkifySegment = { type: "text"; value: string } | { type: "link"; href: string; label: string };

/**
 * Split message text into plain segments and unwhelm.online links (absolute or same-origin paths).
 * Off-site URLs stay plain text in v1.
 */
export function linkifyUnwhelmText(text: string): LinkifySegment[] {
  if (!text) return [{ type: "text", value: "" }];

  type Match = { start: number; end: number; href: string; label: string };
  const matches: Match[] = [];

  for (const re of [ABSOLUTE_RE, RELATIVE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      const href = raw.startsWith("/") ? raw : raw.replace(/^http:\/\//i, "https://");
      matches.push({ start: m.index, end: m.index + raw.length, href, label: raw });
    }
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));

  const kept: Match[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }

  const segments: LinkifySegment[] = [];
  let pos = 0;
  for (const match of kept) {
    if (match.start > pos) {
      segments.push({ type: "text", value: text.slice(pos, match.start) });
    }
    segments.push({ type: "link", href: match.href, label: match.label });
    pos = match.end;
  }
  if (pos < text.length) {
    segments.push({ type: "text", value: text.slice(pos) });
  }
  if (segments.length === 0) {
    segments.push({ type: "text", value: text });
  }
  return segments;
}
