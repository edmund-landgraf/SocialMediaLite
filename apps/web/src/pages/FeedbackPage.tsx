import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CommentThread } from "@/components/CommentThread";
import { FeedbackIdentityModal } from "@/components/FeedbackIdentityModal";
import { apiJson } from "@/lib/api";
import {
  clearFeedbackIdentity,
  consumeFeedbackFacebookPending,
  feedbackIdentityLabel,
  getFeedbackIdentity,
  setFeedbackIdentity,
  type FeedbackIdentity,
} from "@/lib/feedbackIdentity";
import type { PostAuthor, PublicUser } from "@/types";

type FeedbackItemDTO = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  commentCount: number;
};

type FeedbackListResp = {
  items: FeedbackItemDTO[];
};

type FeedbackLocationState = {
  requireIdentityPick?: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FeedbackForm(props: {
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
  captchaQuestion?: string | null;
  onRefreshCaptcha?: () => void;
  onSubmit: (title: string, body: string, captchaAnswer?: number) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(props.initialTitle ?? "");
  const [body, setBody] = useState(props.initialBody ?? "");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCaptcha = props.captchaQuestion != null;

  async function submit() {
    if (!title.trim() || !body.trim() || busy) return;
    if (needsCaptcha && !captchaAnswer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parsedCaptcha = needsCaptcha ? Number(captchaAnswer.trim()) : undefined;
      if (needsCaptcha && !Number.isInteger(parsedCaptcha)) {
        setError("Enter the captcha answer as a whole number.");
        return;
      }
      await props.onSubmit(title.trim(), body.trim(), parsedCaptcha);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      if (needsCaptcha) {
        setCaptchaAnswer("");
        props.onRefreshCaptcha?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-zinc-800">
      <CardContent className="space-y-3 pt-6">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="Title"
          maxLength={200}
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 8000))}
          placeholder="Describe your feedback or suggestion…"
          rows={5}
          maxLength={8000}
        />
        {needsCaptcha ? (
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="feedback-captcha" className="text-xs text-zinc-400">
                {props.captchaQuestion}
              </label>
              {props.onRefreshCaptcha ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={props.onRefreshCaptcha}>
                  New question
                </Button>
              ) : null}
            </div>
            <Input
              id="feedback-captcha"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value.replace(/[^\d-]/g, "").slice(0, 4))}
              placeholder="Your answer"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || !title.trim() || !body.trim() || (needsCaptcha && !captchaAnswer.trim())}
            onClick={() => void submit()}
          >
            {props.submitLabel}
          </Button>
          {props.onCancel ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={props.onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
        {error ? <div className="text-sm text-red-200">{error}</div> : null}
      </CardContent>
    </Card>
  );
}

function FeedbackCard(props: {
  item: FeedbackItemDTO;
  viewerId: string | null;
  onUpdated: () => void;
  onRequestLogin?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const isAuthor = props.viewerId === props.item.authorId;

  async function saveEdit(title: string, body: string) {
    await apiJson(`/api/feedback/${props.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title, body }),
    });
    setEditing(false);
    props.onUpdated();
  }

  return (
    <Card className="border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg text-zinc-100">{props.item.title}</CardTitle>
            <div className="mt-1 text-xs text-zinc-500">
              {props.item.author.displayName} · {formatDate(props.item.createdAt)}
            </div>
          </div>
          {isAuthor ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close edit" : "Edit"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <FeedbackForm
            initialTitle={props.item.title}
            initialBody={props.item.body}
            submitLabel="Save changes"
            onSubmit={saveEdit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{props.item.body}</p>
        )}

        <div className="flex items-center gap-2 border-t border-zinc-900 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setCommentsOpen((v) => !v)}>
            {commentsOpen ? "Hide comments" : "Comments"}
            {props.item.commentCount > 0 ? ` (${props.item.commentCount})` : null}
          </Button>
        </div>

        {commentsOpen ? (
          <CommentThread
            embedded
            readOnly={!props.viewerId}
            commentsUrl={`/api/feedback/${props.item.id}/comments`}
            heading="Discussion"
            onRequestLogin={props.onRequestLogin}
            onChanged={() => {
              props.onUpdated();
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FeedbackPage() {
  const nav = useNavigate();
  const location = useLocation();
  const locationState = (location.state ?? {}) as FeedbackLocationState;

  const [identity, setIdentity] = useState<FeedbackIdentity | null>(() => getFeedbackIdentity());
  const [me, setMe] = useState<PublicUser | null>(null);
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [items, setItems] = useState<FeedbackItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [captchaQuestion, setCaptchaQuestion] = useState<string | null>(null);

  const loadCaptcha = useCallback(async () => {
    const resp = await apiJson<{ question: string }>("/api/feedback/captcha");
    setCaptchaQuestion(resp.question);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listResp = await apiJson<FeedbackListResp>("/api/feedback");
      setItems(listResp.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyIdentity = useCallback((next: FeedbackIdentity, user: PublicUser | null) => {
    setIdentity(next);
    setMe(user);
    setIdentityModalOpen(false);
    setComposeOpen(false);
    setCaptchaQuestion(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (locationState.requireIdentityPick) {
      clearFeedbackIdentity();
      setIdentity(null);
      setMe(null);
      setIdentityModalOpen(true);
      nav(location.pathname, { replace: true, state: null });
      return;
    }

    void (async () => {
      const stored = getFeedbackIdentity();
      if (stored) {
        setIdentity(stored);
        if (stored.mode === "authenticated") {
          try {
            const meResp = await apiJson<{ user: PublicUser }>("/api/me");
            setMe(meResp.user);
          } catch {
            clearFeedbackIdentity();
            setIdentity(null);
            setMe(null);
            setIdentityModalOpen(true);
          }
        } else {
          setMe(null);
        }
        return;
      }

      if (consumeFeedbackFacebookPending()) {
        try {
          const meResp = await apiJson<{ user: PublicUser }>("/api/me");
          const next: FeedbackIdentity = {
            mode: "authenticated",
            userId: meResp.user.id,
            displayName: meResp.user.displayName,
            username: meResp.user.username,
          };
          setFeedbackIdentity(next);
          applyIdentity(next, meResp.user);
          return;
        } catch {
          // Fall through to identity modal.
        }
      }

      setIdentityModalOpen(true);
    })();
  }, [applyIdentity, location.pathname, locationState.requireIdentityPick, nav]);

  async function createFeedback(title: string, body: string, captchaAnswer?: number) {
    await apiJson("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ title, body, captchaAnswer }),
    });
    setComposeOpen(false);
    setCaptchaQuestion(null);
    await load();
  }

  function startCompose() {
    if (!identity || identity.mode === "anonymous") {
      setIdentityModalOpen(true);
      return;
    }
    setComposeOpen(true);
    void loadCaptcha();
  }

  const viewerId = identity?.mode === "authenticated" ? me?.id ?? identity.userId : null;

  return (
    <div className="mx-auto min-h-full max-w-2xl px-5 py-8">
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-zinc-800/70 pb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Feedback &amp; Suggestions</h1>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            Share ideas, report issues, and discuss with the community.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {identity ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 max-w-[12rem] truncate px-3 text-xs"
              title="Switch identity"
              onClick={() => setIdentityModalOpen(true)}
            >
              {feedbackIdentityLabel(identity)}
              {identity.mode === "authenticated" ? (
                <span className="ml-1 text-zinc-500">@{identity.username}</span>
              ) : null}
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs">
            <Link to="/login">Back to login</Link>
          </Button>
        </div>
      </header>

      {identity && identity.mode !== "anonymous" ? (
        <div className="mb-6">
          {composeOpen ? (
            <FeedbackForm
              submitLabel="Post feedback"
              captchaQuestion={captchaQuestion}
              onRefreshCaptcha={() => void loadCaptcha()}
              onSubmit={createFeedback}
              onCancel={() => {
                setComposeOpen(false);
                setCaptchaQuestion(null);
              }}
            />
          ) : (
            <Button onClick={startCompose}>Add new feedback</Button>
          )}
        </div>
      ) : identity?.mode === "anonymous" ? (
        <div className="mb-6 space-y-2">
          <p className="text-sm text-zinc-500">Browsing as anonymous — read-only.</p>
          <Button variant="outline" size="sm" onClick={() => setIdentityModalOpen(true)}>
            Log in to post or comment
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" />
          Loading…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</div>
      ) : null}

      <div className="space-y-4">
        {!loading && !error && items.length === 0 ? (
          <p className="text-sm text-zinc-500">No feedback yet. Be the first to add one.</p>
        ) : null}
        {items.map((item) => (
          <FeedbackCard
            key={item.id}
            item={item}
            viewerId={viewerId}
            onUpdated={() => void load()}
            onRequestLogin={() => setIdentityModalOpen(true)}
          />
        ))}
      </div>

      <FeedbackIdentityModal
        open={identityModalOpen}
        onComplete={(next, user) => {
          applyIdentity(next, user);
        }}
      />
    </div>
  );
}
