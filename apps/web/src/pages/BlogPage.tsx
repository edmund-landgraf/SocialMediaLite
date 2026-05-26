import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";
import type { BlogEntryDTO } from "@/types";

type BlogResp = {
  entries: BlogEntryDTO[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseEntryBody(body: string, title: string): { description: string; coAuthor: string | null } {
  const lines = body.split("\n");
  let start = 0;
  if (lines[0]?.trim() === title.trim()) start = 1;

  const rest = lines.slice(start);
  const coAuthorIdx = rest.findIndex((l) => l.trim().toLowerCase().startsWith("co-authored-by:"));
  const coAuthor = coAuthorIdx >= 0 ? rest[coAuthorIdx].trim() : null;
  const description = (coAuthorIdx >= 0 ? rest.slice(0, coAuthorIdx) : rest).join("\n").trim();

  return { description, coAuthor };
}

function BlogEntryCard({ entry }: { entry: BlogEntryDTO }) {
  const { description, coAuthor } = parseEntryBody(entry.body, entry.title);

  return (
    <article className="group relative grid gap-3 border-b border-zinc-800/70 py-4 sm:grid-cols-[7.5rem_1fr] sm:gap-x-6 sm:py-5">
      <div className="sm:pt-0.5">
        <time
          dateTime={entry.committedAt}
          className="block text-xs font-medium tabular-nums leading-none text-zinc-500"
        >
          {formatDate(entry.committedAt)}
        </time>
        <p className="mt-1.5 truncate text-xs text-zinc-600">{entry.authorName}</p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {entry.commitUrl ? (
            <a
              href={entry.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-100 hover:text-blue-300 hover:underline"
            >
              {entry.title}
            </a>
          ) : (
            <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-100">{entry.title}</h2>
          )}
          {entry.commitUrl ? (
            <a
              href={entry.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-zinc-600 hover:text-blue-400"
              title="View commit on GitHub"
            >
              {entry.sha.slice(0, 7)}
            </a>
          ) : null}
        </div>

        {description ? (
          <div className="mt-1.5 text-sm leading-6 text-zinc-400">
            {description.split("\n\n").map((para, i) => (
              <p key={i} className={i > 0 ? "mt-2" : undefined}>
                {para.split("\n").map((line, j, arr) => (
                  <span key={j}>
                    {line}
                    {j < arr.length - 1 ? <br /> : null}
                  </span>
                ))}
              </p>
            ))}
          </div>
        ) : null}

        {coAuthor ? <p className="mt-2 text-xs leading-5 text-zinc-600">{coAuthor}</p> : null}
      </div>
    </article>
  );
}

export function BlogPage() {
  const [entries, setEntries] = useState<BlogEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiJson<BlogResp>("/api/blog");
        setEntries(resp.entries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load blog");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto min-h-full max-w-2xl px-5 py-8">
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-zinc-800/70 pb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Blog</h1>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">Major check-ins from the project repository</p>
        </div>
        <Button asChild variant="secondary" size="sm" className="h-8 shrink-0 px-3 text-xs">
          <Link to="/login">Back to login</Link>
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" />
          Loading entries…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</div>
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <p className="text-sm leading-6 text-zinc-500">
          No blog entries yet. They appear after the API syncs commits from GitHub on startup.
        </p>
      ) : null}

      <div>{entries.map((entry) => <BlogEntryCard key={entry.id} entry={entry} />)}</div>
    </div>
  );
}
