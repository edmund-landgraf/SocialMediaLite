import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiJson, apiUrl } from "@/lib/api";

export type FacebookPostPreviewDTO = {
  id: string;
  title: string;
  description: string;
  createdTime: string;
  permalinkUrl: string | null;
  previewType: "text" | "photo" | "link" | "reel";
  previewImageUrl: string | null;
  previewReelUrl: string | null;
  previewLinkTitle: string | null;
  previewLinkDescription: string | null;
  previewReelPublic: boolean;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeLabel(type: FacebookPostPreviewDTO["previewType"]): string {
  if (type === "photo") return "Photo";
  if (type === "link") return "Link";
  if (type === "reel") return "Reel";
  return "Text";
}

function typeBadgeClass(type: FacebookPostPreviewDTO["previewType"]): string {
  if (type === "photo") return "bg-emerald-950/80 text-emerald-200 ring-emerald-800/60";
  if (type === "link") return "bg-sky-950/80 text-sky-200 ring-sky-800/60";
  if (type === "reel") return "bg-violet-950/80 text-violet-200 ring-violet-800/60";
  return "bg-zinc-800/90 text-zinc-200 ring-zinc-700/60";
}

function proxiedPreviewImage(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("fbcdn.net") || host.endsWith("facebook.com")) {
      return apiUrl(`/api/facebook/preview-image?url=${encodeURIComponent(url)}`);
    }
  } catch {
    return null;
  }
  return url;
}

