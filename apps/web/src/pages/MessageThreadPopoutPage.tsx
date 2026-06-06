import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageThreadBubbles } from "@/components/MessageThreadBubbles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/api";
import { MESSAGE_BODY_MAX_LENGTH } from "@socialmedialite/shared";
import type { PublicUser } from "@/types";

type MessageAuthor = Pick<PublicUser, "id" | "username" | "displayName" | "profilePicUrl">;

type MessageItem = {
  id: string;
  authorId: string;
  author: MessageAuthor;
  text: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

export function MessageThreadPopoutPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const threadId = searchParams.get("thread")?.trim() ?? "";
  const scrollRef = useRef<HTMLDivElement>(null);

  const [me, setMe] = useState<PublicUser | null>(null);
  const [subject, setSubject] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const loadThread = useCallback(async () => {
    if (!threadId) {
      setError("Missing thread id");
      setLoading(false);
      return;
    }
    try {
      const meResp = await apiJson<{ user: PublicUser }>("/api/me");
      setMe(meResp.user);
      const data = await apiJson<{
        thread: { subject: string };
        messages: MessageItem[];
      }>(`/api/messages/threads/${threadId}`);
      setSubject(data.thread.subject);
      setMessages(data.messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load thread");
      nav("/login");
    } finally {
      setLoading(false);
    }
  }, [threadId, nav]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    document.title = subject || "Messages";
    return () => {
      document.title = "SocialMediaLite";
    };
  }, [subject]);

  useEffect(() => {
    if (!threadId || loading) return;
    const timer = window.setInterval(() => {
      void apiJson<{ thread: { subject: string }; messages: MessageItem[] }>(
        `/api/messages/threads/${threadId}`,
      )
        .then((data) => {
          setSubject(data.thread.subject);
          setMessages(data.messages);
        })
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [threadId, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function sendReply() {
    const text = replyText.trim();
    if (!text || !threadId) return;
    setReplyBusy(true);
    setError(null);
    try {
      const data = await apiJson<{ message: MessageItem }>(`/api/messages/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setMessages((prev) => [...prev, data.message]);
      setReplyText("");
      await apiJson(`/api/messages/threads/${threadId}/read`, { method: "POST" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setReplyBusy(false);
    }
  }

  async function saveEdit(messageId: string) {
    const text = editDraft.trim();
    if (!text || !threadId) return;
    try {
      const data = await apiJson<{ message: MessageItem }>(
        `/api/messages/threads/${threadId}/messages/${messageId}`,
        { method: "PATCH", body: JSON.stringify({ text }) },
      );
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data.message : m)));
      setEditingId(null);
      setEditDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to edit");
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Remove this message?") || !threadId) return;
    try {
      await apiJson(`/api/messages/threads/${threadId}/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: null, deletedAt: new Date().toISOString(), canEdit: false, canDelete: false }
            : m,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (!threadId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-sm text-zinc-400">
        No thread selected.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-zinc-950 text-zinc-400">
        <Loader2 className="size-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-sm text-red-300">
        {error ?? "Could not load conversation"}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 p-3">
      {error ? (
        <div className="mb-2 rounded-md bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</div>
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-zinc-950/50 px-2 py-3"
      >
        <MessageThreadBubbles
          messages={messages}
          viewerId={me.id}
          editingId={editingId}
          editDraft={editDraft}
          onEditDraftChange={setEditDraft}
          onSaveEdit={(messageId) => void saveEdit(messageId)}
          onCancelEdit={() => setEditingId(null)}
          onStartEdit={(messageId, text) => {
            setEditingId(messageId);
            setEditDraft(text);
          }}
          onDelete={(messageId) => void deleteMessage(messageId)}
        />
      </div>
      <div className="mt-3 flex shrink-0 gap-2 border-t border-zinc-800 pt-3">
        <Textarea
          placeholder="Write a message…"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          rows={2}
          maxLength={MESSAGE_BODY_MAX_LENGTH}
          disabled={replyBusy}
        />
        <Button type="button" disabled={replyBusy || !replyText.trim()} onClick={() => void sendReply()}>
          {replyBusy ? <Loader2 className="size-4 animate-spin" /> : "Send"}
        </Button>
      </div>
    </div>
  );
}
