import { useEffect, useRef, useState } from "react";
import {
  getPostReaction,
  POST_REACTIONS,
  reactionCollectsDetails,
  type PostReactionKind,
} from "@socialmedialite/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PostReactionPicker(props: {
  viewerReaction: PostReactionKind | null;
  reactionTotal: number;
  disabled?: boolean;
  onPick: (kind: PostReactionKind, options?: { details?: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const current = props.viewerReaction ? getPostReaction(props.viewerReaction) : null;

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
    setBusy(true);
    try {
      await props.onPick(kind, details ? { details } : undefined);
      setOpen(false);
      setDetailsOpen(false);
      setDetailsDraft("");
    } finally {
      setBusy(false);
    }
  }

  function beginPick(kind: PostReactionKind) {
    if (busy || props.disabled) return;
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
      <div ref={wrapRef} className="relative inline-flex items-center gap-1.5">
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
        {props.reactionTotal > 0 && !current ? (
          <span className="text-xs tabular-nums text-zinc-500">{props.reactionTotal}</span>
        ) : null}

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
                title={r.label}
                disabled={busy}
                className={[
                  "flex size-9 items-center justify-center rounded-full text-xl transition-colors hover:bg-zinc-800",
                  props.viewerReaction === r.id ? "bg-zinc-800 ring-1 ring-zinc-600" : "",
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
