import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LinkifiedMessageText } from "@/lib/linkifyMessage";
import { formatMessageWhen } from "@/lib/messageTime";
import { MESSAGE_BODY_MAX_LENGTH } from "@socialmedialite/shared";

export type ThreadMessageBubble = {
  id: string;
  authorId: string;
  author: { displayName: string };
  text: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  canEdit?: boolean;
  canDelete?: boolean;
};

type Props = {
  messages: ThreadMessageBubble[];
  viewerId: string;
  className?: string;
  editingId?: string | null;
  editDraft?: string;
  onEditDraftChange?: (value: string) => void;
  onSaveEdit?: (messageId: string) => void;
  onCancelEdit?: () => void;
  onStartEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
};

export function MessageThreadBubbles(props: Props) {
  const interactive = Boolean(props.onStartEdit || props.onDelete);

  return (
    <div className={["space-y-3", props.className ?? ""].join(" ")}>
      {props.messages.map((m) => {
        const mine = m.authorId === props.viewerId;
        const deleted = Boolean(m.deletedAt);
        const editing = props.editingId === m.id;

        return (
          <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
            <div
              className={[
                "group relative max-w-[min(88%,420px)] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                mine
                  ? "border border-violet-400/40 bg-violet-600 text-white"
                  : "border border-zinc-600/45 bg-zinc-700/95 text-zinc-50",
                deleted ? "border-zinc-700/50 bg-zinc-800/80 italic text-zinc-500" : "",
              ].join(" ")}
            >
              {!mine ? (
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                  {m.author.displayName}
                </div>
              ) : null}
              {editing && props.onEditDraftChange && props.onSaveEdit && props.onCancelEdit ? (
                <div className="space-y-2">
                  <Textarea
                    value={props.editDraft ?? ""}
                    onChange={(e) => props.onEditDraftChange?.(e.target.value)}
                    rows={3}
                    maxLength={MESSAGE_BODY_MAX_LENGTH}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => props.onSaveEdit?.(m.id)}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={props.onCancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : deleted ? (
                <span>Message removed</span>
              ) : (
                <LinkifiedMessageText text={m.text ?? ""} tone={mine ? "onAccent" : "default"} />
              )}
              <div
                className={[
                  "mt-1.5 flex items-center gap-2 text-[10px]",
                  mine ? "text-violet-100/85" : "text-zinc-400",
                ].join(" ")}
              >
                <span>{formatMessageWhen(m.createdAt)}</span>
                {m.editedAt ? <span>(edited)</span> : null}
              </div>
              {interactive && !deleted && (m.canEdit || m.canDelete) ? (
                <div className="absolute -top-2 right-1 hidden gap-1 group-hover:flex">
                  {m.canEdit && props.onStartEdit ? (
                    <button
                      type="button"
                      className="rounded bg-zinc-900 p-1 text-zinc-400 hover:text-white"
                      aria-label="Edit message"
                      onClick={() => props.onStartEdit?.(m.id, m.text ?? "")}
                    >
                      <Pencil className="size-3" />
                    </button>
                  ) : null}
                  {m.canDelete && props.onDelete ? (
                    <button
                      type="button"
                      className="rounded bg-zinc-900 p-1 text-zinc-400 hover:text-red-300"
                      aria-label="Delete message"
                      onClick={() => props.onDelete?.(m.id)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