export function FacebookImportModal(props: {
  open: boolean;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const [posts, setPosts] = useState<FacebookPostPreviewDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enrichedById, setEnrichedById] = useState<Record<string, FacebookPostPreviewDTO>>({});
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [needsImportAuth, setNeedsImportAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPost = useMemo(() => {
    if (!selectedId) return null;
    return enrichedById[selectedId] ?? posts.find((post) => post.id === selectedId) ?? null;
  }, [enrichedById, posts, selectedId]);

  const isSelectedReelEnriched = selectedId != null && Boolean(enrichedById[selectedId]);

  const enrichPreview = useCallback(async (fbPostId: string) => {
    if (enrichedById[fbPostId]) return;
    setEnrichingId(fbPostId);
    setError(null);
    try {
      const resp = await apiJson<{ post: FacebookPostPreviewDTO }>(
        `/api/facebook/posts/${encodeURIComponent(fbPostId)}/preview`,
      );
      setEnrichedById((prev) => ({ ...prev, [fbPostId]: resp.post }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reel preview");
    } finally {
      setEnrichingId((current) => (current === fbPostId ? null : current));
    }
  }, [enrichedById]);

  const selectPost = useCallback(
    (post: FacebookPostPreviewDTO) => {
      setSelectedId(post.id);
      if (post.previewType === "reel" && !enrichedById[post.id]) {
        void enrichPreview(post.id);
      }
    },
    [enrichPreview, enrichedById],
  );

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEnrichedById({});
    try {
      const eligibility = await apiJson<{ eligible: boolean; reason?: string }>(
        "/api/facebook/import/eligibility",
      );
      setNeedsImportAuth(!eligibility.eligible);
      if (!eligibility.eligible) {
        setPosts([]);
        setSelectedId(null);
        return;
      }

      const resp = await apiJson<{ posts: FacebookPostPreviewDTO[] }>("/api/facebook/posts?limit=10");
      setPosts(resp.posts);
      setSelectedId(resp.posts[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Facebook posts");
      setPosts([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function connectFacebookForImport() {
    const returnTo = `${window.location.pathname}?fbImport=1`;
    window.location.href = apiUrl(
      `/api/auth/facebook/import/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  useEffect(() => {
    if (!props.open) return;
    setSearchQuery("");
    void loadRecent();
  }, [props.open, loadRecent]);

  async function runSearch() {
    if (!searchQuery.trim()) {
      await loadRecent();
      return;
    }
    setSearching(true);
    setError(null);
    setEnrichedById({});
    try {
      const resp = await apiJson<{ posts: FacebookPostPreviewDTO[]; query: string }>(
        "/api/facebook/posts/search",
        {
          method: "POST",
          body: JSON.stringify({ query: searchQuery.trim() }),
        },
      );
      setPosts(resp.posts);
      setSelectedId(resp.posts[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function importSelected() {
    if (!selectedId || importing) return;
    setImporting(true);
    setError(null);
    try {
      await apiJson("/api/facebook/import", {
        method: "POST",
        body: JSON.stringify({ fbPostId: selectedId }),
      });
      await props.onImported();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fb-import-title"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Facebook</p>
              <h2 id="fb-import-title" className="mt-0.5 text-xl font-semibold tracking-tight text-white">
                Import a post
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-400">
                Pick one post from your Facebook timeline. The preview on the right shows what will be copied.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or caption…"
              className="min-w-[220px] flex-1 border-zinc-700 bg-zinc-900 text-[15px] text-zinc-100 placeholder:text-zinc-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            <Button type="button" variant="secondary" disabled={searching || loading} onClick={() => void runSearch()}>
              {searching ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Searching…
                </>
              ) : (
                "Search"
              )}
            </Button>
          </div>
        </div>

        <div className="grid min-h-[320px] flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-h-0 border-b border-zinc-800 md:border-b-0 md:border-r">
            <div className="grid grid-cols-[4.5rem_1fr_auto] gap-x-2 border-b border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <span>Date</span>
              <span>Title</span>
              <span className="text-right">Type</span>
            </div>
            <div className="max-h-[min(52vh,420px)] overflow-y-auto">
              {needsImportAuth ? (
                <div className="space-y-3 px-4 py-6">
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Import needs permission to read your Facebook timeline posts. Connect once to
                    enable import — login alone does not grant this.
                  </p>
                  <Button type="button" className="w-full" onClick={connectFacebookForImport}>
                    Connect Facebook for import
                  </Button>
                </div>
              ) : null}

              {!needsImportAuth && loading ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-400">
                  <Loader2 className="size-4 animate-spin" />
                  Loading posts…
                </div>
              ) : null}

              {!needsImportAuth && !loading && posts.length === 0 ? (
                <p className="px-4 py-6 text-sm leading-relaxed text-zinc-500">
                  No posts found. Try Search or re-login with Facebook.
                </p>
              ) : null}

              {!needsImportAuth
                ? posts.map((post, index) => {
                const selected = selectedId === post.id;
                return (
                  <button
                    key={post.id}
                    type="button"
                    className={[
                      "grid w-full grid-cols-[4.5rem_1fr_auto] gap-x-2 border-b border-zinc-800/60 px-3 py-3 text-left transition-colors",
                      index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/20",
                      selected
                        ? "border-l-[3px] border-l-sky-400 bg-sky-950/25 pl-[calc(0.75rem-3px)]"
                        : "border-l-[3px] border-l-transparent hover:bg-zinc-800/40",
                    ].join(" ")}
                    onClick={() => selectPost(post)}
                  >
                    <span className="pt-0.5 text-xs tabular-nums leading-tight text-zinc-500">
                      {formatWhen(post.createdTime)}
                    </span>
                    <span
                      className={[
                        "line-clamp-2 text-[15px] leading-snug",
                        selected ? "font-semibold text-white" : "font-medium text-zinc-200",
                      ].join(" ")}
                    >
                      {post.title}
                    </span>
                    <span
                      className={[
                        "self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                        typeBadgeClass(post.previewType),
                      ].join(" ")}
                    >
                      {typeLabel(post.previewType)}
                    </span>
                  </button>
                );
              })
                : null}
            </div>
          </div>

          <div className="min-h-0 bg-zinc-900/20 px-5 py-4">
            {selectedPost ? (
              <div className="flex h-full min-h-[240px] flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                      typeBadgeClass(selectedPost.previewType),
                    ].join(" ")}
                  >
                    {typeLabel(selectedPost.previewType)}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-500">{formatWhen(selectedPost.createdTime)}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-white">
                  {selectedPost.title}
                </h3>
                {selectedPost.previewType === "photo" && selectedPost.previewImageUrl ? (
                  <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                    <img
                      src={proxiedPreviewImage(selectedPost.previewImageUrl) ?? selectedPost.previewImageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="max-h-[min(40vh,320px)] w-full object-contain"
                    />
                  </div>
                ) : null}
                {selectedPost.previewType === "reel" && enrichingId === selectedId ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-4 text-sm text-zinc-400">
                    <Loader2 className="size-4 animate-spin" />
                    Loading reel preview…
                  </div>
                ) : null}
                {selectedPost.previewType === "reel" &&
                enrichingId !== selectedId &&
                isSelectedReelEnriched &&
                selectedPost.previewReelPublic ? (
                  <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70">
                    <div className="flex flex-col sm:flex-row">
                      <div className="relative h-[124px] w-full shrink-0 overflow-hidden bg-zinc-900 sm:w-[238px]">
                        {selectedPost.previewImageUrl ? (
                          <img
                            src={
                              proxiedPreviewImage(selectedPost.previewImageUrl) ??
                              selectedPost.previewImageUrl
                            }
                            alt=""
                            referrerPolicy="no-referrer"
                            className="size-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Facebook Reel
                        </div>
                        {selectedPost.previewLinkTitle ? (
                          <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-100">
                            {selectedPost.previewLinkTitle}
                          </div>
                        ) : null}
                        {selectedPost.previewLinkDescription ? (
                          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
                            {selectedPost.previewLinkDescription}
                          </p>
                        ) : null}
                        {selectedPost.previewReelUrl ? (
                          <a
                            href={selectedPost.previewReelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 hover:underline"
                          >
                            Open reel
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                {selectedPost.previewType === "reel" &&
                enrichingId !== selectedId &&
                isSelectedReelEnriched &&
                !selectedPost.previewReelPublic ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
                    <p className="text-sm font-medium text-zinc-300">
                      This content isn&apos;t available right now
                    </p>
                    {selectedPost.previewReelUrl ? (
                      <a
                        href={selectedPost.previewReelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex break-all text-sm text-sky-300 hover:text-sky-200 hover:underline"
                      >
                        {selectedPost.previewReelUrl}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {selectedPost.description &&
                !(selectedPost.previewType === "reel" && selectedPost.description === selectedPost.title) ? (
                  <p className="mt-3 flex-1 whitespace-pre-wrap text-[15px] leading-7 text-zinc-300">
                    {selectedPost.description}
                  </p>
                ) : (
                  <p className="mt-3 text-sm italic text-zinc-500">No additional caption for this post.</p>
                )}
                {selectedPost.permalinkUrl ? (
                  <a
                    href={selectedPost.permalinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 hover:underline"
                  >
                    View on Facebook
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-zinc-500">
                Select a post to preview it here.
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="border-t border-red-900/40 bg-red-950/30 px-5 py-2.5 text-sm text-red-200">{error}</div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-zinc-800 bg-zinc-900/40 px-5 py-4">
          <Button type="button" variant="ghost" disabled={importing} onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!selectedId || importing} onClick={() => void importSelected()}>
            {importing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importing…
              </>
            ) : (
              "Import selected"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
