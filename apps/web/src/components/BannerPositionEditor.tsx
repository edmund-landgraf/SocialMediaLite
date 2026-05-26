import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";

/** Matches profile banner: h-44 md:h-60 on max-w-5xl content width (~5.33:1). */
const VIEWPORT_ASPECT = "1280 / 240";

function clampPosition(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function BannerPositionEditor(props: {
  bannerUrl: string;
  initialX: number;
  initialY: number;
  onSave: (x: number, y: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [x, setX] = useState(props.initialX);
  const [y, setY] = useState(props.initialY);
  const [busy, setBusy] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    setX(props.initialX);
    setY(props.initialY);
  }, [props.initialX, props.initialY, props.bannerUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) props.onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, props]);

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;

    const rect = viewport.getBoundingClientRect();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // Drag image with pointer — inverse shift on object-position.
    setX(clampPosition(drag.origX - (dx / rect.width) * 100));
    setY(clampPosition(drag.origY - (dy / rect.height) * 100));
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  async function save() {
    setBusy(true);
    try {
      await props.onSave(x, y);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="banner-position-title"
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="banner-position-title" className="text-base font-semibold text-zinc-100">
          Edit banner position
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Drag the photo so the dashed frame shows what appears on your profile.
        </p>

        <div className="mt-4 flex justify-center">
          <div
            ref={viewportRef}
            className="relative w-full max-w-2xl cursor-grab overflow-hidden rounded-md bg-zinc-900 active:cursor-grabbing"
            style={{ aspectRatio: VIEWPORT_ASPECT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={props.bannerUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
              style={{ objectPosition: `${x}% ${y}%` }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-md border-2 border-dashed border-white/70 shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.35)]"
              aria-hidden
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={props.onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function bannerObjectPositionStyle(x?: number | null, y?: number | null): CSSProperties {
  return { objectPosition: `${x ?? 50}% ${y ?? 50}%` };
}
