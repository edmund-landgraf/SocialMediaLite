import { Archive, Bookmark, ChevronRight, Folder, Inbox, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import type { MessageFolderDto, MessageFolderKind } from "@socialmedialite/shared";

export type MessageThreadContextMenuState = {
  threadId: string;
  x: number;
  y: number;
} | null;

type MoveTarget = {
  folderId: string | null;
  label: string;
  icon: ComponentType<{ className?: string }>;
  section: "all" | "system" | "custom";
};

const SYSTEM_FOLDER_ORDER: MessageFolderKind[] = ["SAVED", "ARCHIVED", "TRASH"];

function folderMoveIcon(kind: MessageFolderKind | "all"): ComponentType<{ className?: string }> {
  if (kind === "all") return Inbox;
  if (kind === "SAVED") return Bookmark;
  if (kind === "ARCHIVED") return Archive;
  if (kind === "TRASH") return Trash2;
  return Folder;
}

export function buildThreadMoveTargets(folders: MessageFolderDto[]): MoveTarget[] {
  const targets: MoveTarget[] = [
    { folderId: null, label: "All", icon: folderMoveIcon("all"), section: "all" },
  ];

  for (const kind of SYSTEM_FOLDER_ORDER) {
    const folder = folders.find((f) => f.kind === kind);
    if (folder) {
      targets.push({
        folderId: folder.id,
        label: folder.name,
        icon: folderMoveIcon(kind),
        section: "system",
      });
    }
  }

  const custom = folders
    .filter((f) => f.kind === "CUSTOM")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  for (const folder of custom) {
    targets.push({
      folderId: folder.id,
      label: folder.name,
      icon: Folder,
      section: "custom",
    });
  }

  return targets;
}

function clampPosition(x: number, y: number, width: number, height: number) {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}

type Props = {
  state: MessageThreadContextMenuState;
  folders: MessageFolderDto[];
  currentFolderId: string | null;
  onMove: (threadId: string, folderId: string | null) => void;
  onClose: () => void;
};

export function MessageThreadContextMenu(props: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const moveTargets = useMemo(() => buildThreadMoveTargets(props.folders), [props.folders]);

  useEffect(() => {
    if (!props.state) return;
    setMoveOpen(false);
  }, [props.state]);

  useLayoutEffect(() => {
    if (!props.state || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPos(clampPosition(props.state.x, props.state.y, rect.width, rect.height));
  }, [props.state, moveTargets.length]);

  useEffect(() => {
    if (!props.state) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    function onPointerDown(e: PointerEvent) {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) props.onClose();
    }
    function onScroll() {
      props.onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [props.state, props.onClose]);

  if (!props.state) return null;

  const threadId = props.state.threadId;

  function pickTarget(folderId: string | null) {
    props.onMove(threadId, folderId);
    props.onClose();
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[200] min-w-[148px] rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl shadow-black/50"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative">
        <button
          type="button"
          role="menuitem"
          aria-expanded={moveOpen}
          className={[
            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
            moveOpen ? "bg-zinc-800 text-white" : "text-zinc-200 hover:bg-zinc-800",
          ].join(" ")}
          onClick={() => setMoveOpen(true)}
        >
          <span>Move</span>
          <ChevronRight className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
        </button>
        {moveOpen ? (
          <div
            role="menu"
            className="absolute left-full top-0 z-[201] ml-1 max-h-[min(320px,70vh)] min-w-[168px] overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl shadow-black/50"
          >
            {moveTargets.map((target, index) => {
              const Icon = target.icon;
              const isCurrent =
                target.folderId === props.currentFolderId ||
                (target.folderId == null && props.currentFolderId == null);
              const prev = moveTargets[index - 1];
              const showDivider = prev != null && prev.section !== "custom" && target.section === "custom";

              return (
                <div key={target.folderId ?? "all"}>
                  {showDivider ? <div className="my-1 border-t border-zinc-800" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isCurrent}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
                      isCurrent
                        ? "cursor-default text-zinc-500"
                        : "text-zinc-200 hover:bg-zinc-800",
                    ].join(" ")}
                    onClick={() => {
                      if (!isCurrent) pickTarget(target.folderId);
                    }}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{target.label}</span>
                    {isCurrent ? <span className="ml-auto text-[10px] text-zinc-600">here</span> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
