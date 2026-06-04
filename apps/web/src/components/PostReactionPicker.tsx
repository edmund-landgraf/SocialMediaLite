import { useEffect, useRef, useState } from "react";
import {
  getPostReaction,
  POST_REACTIONS,
  reactionCollectsDetails,
  type PostReactionCount,
  type PostReactionKind,
} from "@socialmedialite/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type PostReactionSummary = {
  reactions: PostReactionCount[];
  viewerReaction: PostReactionKind | null;
  reactionTotal: number;
};

function bumpKind(
  reactions: PostReactionCount[],
  kind: PostReactionKind,
  delta: number,
): PostReactionCount[] {
  const map = new Map(reactions.map((r) => [r.kind, r.count]));
  const next = (map.get(kind) ?? 0) + delta;
  if (next <= 0) map.delete(kind);
  else map.set(kind, next);
  return [...map.entries()].map(([k, count]) => ({ kind: k as PostReactionKind, count }));
}

function applyOptimistic(
  prev: PostReactionSummary,
  kind: PostReactionKind,
): PostReactionSummary {
  if (prev.viewerReaction === kind) {
    const reactions = bumpKind(prev.reactions, kind, -1);
    return {
      reactions,
      viewerReaction: null,
      reactionTotal: Math.max(0, prev.reactionTotal - 1),
    };
  }
  let reactions = prev.reactions;
  let total = prev.reactionTotal;
  if (prev.viewerReaction) {
    reactions = bumpKind(reactions, prev.viewerReaction, -1);
    total -= 1;
  }
  reactions = bumpKind(reactions, kind, 1);
  total += 1;
  return { reactions, viewerReaction: kind, reactionTotal: total };
}

export function PostReactionPicker(props: {
  reactions: PostReactionCount[];
  viewerReaction: PostReactionKind | null;
  reactionTotal: number;
  disabled?: boolean;
  onPick: (kind: PostReactionKind, options?: { details?: string }) => Promise<PostReactionSummary>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [summary, setSummary] = useState<PostReactionSummary>({
    reactions: props.reactions,
    viewerReaction: props.viewerReaction,
    reactionTotal: props.reactionTotal,
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSummary({
      reactions: props.reactions,
      viewerReaction: props.viewerReaction,
      reactionTotal: props.reactionTotal,
    });
  }, [props.reactions, props.viewerReaction, props.reactionTotal]);

  const current = summary.viewerReaction ? getPostReaction(summary.viewerReaction) : null;
  const visibleReactions = summary.reactions.filter((r) => r.count > 0);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!detailsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setDetailsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailsOpen, busy]);

  async function submitPick(kind: PostReactionKind, details?: string) {
    if (busy || props.disabled) return;
    const optimistic = applyOptimistic(summary, kind);
    const previous = summary;
    setSummary(optimistic);
    setBusy(true);
    try {
      const next = await props.onPick(kind, details ? { details } : undefined);
      setSummary(next);
      setOpen(false);
      setDetailsOpen(false);
      setDetailsDraft("");
    } catch {
      setSummary(previous);
    } finally {
      setBusy(false);
    }
  }

  function beginPick(kind: PostReactionKind) {
    if (busy || props.disabled) return;
    if (summary.viewerReaction === kind) {
      void submitPick(kind);
      return;
    }
    if (reactionCollectsDetails(kind)) {
      setOpen(false);
      setDetailsDraft("");
      setDetailsOpen(true);
      return;
    }
    void submitPick(kind);
  }

  async function confirmDetails() {
    const trimmed = detailsDraft.trim();
    await submitPick("disagree", trimmed.length > 0 ? trimmed : undefined);
  }

  async function skipDetails() {
    await submitPick("disagree");
  }

  return (
    <>
      <div ref={wrapRef} className="relative inline-flex flex-wrap items-center gap-1.5">
        {visibleReactions.length > 0 ? (
          <div
            className="inline-flex flex-wrap items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/60 px-2 py-0.5"
            aria-label={`${summary.reactionTotal} reactions`}
          >
            {visibleReactions.map((r) => {
              const def = getPostReaction(r.kind);
              if (!def) return null;
              return (
                <span
                  key={r.kind}
                  className="inline-flex items-center gap-0.5 text-sm leading-none"
                  title={`${def.label}${r.count > 1 ? ` · ${r.count}` : ""}`}
                >
                  <span aria-hidden>{def.emoji}</span>
                  {r.count > 1 ? (
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-400">{r.count}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}

        <Button
          type="button"
          variant={current ? "secondary" : "ghost"}
          size="sm"
          disabled={props.disabled || busy}
          className="gap-1.5"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
        >
          {current ? (
            <>
              <span className="text-base leading-none" aria-hidden>
                {current.emoji}
              </span>
              <span>{current.label}</span>
            </>
          ) : (
            "Reaction"
          )}
        </Button>

        {open ? (
          <div
            role="menu"
            aria-label="Choose a reaction"
            className="absolute bottom-full left-0 z-30 mb-2 flex items-center gap-0.5 rounded-full border border-zinc-700 bg-zinc-900/95 px-2 py-1.5 shadow-xl backdrop-blur-sm"
          >
            {POST_REACTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="menuitem"
                title={summary.viewerReaction === r.id ? `${r.label} (click to remove)` : r.label}
                disabled={busy}
                className={[
                  "flex size-9 items-center justify-center rounded-full text-xl transition-colors hover:bg-zinc-800",
                  summary.viewerReaction === r.id ? "bg-zinc-800 ring-1 ring-zinc-600" : "",
                ].join(" ")}
                onClick={() => beginPick(r.id)}
              >
                <span aria-hidden>{r.emoji}</span>
                <span className="sr-only">{r.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {detailsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disagree-details-title"
        >
          <div
            className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="disagree-details-title" className="text-base font-semibold text-zinc-100">
              Tell us more
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              What made you disagree with this post? Optional — you can skip if you prefer.
            </p>
            <Textarea
              value={detailsDraft}
              onChange={(e) => setDetailsDraft(e.target.value.slice(0, 2000))}
              maxLength={2000}
              rows={4}
              placeholder="Share more details…"
              className="mt-3 resize-y text-sm"
              disabled={busy}
              autoFocus
            />
            <div className="mt-1 text-right text-[10px] text-zinc-500">{detailsDraft.length}/2000</div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void skipDetails()}>
                Skip
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void confirmDetails()}>
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
