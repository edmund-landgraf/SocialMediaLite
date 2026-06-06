import { Archive, Bookmark, Folder, FolderPlus, Inbox, Trash2, X } from "lucide-react";
import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MESSAGE_FOLDER_NAME_MAX_LENGTH,
  type MessageFolderDto,
  type MessageFolderKind,
} from "@socialmedialite/shared";

export type FolderFilter = "all" | string;

type Props = {
  unfiledCount: number;
  folders: MessageFolderDto[];
  selected: FolderFilter;
  onSelect: (filter: FolderFilter) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onAssignThread: (threadId: string, folderId: string | null) => Promise<void>;
  dragThreadId: string | null;
  onDragThreadIdChange: (threadId: string | null) => void;
};

function folderIcon(kind: MessageFolderKind) {
  if (kind === "SAVED") return Bookmark;
  if (kind === "ARCHIVED") return Archive;
  return Folder;
}

function FolderChip(props: {
  id: FolderFilter;
  label: string;
  count: number;
  selected: boolean;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  onDropThread: (threadId: string) => void;
  dragActive: boolean;
  deletable?: boolean;
  onDelete?: () => void;
}) {
  const Icon = props.icon;
  const [over, setOver] = useState(false);
  const highlight = over && props.dragActive;

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        data-folder-id={props.id}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          props.selected
            ? "border-violet-500/70 bg-violet-900/50 text-violet-100"
            : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/80",
          highlight ? "ring-2 ring-violet-400/80 ring-offset-1 ring-offset-zinc-950" : "",
        ].join(" ")}
        onClick={props.onSelect}
        onDragOver={(e) => {
          if (!props.dragActive) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const threadId = e.dataTransfer.getData("text/thread-id");
          if (threadId) props.onDropThread(threadId);
        }}
      >
        {Icon ? <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden /> : null}
        <span>{props.label}</span>
        {props.count > 0 ? (
          <span className="rounded-full bg-zinc-800/90 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-400">
            {props.count}
          </span>
        ) : null}
      </button>
      {props.deletable && props.onDelete ? (
        <button
          type="button"
          className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-red-800 hover:text-red-300 group-hover:flex"
          aria-label={`Delete folder ${props.label}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete?.();
          }}
        >
          <Trash2 className="size-2.5" />
        </button>
      ) : null}
    </div>
  );
}

export function MessageFolderBar(props: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const trashFolder = props.folders.find((f) => f.kind === "TRASH");
  const systemFolders = props.folders.filter((f) => f.kind !== "CUSTOM" && f.kind !== "TRASH");
  const customFolders = props.folders.filter((f) => f.kind === "CUSTOM");

  async function submitCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await props.onCreateFolder(name);
      setNewName("");
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  function handleDropToFolder(folderId: string | null) {
    return (threadId: string) => {
      void props.onAssignThread(threadId, folderId);
      props.onDragThreadIdChange(null);
    };
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="text-[11px] text-zinc-500">
        Group threads by trip, project, or use Saved / Archived. Drag a conversation onto a folder or Trash.
      </p>
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          <FolderChip
            id="all"
            label="All"
            count={props.unfiledCount}
            selected={props.selected === "all"}
            icon={Inbox}
            onSelect={() => props.onSelect("all")}
            onDropThread={handleDropToFolder(null)}
            dragActive={props.dragThreadId != null}
          />
          {systemFolders.map((f) => {
            const Icon = folderIcon(f.kind);
            return (
              <FolderChip
                key={f.id}
                id={f.id}
                label={f.name}
                count={f.threadCount}
                selected={props.selected === f.id}
                icon={Icon}
                onSelect={() => props.onSelect(f.id)}
                onDropThread={handleDropToFolder(f.id)}
                dragActive={props.dragThreadId != null}
              />
            );
          })}
        </div>
        {trashFolder ? (
          <div className="ml-auto shrink-0">
            <FolderChip
              id={trashFolder.id}
              label="Trash"
              count={trashFolder.threadCount}
              selected={props.selected === trashFolder.id}
              icon={Trash2}
              onSelect={() => props.onSelect(trashFolder.id)}
              onDropThread={handleDropToFolder(trashFolder.id)}
              dragActive={props.dragThreadId != null}
            />
          </div>
        ) : null}
      </div>
      <div className="border-t border-zinc-800/80 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {customFolders.map((f) => (
            <FolderChip
              key={f.id}
              id={f.id}
              label={f.name}
              count={f.threadCount}
              selected={props.selected === f.id}
              icon={Folder}
              onSelect={() => props.onSelect(f.id)}
              onDropThread={handleDropToFolder(f.id)}
              dragActive={props.dragThreadId != null}
              deletable
              onDelete={() => {
                if (confirm(`Delete folder "${f.name}"? Threads in it move back to All.`)) {
                  void props.onDeleteFolder(f.id);
                }
              }}
            />
          ))}
          {creating ? (
            <div className="flex items-center gap-1.5">
              <Input
                className="h-8 w-40 text-xs"
                placeholder="Folder name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={MESSAGE_FOLDER_NAME_MAX_LENGTH}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
              />
              <Button type="button" size="sm" disabled={busy || !newName.trim()} onClick={() => void submitCreate()}>
                Add
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Cancel"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <FolderPlus className="size-4" />
              Folder
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
