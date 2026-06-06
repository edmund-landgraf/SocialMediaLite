import { ChevronDown, ChevronRight, ExternalLink, Loader2, Mail, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GoLiveButton } from "@/components/GoLiveButton";
import { MessageFolderBar, type FolderFilter } from "@/components/MessageFolderBar";
import {
  MessageThreadContextMenu,
  type MessageThreadContextMenuState,
} from "@/components/MessageThreadContextMenu";
import { MessageThreadBubbles } from "@/components/MessageThreadBubbles";
import { formatMessageWhen } from "@/lib/messageTime";
import { useFriendPresence } from "@/lib/liveChat";
import { apiJson } from "@/lib/api";
import {
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_SUBJECT_MAX_LENGTH,
  type MessageFolderDto,
  type RecipientSearchMode,
} from "@socialmedialite/shared";
import type { PublicUser } from "@/types";

type MessageAuthor = Pick<PublicUser, "id" | "username" | "displayName" | "profilePicUrl">;

type ThreadListItem = {
  id: string;
  subject: string;
  isThreadOwner: boolean;
  otherParticipant: PublicUser;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  folderId: string | null;
  trashedAt: string | null;
};

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

type RecipientResult = {
  user: MessageAuthor & { email?: string | null };
};

function popOutThread(threadId: string) {
  const url = `${window.location.origin}/messages/popout?thread=${encodeURIComponent(threadId)}`;
  window.open(url, `sml-thread-${threadId}`, "width=500,height=700,resizable=yes,scrollbars=yes");
}

