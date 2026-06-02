import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";

/** Matches http(s) URLs; trims common trailing punctuation from the link target. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

type TextPart = { type: "text"; value: string };
type UrlPart = { type: "url"; value: string; href: string };
type Part = TextPart | UrlPart;

export function splitTextWithUrls(input: string): Part[] {
  if (!input) return [];

  const parts: Part[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: input.slice(lastIndex, index) });
    }
    const raw = match[0];
    let href = raw;
    let trailing = "";
    while (href.length > 0 && /[),.;:!?]$/.test(href)) {
      trailing = href.slice(-1) + trailing;
      href = href.slice(0, -1);
    }
    if (href) {
      parts.push({ type: "url", value: href, href });
    }
    if (trailing) {
      parts.push({ type: "text", value: trailing });
    }
    if (!href && !trailing) {
      parts.push({ type: "text", value: raw });
    }
    lastIndex = index + raw.length;
  }

  if (lastIndex < input.length) {
    parts.push({ type: "text", value: input.slice(lastIndex) });
  }

  return parts;
}

type LinkifiedTextProps = {
  text: string;
  className?: string;
};

/** Renders plain text with `http(s)://…` segments as clickable links (new tab). */
export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const parts = useMemo(() => splitTextWithUrls(text), [text]);

  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {parts.map((part, i) =>
        part.type === "url" ? (
          <a
            key={`${i}-${part.href}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-medium text-sky-400 underline underline-offset-2 hover:text-sky-300"
          >
            {part.value}
          </a>
        ) : (
          <Fragment key={i}>{part.value}</Fragment>
        ),
      )}
    </div>
  );
}
