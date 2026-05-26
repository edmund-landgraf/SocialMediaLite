import { Loader2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/api";
import type { CommentDTO, CommentTreeNode } from "@/types";

const COMMENT_INDENT_PX = 28;
const COMMENT_MAX_VISUAL_DEPTH = 4;
const COMMENT_AUTO_COLLAPSE_DEPTH = 3;

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function countDescendants(node: CommentTreeNode): number {
  let total = node.replies.length;
  for (const reply of node.replies) {
    total += countDescendants(reply);
  }
  return total;
}

function visualIndentPx(depth: number): number {
  if (depth <= 0) return 0;
  return Math.min(depth, COMMENT_MAX_VISUAL_DEPTH) * COMMENT_INDENT_PX;
}

function buildCommentTree(items: CommentDTO[]): CommentTreeNode[] {
  const byId = new Map<string, CommentTreeNode>();
  const roots: CommentTreeNode[] = [];
  for (const item of items) {
    byId.set(item.id, { ...item, replies: [] });
  }
  for (const item of items) {
    const node = byId.get(item.id)!;
    if (item.parentId && byId.has(item.parentId)) {
      byId.get(item.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function CommentAvatar(props: { label: string; imageUrl?: string | null; sizeClass: string }) {
  return (
    <div
      className={[
        "shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-900/65 to-purple-950/65",
        props.sizeClass,
      ].join(" ")}
    >
      {props.imageUrl ? (
        <img src={props.imageUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex size-full items-center justify-center bg-zinc-900/55 text-[10px] font-bold text-white/90">
          {props.label.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function CommentComposer(props: {
  placeholder: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await props.onSubmit(draft.trim());
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={props.compact ? "mt-2 space-y-2" : "mt-3 flex gap-2"}>
      <div className={props.compact ? "flex gap-2" : "flex min-w-0 flex-1 gap-2"}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={props.placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button onClick={() => void submit()} disabled={busy || !draft.trim()}>
          Post
        </Button>
        {props.onCancel ? (
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CommentNode(props: {
  comment: CommentTreeNode;
  depth: number;
  readOnly?: boolean;
  onReply: (parentId: string, text: string) => Promise<void>;
}) {
  const hasReplies = props.comment.replies.length > 0;
  const descendantCount = countDescendants(props.comment);
  const [collapsed, setCollapsed] = useState(
    () => props.depth >= COMMENT_AUTO_COLLAPSE_DEPTH && hasReplies,
  );
  const [replyOpen, setReplyOpen] = useState(false);
  const isRoot = props.depth === 0;

  async function submitReply(text: string) {
    await props.onReply(props.comment.id, text);
    setReplyOpen(false);
    setCollapsed(false);
  }

  const body = (
    <>
      <div className="flex items-start gap-2">
        {hasReplies ? (
          <button
            type="button"
            className="mt-1 flex size-5 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${descendantCount} replies` : "Collapse replies"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <Plus className="size-3" /> : <Minus className="size-3" />}
          </button>
        ) : (
          <span className="mt-1 size-5 shrink-0" aria-hidden />
        )}
        <CommentAvatar
          label={props.comment.author.displayName}
          imageUrl={props.comment.author.profilePicUrl}
          sizeClass={isRoot ? "size-9" : "size-7"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-xs font-semibold text-zinc-100">{props.comment.author.displayName}</span>
            <span className="text-[11px] text-zinc-500">{formatTime(props.comment.createdAt)}</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{props.comment.text}</div>
          {props.readOnly ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
              onClick={() => setReplyOpen((v) => !v)}
            >
              Reply
            </Button>
          )}
          {replyOpen ? (
            <CommentComposer
              compact
              placeholder="Write a reply…"
              onCancel={() => setReplyOpen(false)}
              onSubmit={submitReply}
            />
          ) : null}
        </div>
      </div>

      {collapsed && hasReplies ? (
        <button
          type="button"
          className="mt-2 ml-7 text-xs font-medium text-blue-400 hover:text-blue-300"
          onClick={() => setCollapsed(false)}
        >
          {descendantCount} {descendantCount === 1 ? "reply" : "replies"}
        </button>
      ) : null}
    </>
  );

  return (
    <div className="mt-3 first:mt-0" style={{ paddingLeft: visualIndentPx(props.depth) }}>
      {isRoot ? (
        <div className="rounded-lg border border-zinc-900 bg-zinc-950/70 p-3">{body}</div>
      ) : (
        <div className="py-1">{body}</div>
      )}

      {!collapsed && hasReplies ? (
        <div className="relative mt-1 flex">
          <button
            type="button"
            className="absolute bottom-2 left-0 top-0 w-1 shrink-0 rounded-full bg-zinc-800 hover:bg-zinc-600"
            aria-label="Collapse thread"
            onClick={() => setCollapsed(true)}
          />
          <div className="min-w-0 flex-1 pl-3">
            {props.comment.replies.map((reply) => (
              <CommentNode
                key={reply.id}
                comment={reply}
                depth={props.depth + 1}
                readOnly={props.readOnly}
                onReply={props.onReply}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CommentThread(props: {
  commentsUrl: string;
  open?: boolean;
  embedded?: boolean;
  heading?: string;
  readOnly?: boolean;
  onClose?: () => void;
  onChanged?: () => void;
  onRequestLogin?: () => void;
}) {
  const open = props.open ?? true;
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CommentDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ comments: CommentDTO[] }>(props.commentsUrl);
      setItems(data.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed loading comments");
    } finally {
      setLoading(false);
    }
  }, [props.commentsUrl]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function add(text: string, parentId?: string) {
    setError(null);
    try {
      const created = await apiJson<{ comment: CommentDTO }>(props.commentsUrl, {
        method: "POST",
        body: JSON.stringify(parentId ? { text, parentId } : { text }),
      });
      setItems((xs) => [...xs, created.comment]);
      props.onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed commenting");
      throw e;
    }
  }

  const tree = buildCommentTree(items);

  if (!open) return null;

  return (
    <div className={props.embedded ? "mt-4 border-t border-zinc-800 pt-4" : "border-t border-zinc-800 bg-zinc-950/40 px-4 py-3"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-200">{props.heading ?? "Comments"}</div>
        {props.onClose ? (
          <Button variant="ghost" size="sm" onClick={() => props.onClose?.()}>
            Hide
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      <div>
        {tree.map((comment) => (
          <CommentNode
            key={comment.id}
            comment={comment}
            depth={0}
            readOnly={props.readOnly}
            onReply={(parentId, text) => add(text, parentId)}
          />
        ))}
      </div>

      {props.readOnly ? (
        <p className="mt-3 text-xs text-zinc-500">
          {props.onRequestLogin ? (
            <button
              type="button"
              className="text-zinc-300 underline-offset-2 hover:underline"
              onClick={props.onRequestLogin}
            >
              Log in
            </button>
          ) : (
            <Link to="/login" className="text-zinc-300 underline-offset-2 hover:underline">
              Log in
            </Link>
          )}{" "}
          to join the discussion.
        </p>
      ) : (
        <CommentComposer placeholder="Write a comment…" onSubmit={(text) => add(text)} />
      )}

      {error ? (
        <div className="mt-2 rounded-md bg-red-950/40 px-3 py-2 text-xs text-red-100">{error}</div>
      ) : null}
    </div>
  );
}