function TinyAvatar(props: { user: Pick<PublicUser, "displayName" | "profilePicUrl">; size?: "sm" | "md" }) {
  const sz = props.size === "sm" ? "size-8" : "size-10";
  return (
    <div
      className={`${sz} shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-900/65 to-purple-950/65 ring-1 ring-zinc-800`}
    >
      {props.user.profilePicUrl ? (
        <img src={props.user.profilePicUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex size-full items-center justify-center bg-zinc-900/55 text-[10px] font-bold text-white/90">
          {props.user.displayName.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function MessagesPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, MessageItem[]>>({});
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyBusy, setReplyBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<RecipientSearchMode>("name");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientResults, setRecipientResults] = useState<RecipientResult[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientResult | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newBusy, setNewBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [folders, setFolders] = useState<MessageFolderDto[]>([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [dragThreadId, setDragThreadId] = useState<string | null>(null);
  const [threadContextMenu, setThreadContextMenu] = useState<MessageThreadContextMenuState>(null);

  const expandedFriendUsername =
    expandedId != null
      ? (threads.find((t) => t.id === expandedId)?.otherParticipant.username ?? null)
      : null;
  const { presence: livePresence } = useFriendPresence(expandedFriendUsername);

  const refreshInbox = useCallback(async () => {
    const [inbox, folderData] = await Promise.all([
      apiJson<{ threads: ThreadListItem[]; totalUnread: number }>("/api/messages/threads"),
      apiJson<{ unfiledCount: number; folders: MessageFolderDto[] }>("/api/messages/folders"),
    ]);
    setThreads(inbox.threads);
    setTotalUnread(inbox.totalUnread);
    setUnfiledCount(folderData.unfiledCount);
    setFolders(folderData.folders);
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingThreadId(threadId);
    try {
      const data = await apiJson<{ messages: MessageItem[] }>(`/api/messages/threads/${threadId}`);
      setThreadMessages((prev) => ({ ...prev, [threadId]: data.messages }));
      await apiJson(`/api/messages/threads/${threadId}/read`, { method: "POST" });
      await refreshInbox();
    } finally {
      setLoadingThreadId(null);
    }
  }, [refreshInbox]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInbox(true);
      setError(null);
      try {
        const meResp = await apiJson<{ user: PublicUser }>("/api/me");
        if (cancelled) return;
        setMe(meResp.user);
        await refreshInbox();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed loading messages");
          nav("/login");
        }
      } finally {
        if (!cancelled) setLoadingInbox(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nav, refreshInbox]);

  useEffect(() => {
    document.title = totalUnread > 0 ? `Messages (${totalUnread})` : "Messages";
    return () => {
      document.title = "SocialMediaLite";
    };
  }, [totalUnread]);

  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (threadParam) {
      setExpandedId(threadParam);
      void loadThread(threadParam);
    }
  }, [searchParams, loadThread]);

  useEffect(() => {
    const to = searchParams.get("to")?.trim().toLowerCase();
    if (to) {
      setNewOpen(true);
      setRecipientQuery(to);
      setSearchMode("name");
    }
  }, [searchParams]);

  useEffect(() => {
    const to = searchParams.get("to")?.trim().toLowerCase();
    if (!to || selectedRecipient) return;
    const exact = recipientResults.find((r) => r.user.username === to);
    if (exact) {
      setSelectedRecipient(exact);
      setRecipientQuery(exact.user.displayName);
      setRecipientResults([]);
    }
  }, [searchParams, recipientResults, selectedRecipient]);

  useEffect(() => {
    if (!newOpen) return;
    const q = recipientQuery.trim();
    if (q.length < 1) {
      setRecipientResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void apiJson<{ recipients: RecipientResult[] }>(
        `/api/messages/recipients/search?q=${encodeURIComponent(q)}&mode=${searchMode}`,
      )
        .then((data) => setRecipientResults(data.recipients))
        .catch(() => setRecipientResults([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [newOpen, recipientQuery, searchMode]);

  async function toggleExpand(threadId: string) {
    if (expandedId === threadId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(threadId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("thread", threadId);
      next.delete("to");
      return next;
    });
    if (!threadMessages[threadId]) {
      await loadThread(threadId);
    } else {
      await apiJson(`/api/messages/threads/${threadId}/read`, { method: "POST" });
      await refreshInbox();
    }
  }

  async function sendReply(threadId: string) {
    const text = (replyText[threadId] ?? "").trim();
    if (!text) return;
    setReplyBusy(threadId);
    setError(null);
    try {
      const data = await apiJson<{ message: MessageItem }>(`/api/messages/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setThreadMessages((prev) => ({
        ...prev,
        [threadId]: [...(prev[threadId] ?? []), data.message],
      }));
      setReplyText((prev) => ({ ...prev, [threadId]: "" }));
      await refreshInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setReplyBusy(null);
    }
  }

  async function submitNewMessage() {
    if (!selectedRecipient) return;
    const subject = newSubject.trim();
    const text = newBody.trim();
    if (!subject || !text) return;
    setNewBusy(true);
    setError(null);
    try {
      const data = await apiJson<{
        thread: { id: string; subject: string; otherParticipant: PublicUser };
        message: MessageItem;
      }>("/api/messages/threads", {
        method: "POST",
        body: JSON.stringify({
          recipientUsername: selectedRecipient.user.username,
          subject,
          text,
        }),
      });
      await refreshInbox();
      setNewOpen(false);
      setSelectedRecipient(null);
      setNewSubject("");
      setNewBody("");
      setRecipientQuery("");
      setExpandedId(data.thread.id);
      setSearchParams({ thread: data.thread.id });
      await loadThread(data.thread.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create message");
    } finally {
      setNewBusy(false);
    }
  }

  async function saveEdit(threadId: string, messageId: string) {
    const text = editDraft.trim();
    if (!text) return;
    try {
      const data = await apiJson<{ message: MessageItem }>(
        `/api/messages/threads/${threadId}/messages/${messageId}`,
        { method: "PATCH", body: JSON.stringify({ text }) },
      );
      setThreadMessages((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).map((m) => (m.id === messageId ? data.message : m)),
      }));
      setEditingId(null);
      setEditDraft("");
      await refreshInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to edit");
    }
  }

  async function assignThreadFolder(threadId: string, folderId: string | null) {
    setError(null);
    try {
      await apiJson(`/api/messages/threads/${threadId}/folder`, {
        method: "PATCH",
        body: JSON.stringify({ folderId }),
      });
      await refreshInbox();
      if (folderFilter !== "all" && folderId !== folderFilter) {
        if (expandedId === threadId) setExpandedId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move thread");
    }
  }

  async function createFolder(name: string) {
    setError(null);
    await apiJson("/api/messages/folders", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await refreshInbox();
  }

  async function deleteFolder(folderId: string) {
    setError(null);
    await apiJson(`/api/messages/folders/${folderId}`, { method: "DELETE" });
    if (folderFilter === folderId) setFolderFilter("all");
    await refreshInbox();
  }

  const filteredThreads = threads.filter((t) => {
    if (folderFilter === "all") return t.folderId == null;
    return t.folderId === folderFilter;
  });

  async function deleteMessage(threadId: string, messageId: string) {
    if (!confirm("Remove this message?")) return;
    try {
      await apiJson(`/api/messages/threads/${threadId}/messages/${messageId}`, { method: "DELETE" });
      setThreadMessages((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).map((m) =>
          m.id === messageId
            ? { ...m, text: null, deletedAt: new Date().toISOString(), canEdit: false, canDelete: false }
            : m,
        ),
      }));
      await refreshInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (loadingInbox) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-3 p-6 text-zinc-300">
        <Loader2 className="size-5 animate-spin" />
        Loading messages…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="size-6 text-violet-300" aria-hidden />
          <h1 className="text-2xl font-bold text-white">Messages</h1>
          {totalUnread > 0 ? (
            <span className="rounded-full bg-violet-900/80 px-2 py-0.5 text-xs font-semibold text-violet-100">
              {totalUnread}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            New message
          </Button>
          {me ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/${me.username}`}>My profile</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link to="/friends">Browse users</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/settings">Settings</Link>
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-md bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div> : null}

      <MessageFolderBar
        unfiledCount={unfiledCount}
        folders={folders}
        selected={folderFilter}
        onSelect={setFolderFilter}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
        onAssignThread={assignThreadFolder}
        dragThreadId={dragThreadId}
        onDragThreadIdChange={setDragThreadId}
      />

      <MessageThreadContextMenu
        state={threadContextMenu}
        folders={folders}
        currentFolderId={
          threadContextMenu
            ? (threads.find((t) => t.id === threadContextMenu.threadId)?.folderId ?? null)
            : null
        }
        onMove={assignThreadFolder}
        onClose={() => setThreadContextMenu(null)}
      />

      {threads.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>No conversations yet. Message an accepted friend to start.</CardDescription>
          </CardHeader>
        </Card>
      ) : filteredThreads.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>
              {folderFilter === "all"
                ? "No unfiled conversations."
                : folders.find((f) => f.id === folderFilter)?.kind === "TRASH"
                  ? "Trash is empty. Drag a conversation here to delete it."
                  : "No conversations in this folder. Drag a thread here or pick another folder."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredThreads.map((thread) => {
            const expanded = expandedId === thread.id;
            const messages = threadMessages[thread.id] ?? [];
            return (
              <Card
                key={thread.id}
                data-thread-id={thread.id}
                className={[
                  "overflow-hidden border-zinc-800",
                  dragThreadId === thread.id ? "opacity-50" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  draggable
                  className="flex w-full cursor-grab items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900/50 active:cursor-grabbing"
                  onClick={() => void toggleExpand(thread.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setThreadContextMenu({ threadId: thread.id, x: e.clientX, y: e.clientY });
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/thread-id", thread.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragThreadId(thread.id);
                  }}
                  onDragEnd={() => setDragThreadId(null)}
                >
                  {expanded ? (
                    <ChevronDown className="size-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-zinc-500" />
                  )}
                  <TinyAvatar user={thread.otherParticipant} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-white">{thread.otherParticipant.displayName}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="truncate text-sm text-violet-200">{thread.subject}</span>
                      {thread.unreadCount > 0 ? (
                        <span className="rounded-full bg-amber-900/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">
                          {thread.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    {thread.lastMessagePreview ? (
                      <p className="truncate text-xs text-zinc-500">{thread.lastMessagePreview}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-600">{formatMessageWhen(thread.lastMessageAt)}</span>
                </button>

                {expanded ? (
                  <CardContent className="space-y-3 border-t border-zinc-800 bg-zinc-950/40 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <p className="text-xs text-zinc-500">
                        Live chat archives into this thread when the session ends.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-8"
                          onClick={() => popOutThread(thread.id)}
                        >
                          <ExternalLink className="size-3.5" />
                          Pop out
                        </Button>
                        <GoLiveButton
                          canGoLive={livePresence.canGoLive}
                          onGoLive={() => {
                            /* LiveChatModal + POST /api/messages/live/sessions — see go-live-im.plan.md */
                          }}
                        />
                      </div>
                    </div>
                    {loadingThreadId === thread.id && messages.length === 0 ? (
                      <div className="flex justify-center py-6 text-zinc-500">
                        <Loader2 className="size-5 animate-spin" />
                      </div>
                    ) : (
                      <div className="max-h-[min(50vh,420px)] overflow-y-auto rounded-lg bg-zinc-950/50 px-2 py-3 pr-1">
                        {me ? (
                          <MessageThreadBubbles
                            messages={messages}
                            viewerId={me.id}
                            editingId={editingId}
                            editDraft={editDraft}
                            onEditDraftChange={setEditDraft}
                            onSaveEdit={(messageId) => void saveEdit(thread.id, messageId)}
                            onCancelEdit={() => setEditingId(null)}
                            onStartEdit={(messageId, text) => {
                              setEditingId(messageId);
                              setEditDraft(text);
                            }}
                            onDelete={(messageId) => void deleteMessage(thread.id, messageId)}
                          />
                        ) : null}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Write a message…"
                        value={replyText[thread.id] ?? ""}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [thread.id]: e.target.value }))}
                        rows={2}
                        maxLength={MESSAGE_BODY_MAX_LENGTH}
                        disabled={replyBusy === thread.id}
                      />
                      <Button
                        type="button"
                        disabled={replyBusy === thread.id || !(replyText[thread.id] ?? "").trim()}
                        onClick={() => void sendReply(thread.id)}
                      >
                        {replyBusy === thread.id ? <Loader2 className="size-4 animate-spin" /> : "Send"}
                      </Button>
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {newOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New message"
          onClick={() => !newBusy && setNewOpen(false)}
        >
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <div className="text-lg font-semibold text-white">New message</div>
                <CardDescription>Friends only. Same subject with same friend continues the thread silently.</CardDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setNewOpen(false)}>
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900/80 p-0.5">
                <button
                  type="button"
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    searchMode === "name" ? "bg-violet-900/80 text-violet-100" : "text-zinc-400",
                  ].join(" ")}
                  onClick={() => setSearchMode("name")}
                >
                  By name
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    searchMode === "email" ? "bg-violet-900/80 text-violet-100" : "text-zinc-400",
                  ].join(" ")}
                  onClick={() => setSearchMode("email")}
                >
                  By email
                </button>
              </div>
              <Input
                placeholder={searchMode === "name" ? "Search display name or username…" : "Search friend email…"}
                value={recipientQuery}
                onChange={(e) => {
                  setRecipientQuery(e.target.value);
                  setSelectedRecipient(null);
                }}
              />
              {recipientResults.length > 0 && !selectedRecipient ? (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-800">
                  {recipientResults.map((row) => (
                    <button
                      key={row.user.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-900"
                      onClick={() => {
                        setSelectedRecipient(row);
                        setRecipientQuery(row.user.displayName);
                        setRecipientResults([]);
                      }}
                    >
                      <TinyAvatar user={row.user} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{row.user.displayName}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          @{row.user.username}
                          {searchMode === "email" && row.user.email ? ` · ${row.user.email}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedRecipient ? (
                <p className="text-xs text-zinc-500">
                  To: <span className="text-zinc-300">{selectedRecipient.user.displayName}</span>
                </p>
              ) : null}
              <div>
                <Input
                  placeholder="Subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  maxLength={MESSAGE_SUBJECT_MAX_LENGTH}
                />
                <p className="mt-1 text-right text-[10px] text-zinc-600">
                  {newSubject.length}/{MESSAGE_SUBJECT_MAX_LENGTH}
                </p>
              </div>
              <Textarea
                placeholder="Message"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
                maxLength={MESSAGE_BODY_MAX_LENGTH}
              />
              <Button
                type="button"
                className="w-full"
                disabled={newBusy || !selectedRecipient || !newSubject.trim() || !newBody.trim()}
                onClick={() => void submitNewMessage()}
              >
                {newBusy ? <Loader2 className="size-4 animate-spin" /> : "Send"}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
