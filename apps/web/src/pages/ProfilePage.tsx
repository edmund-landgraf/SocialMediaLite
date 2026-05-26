import { Loader2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  TEXT_POST_BG_DEFAULT,
  TEXT_POST_COLOR_DEFAULT,
  TEXT_POST_FONT_SIZE_DEFAULT,
  TEXT_POST_FONT_SIZE_MAX,
  TEXT_POST_FONT_SIZE_MIN,
  type PostReactionKind,
} from "@socialmedialite/shared";
import { Button } from "@/components/ui/button";
import { PostReactionPicker } from "@/components/PostReactionPicker";
import { CommentThread } from "@/components/CommentThread";
import { BannerPositionEditor, bannerObjectPositionStyle } from "@/components/BannerPositionEditor";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch, apiJson } from "@/lib/api";
import type { FriendsFeedBucket, FriendsFeedMeta, PostDTO, ProfileMeta, PublicUser } from "@/types";

type MeResp = {
  user: PublicUser & { bannerUrl?: string | null };
};

type ProfileResp = {
  user: PublicUser & { bannerUrl?: string | null };
  meta: ProfileMeta;
};

type FriendsResp = {
  friends: PublicUser[];
};

type ImageSizePreset = "small" | "med" | "large" | "orig";
const IMAGE_SIZE_ORDER: ImageSizePreset[] = ["small", "med", "large", "orig"];

function nextImageSize(current: ImageSizePreset): ImageSizePreset {
  const idx = IMAGE_SIZE_ORDER.indexOf(current);
  return IMAGE_SIZE_ORDER[(idx + 1) % IMAGE_SIZE_ORDER.length] ?? "small";
}

function readStoredSize(key: string, fallback: ImageSizePreset): ImageSizePreset {
  const raw = localStorage.getItem(key);
  if (raw === "small" || raw === "med" || raw === "large" || raw === "orig") return raw;
  return fallback;
}

function textPostHasStyle(post: PostDTO): boolean {
  return (
    post.type === "TEXT" &&
    (post.textBackgroundColor != null || post.textColor != null || post.textFontSize != null)
  );
}

function textPostInlineStyle(post: PostDTO): CSSProperties | undefined {
  if (!textPostHasStyle(post)) return undefined;
  return {
    backgroundColor: post.textBackgroundColor ?? TEXT_POST_BG_DEFAULT,
    color: post.textColor ?? TEXT_POST_COLOR_DEFAULT,
    fontSize: `${post.textFontSize ?? TEXT_POST_FONT_SIZE_DEFAULT}px`,
  };
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function linkDisplayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/** Hover popup cap — longer than the 2-line preview; aligned with API link description max. */
const LINK_DESCRIPTION_POPUP_MAX = 840;

function linkDescriptionPopupText(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length <= LINK_DESCRIPTION_POPUP_MAX) return trimmed;
  return `${trimmed.slice(0, LINK_DESCRIPTION_POPUP_MAX - 1)}…`;
}

/** Two-line preview only; full summary lives in the native `title` tooltip (not in the card). */
function LinkPreviewDescription(props: { description: string; compact?: boolean }) {
  const trimmed = props.description.trim();
  const tooltipText = linkDescriptionPopupText(trimmed);
  const showTooltip = trimmed.length > 0;

  return (
    <span
      className={[
        "line-clamp-2 overflow-hidden text-zinc-400",
        props.compact ? "text-[11px] leading-relaxed" : "text-xs leading-relaxed",
        showTooltip ? "cursor-help underline decoration-zinc-700 decoration-dotted underline-offset-2" : "",
      ].join(" ")}
      title={showTooltip ? tooltipText : undefined}
    >
      {props.description}
    </span>
  );
}

/** Social-style link card: fixed hero slot (476×248 server crop for stored posts; composer may use remote OG URL). */
function SharedLinkEmbed(props: {
  href: string;
  hostname: string;
  title: string;
  description?: string | null;
  heroUrl?: string | null;
  compact?: boolean;
}) {
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    setHeroBroken(false);
  }, [props.heroUrl]);

  const pad = props.compact ? "p-2.5" : "p-3";

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/50">
      <div className="flex flex-col sm:flex-row">
        <a
          href={props.href}
          target="_blank"
          rel="noopener noreferrer"
          className="relative h-[124px] w-full shrink-0 overflow-hidden bg-zinc-900 sm:h-[124px] sm:w-[238px] sm:rounded-l-lg"
        >
          {props.heroUrl && !heroBroken ? (
            <img
              src={props.heroUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-full object-cover"
              onError={() => setHeroBroken(true)}
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] font-medium uppercase tracking-wide text-zinc-600">
              No preview image
              <span className="font-normal lowercase tracking-normal text-zinc-700">476×248 frame</span>
            </div>
          )}
        </a>
        <div className={`min-w-0 flex-1 ${pad} flex flex-col justify-center gap-1`}>
          <a
            href={props.href}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 text-inherit no-underline hover:text-zinc-50"
          >
            <div
              className={[
                "font-semibold uppercase tracking-wider text-zinc-500",
                props.compact ? "text-[9px]" : "text-[10px]",
              ].join(" ")}
            >
              {props.hostname}
            </div>
            <div
              className={[
                "line-clamp-2 overflow-hidden font-semibold text-zinc-100",
                props.compact ? "text-[13px] leading-snug" : "text-sm leading-snug",
              ].join(" ")}
            >
              {props.title}
            </div>
          </a>
          {props.description?.trim() ? (
            <LinkPreviewDescription description={props.description} compact={props.compact} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function multipart(path: string, form: FormData) {
  const res = await apiFetch(path, {
    method: "POST",
    body: form,
  });
  const txt = await res.text();
  let json: unknown = null;
  if (txt) {
    try {
      json = JSON.parse(txt);
    } catch {
      json = txt;
    }
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" &&
      json &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "string"
        ? ((json as { error: string }).error as string)
        : `Upload failed (${res.status})`;
    throw new ApiError(msg, res.status, json);
  }
  return json;
}

async function multipartPatchBanner(file: File) {
  const form = new FormData();
  form.append("banner", file);
  const res = await apiFetch("/api/me/banner", {
    method: "PATCH",
    body: form,
  });
  const txt = await res.text();
  let json: unknown = null;
  if (txt) {
    try {
      json = JSON.parse(txt);
    } catch {
      json = txt;
    }
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" &&
      json &&
      "error" in json &&
      typeof (json as { error?: unknown }).error === "string"
        ? ((json as { error: string }).error as string)
        : `Upload failed (${res.status})`;
    throw new ApiError(msg, res.status, json);
  }
  return json as { user: PublicUser & { bannerUrl?: string | null } };
}

function AvatarFrame(props: { label: string; sizeClass?: string; ring?: boolean; imageUrl?: string | null }) {
  return (
    <div
      aria-label={`${props.label}, profile photo (stub)`}
      className={[
        "relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-900/65 to-purple-950/65",
        props.ring ? "ring-[3px] ring-zinc-800" : "",
        props.sizeClass ?? "size-[96px]",
      ].join(" ")}
      title="Facebook profile pictures are stubbed in Phase 1"
    >
      {props.imageUrl ? (
        <img src={props.imageUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/55 text-[11px] font-bold tracking-wide text-white/90 drop-shadow-sm">
          FB
        </div>
      )}
    </div>
  );
}

function PostCard(props: {
  post: PostDTO;
  canModeratePins: boolean;
  canModerateDeletes: boolean;
  canEditCaption: boolean;
  canShareToFriendsFeed: boolean;
  canReact: boolean;
  showFeedSource: boolean;
  showFriendsFeedReview?: boolean;
  friendsFeedReviewBusy?: boolean;
  onFriendsFeedReview?: (action: "read" | "save" | "discard") => void;
  onChanged: () => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [photoSize, setPhotoSize] = useState<ImageSizePreset>("large");
  const [sizeLabelVisible, setSizeLabelVisible] = useState(false);
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const sizeLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const busy = false;
  const photoCaption = props.post.photoCaption ?? (props.post.type === "PHOTO" ? props.post.text : null);

  useEffect(() => {
    if (props.post.type !== "PHOTO") return;
    setPhotoSize(readStoredSize(`sml.photoSize:${props.post.id}`, "large"));
  }, [props.post.id, props.post.type]);

  useEffect(() => {
    setCaptionDraft((photoCaption ?? "").slice(0, 80));
    setCaptionEditing(false);
    setCaptionError(null);
  }, [photoCaption, props.post.id]);

  useEffect(() => {
    return () => {
      if (sizeLabelTimer.current) clearTimeout(sizeLabelTimer.current);
    };
  }, []);

  const photoSizeClass =
    photoSize === "small"
      ? "max-w-[280px]"
      : photoSize === "med"
        ? "max-w-[420px]"
        : photoSize === "large"
          ? "max-w-[640px]"
          : "w-full max-w-[2048px]";

  function cyclePhotoSize() {
    const next = nextImageSize(photoSize);
    setPhotoSize(next);
    localStorage.setItem(`sml.photoSize:${props.post.id}`, next);
    setSizeLabelVisible(true);
    if (sizeLabelTimer.current) clearTimeout(sizeLabelTimer.current);
    sizeLabelTimer.current = setTimeout(() => setSizeLabelVisible(false), 1100);
  }

  async function setPinned(next: boolean) {
    await apiJson(`/api/posts/${props.post.id}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned: next }),
    });
    props.onChanged();
  }

  async function setFriendsFeedShare(shared: boolean) {
    setShareBusy(true);
    try {
      await apiJson(`/api/posts/${props.post.id}/friends-feed-share`, {
        method: "POST",
        body: JSON.stringify({ shared }),
      });
      props.onChanged();
    } finally {
      setShareBusy(false);
    }
  }

  async function del() {
    if (!confirm("Delete this post?")) return;
    await apiJson(`/api/posts/${props.post.id}`, { method: "DELETE" });
    props.onChanged();
  }

  async function saveCaption() {
    if (props.post.type !== "PHOTO") return;
    setCaptionBusy(true);
    setCaptionError(null);
    try {
      await apiJson(`/api/posts/${props.post.id}/photo-caption`, {
        method: "PATCH",
        body: JSON.stringify({ caption: captionDraft }),
      });
      setCaptionEditing(false);
      props.onChanged();
    } catch (e) {
      setCaptionError(e instanceof Error ? e.message : "Failed saving caption");
    } finally {
      setCaptionBusy(false);
    }
  }

  async function pickReaction(kind: PostReactionKind, options?: { details?: string }) {
    await apiJson(`/api/posts/${props.post.id}/reaction`, {
      method: "POST",
      body: JSON.stringify({ kind, ...(options?.details ? { details: options.details } : {}) }),
    });
    props.onChanged();
  }

  return (
    <Card className={props.post.isPinned ? "border-blue-900/50" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <AvatarFrame
              label={props.post.author.displayName}
              imageUrl={props.post.author.profilePicUrl}
              sizeClass="size-10"
              ring
            />
            <div className="min-w-0">
              <Link
                to={`/${props.post.author.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[15px] font-semibold text-zinc-100 hover:text-zinc-50 hover:underline"
              >
                {props.post.author.displayName}
              </Link>
              <div className="text-xs text-zinc-500">{formatTime(props.post.createdAt)}</div>
              {props.showFeedSource && props.post.profileOwner ? (
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  From{" "}
                  <Link to={`/${props.post.profileOwner.username}`} className="font-semibold text-zinc-400 hover:text-zinc-200">
                    @{props.post.profileOwner.username}
                  </Link>
                  &apos;s page
                </div>
              ) : null}
              {props.post.isPinned ? (
                <div className="mt-1 inline-flex rounded-full bg-blue-950/40 px-2 py-0.5 text-[11px] font-semibold text-blue-200">
                  Pinned
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {props.canModeratePins ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void setPinned(!props.post.isPinned)}
              >
                {props.post.isPinned ? "Unpin" : "Pin"}
              </Button>
            ) : null}
            {props.canModerateDeletes ? (
              <Button variant="ghost" size="sm" onClick={() => void del()}>
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.post.type === "TEXT" && props.post.text ? (
          <div
            className={[
              "whitespace-pre-wrap leading-relaxed",
              textPostHasStyle(props.post) ? "rounded-lg px-3 py-2" : "text-sm text-zinc-200",
            ].join(" ")}
            style={textPostInlineStyle(props.post)}
          >
            {props.post.text}
          </div>
        ) : props.post.type === "VIDEO_LINK" && props.post.text ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{props.post.text}</div>
        ) : null}

        {props.post.type === "VIDEO_LINK" && props.post.videoUrl ? (
          <SharedLinkEmbed
            href={props.post.videoUrl}
            hostname={linkDisplayHost(props.post.videoUrl)}
            title={props.post.linkTitle ?? linkDisplayHost(props.post.videoUrl)}
            description={props.post.linkDescription}
            heroUrl={props.post.linkPreviewUrl ?? undefined}
          />
        ) : null}

        {props.post.type === "PHOTO" && props.post.photoUrl ? (
          <div className="space-y-2">
            {captionEditing ? (
              <div className="rounded-lg border border-zinc-900 bg-zinc-950/60 p-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value.slice(0, 80))}
                    maxLength={80}
                    placeholder="Caption (optional)"
                    className="h-8 text-xs"
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" disabled={captionBusy} onClick={() => void saveCaption()}>
                      OK
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={captionBusy}
                      onClick={() => {
                        setCaptionDraft((photoCaption ?? "").slice(0, 80));
                        setCaptionEditing(false);
                        setCaptionError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
                <div className="mt-1 text-right text-[10px] text-zinc-500">{captionDraft.length}/80</div>
                {captionError ? <div className="mt-1 text-xs text-red-200">{captionError}</div> : null}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-h-5 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                  {photoCaption || (props.canEditCaption ? <span className="text-zinc-500">No caption</span> : null)}
                </div>
                {props.canEditCaption ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setCaptionEditing(true)}>
                    Edit caption
                  </Button>
                ) : null}
              </div>
            )}
            <button
              type="button"
              className={`group relative block w-full ${photoSizeClass} cursor-zoom-in`}
              onClick={cyclePhotoSize}
              title="Click to cycle size: small / med / large / orig"
            >
              <img className="w-full rounded-lg border border-zinc-900 object-cover" src={props.post.photoUrl} alt="" />
              <span
                className={[
                  "absolute left-2 top-2 rounded-full bg-zinc-950/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 transition-opacity",
                  sizeLabelVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                ].join(" ")}
              >
                {photoSize}
              </span>
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-900 pt-3">
          {props.showFriendsFeedReview ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={props.friendsFeedReviewBusy}
                onClick={() => props.onFriendsFeedReview?.("read")}
              >
                Read
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={props.friendsFeedReviewBusy}
                onClick={() => props.onFriendsFeedReview?.("save")}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={props.friendsFeedReviewBusy}
                onClick={() => props.onFriendsFeedReview?.("discard")}
              >
                Discard
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setCommentsOpen((v) => !v)}>
                Comment {props.post._count.comments ? `(${props.post._count.comments})` : null}
              </Button>
              {props.canShareToFriendsFeed ? (
                props.post.sharedToFriendsFeed ? (
                  <>
                    <Button variant="secondary" size="sm" disabled>
                      Shared
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={shareBusy}
                      onClick={() => void setFriendsFeedShare(false)}
                    >
                      Unshare
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={shareBusy}
                    onClick={() => void setFriendsFeedShare(true)}
                  >
                    Share
                  </Button>
                )
              ) : null}
              {props.canReact ? (
                <PostReactionPicker
                  viewerReaction={(props.post.viewerReaction as PostReactionKind | null) ?? null}
                  reactionTotal={props.post.reactionTotal ?? 0}
                  onPick={pickReaction}
                />
              ) : null}
            </>
          )}
        </div>

        {!props.showFriendsFeedReview ? (
          <CommentThread
            commentsUrl={`/api/posts/${props.post.id}/comments`}
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            onChanged={() => props.onChanged()}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const nav = useNavigate();
  const { username } = useParams();

  const [me, setMe] = useState<(PublicUser & { bannerUrl?: string | null }) | null>(null);
  const [profile, setProfile] = useState<ProfileResp | null>(null);
  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [friendsFeedMeta, setFriendsFeedMeta] = useState<FriendsFeedMeta | null>(null);
  const [friendsFeedBucket, setFriendsFeedBucket] = useState<FriendsFeedBucket>("unread");
  const [friendsFeedReviewBusyId, setFriendsFeedReviewBusyId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<"my" | "friends">("my");
  const [friends, setFriends] = useState<PublicUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerPreviewOpen, setBannerPreviewOpen] = useState(false);
  const [bannerEditOpen, setBannerEditOpen] = useState(false);

  const name = useMemo(() => (username ?? "").trim().toLowerCase(), [username]);

  const refreshProfile = useCallback(async () => {
    if (!name) return;
    const p = await apiJson<ProfileResp>(`/api/users/${encodeURIComponent(name)}`);
    setProfile(p);
  }, [name]);

  const refreshPosts = useCallback(async () => {
    if (!name) return;
    const data = await apiJson<{ posts: PostDTO[] }>(`/api/users/${encodeURIComponent(name)}/posts`);
    setPosts(data.posts);
    setFriendsFeedMeta(null);
  }, [name]);

  const refreshFriendsFeed = useCallback(async (bucket: FriendsFeedBucket = friendsFeedBucket) => {
    if (!name) return;
    const data = await apiJson<{ posts: PostDTO[]; meta: FriendsFeedMeta }>(
      `/api/users/${encodeURIComponent(name)}/friends-feed?bucket=${encodeURIComponent(bucket)}`,
    );
    setPosts(data.posts);
    setFriendsFeedMeta(data.meta);
  }, [name, friendsFeedBucket]);

  const reviewFriendsFeedPost = useCallback(
    async (postId: string, action: "read" | "save" | "discard") => {
      setFriendsFeedReviewBusyId(postId);
      try {
        await apiJson(`/api/posts/${postId}/friends-feed-review`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        await refreshFriendsFeed(friendsFeedBucket);
      } finally {
        setFriendsFeedReviewBusyId(null);
      }
    },
    [friendsFeedBucket, refreshFriendsFeed],
  );

  const refreshActiveFeed = useCallback(async () => {
    if (feedTab === "friends") return refreshFriendsFeed();
    return refreshPosts();
  }, [feedTab, refreshFriendsFeed, refreshPosts]);

  const bootstrap = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const m = await apiJson<MeResp>("/api/me");
      setMe(m.user);

      await refreshProfile();

      try {
        const f = await apiJson<FriendsResp>("/api/friends");
        setFriends(f.friends);
      } catch {
        setFriends([]);
      }

      // posts might be forbidden depending on friendship; try after profile
      try {
        if (feedTab === "friends" && m.user.username === name) {
          await refreshFriendsFeed();
        } else {
          await refreshPosts();
        }
      } catch (e) {
        const ae = ApiError.maybe(e);
        if (ae?.status === 403) setPosts([]);
        else if (ae) throw ae;
      }
    } catch (e) {
      const ae = ApiError.maybe(e);
      if (ae?.status === 401) {
        nav("/login");
        return;
      }
      setError(ae?.message ?? (e instanceof Error ? e.message : "Failed loading"));
      setFriends([]);
      setPosts(null);
    } finally {
      setLoading(false);
    }
  }, [name, nav, feedTab, refreshFriendsFeed, refreshPosts, refreshProfile]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!profile?.meta.isSelf || loading) return;
    if (feedTab === "friends") void refreshFriendsFeed(friendsFeedBucket).catch(() => undefined);
    else void refreshPosts().catch(() => undefined);
  }, [feedTab, friendsFeedBucket, profile?.meta.isSelf, loading, refreshFriendsFeed, refreshPosts]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    nav("/login");
  }

  const [composerText, setComposerText] = useState("");
  const [composerTextBg, setComposerTextBg] = useState(TEXT_POST_BG_DEFAULT);
  const [composerTextColor, setComposerTextColor] = useState(TEXT_POST_COLOR_DEFAULT);
  const [composerTextFontSize, setComposerTextFontSize] = useState(TEXT_POST_FONT_SIZE_DEFAULT);
  const [textComposerKey, setTextComposerKey] = useState(0);
  const [composerVideo, setComposerVideo] = useState("");
  const [composerPhotoCaption, setComposerPhotoCaption] = useState("");
  const [composerPhotoFile, setComposerPhotoFile] = useState<File | null>(null);
  const [composerPhotoPreviewUrl, setComposerPhotoPreviewUrl] = useState<string | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerTab, setComposerTab] = useState<"TEXT" | "PHOTO" | "VIDEO_LINK_VIDEO" | "VIDEO_LINK_WEB">("TEXT");
  const [composerErr, setComposerErr] = useState<string | null>(null);
  const [avatarSize, setAvatarSize] = useState<ImageSizePreset>("large");
  const [avatarSizeVisible, setAvatarSizeVisible] = useState(false);
  const avatarSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  type LinkComposerPreview = {
    hostname: string;
    title: string | null;
    description: string | null;
    remoteImageUrl: string | null;
  };
  const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [linkComposerPreview, setLinkComposerPreview] = useState<LinkComposerPreview | null>(null);

  useEffect(() => {
    if (composerTab !== "VIDEO_LINK_VIDEO" && composerTab !== "VIDEO_LINK_WEB") {
      setLinkComposerPreview(null);
      return;
    }
    const raw = composerVideo.trim();
    let acceptable = false;
    try {
      const u = new URL(raw);
      acceptable = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      acceptable = false;
    }
    if (!acceptable) {
      setLinkComposerPreview(null);
      return;
    }

    linkPreviewTimerRef.current && clearTimeout(linkPreviewTimerRef.current);
    linkPreviewTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const meta = await apiJson<LinkComposerPreview>("/api/link-preview", {
            method: "POST",
            body: JSON.stringify({ url: raw }),
          });
          setLinkComposerPreview(meta);
        } catch {
          setLinkComposerPreview(null);
        }
      })();
    }, 500);

    return () => {
      if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current);
    };
  }, [composerVideo, composerTab]);

  useEffect(() => {
    if (!composerPhotoFile) {
      setComposerPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(composerPhotoFile);
    setComposerPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [composerPhotoFile]);

  useEffect(() => {
    setAvatarSize(readStoredSize(`sml.avatarSize:${name}`, "large"));
  }, [name]);

  useEffect(() => {
    setBannerPreviewOpen(false);
    setBannerEditOpen(false);
  }, [name, profile?.user.bannerUrl]);

  useEffect(() => {
    if (!bannerPreviewOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setBannerPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bannerPreviewOpen]);

  useEffect(() => {
    return () => {
      if (avatarSizeTimerRef.current) clearTimeout(avatarSizeTimerRef.current);
    };
  }, []);

  const avatarSizeClass =
    avatarSize === "small"
      ? "size-16"
      : avatarSize === "med"
        ? "size-20"
        : avatarSize === "large"
          ? "size-[118px]"
          : "size-[160px]";

  function cycleAvatarSize() {
    const next = nextImageSize(avatarSize);
    setAvatarSize(next);
    localStorage.setItem(`sml.avatarSize:${name}`, next);
    setAvatarSizeVisible(true);
    if (avatarSizeTimerRef.current) clearTimeout(avatarSizeTimerRef.current);
    avatarSizeTimerRef.current = setTimeout(() => setAvatarSizeVisible(false), 1100);
  }

  function clearTextComposer() {
    setComposerText("");
    setComposerTextBg(TEXT_POST_BG_DEFAULT);
    setComposerTextColor(TEXT_POST_COLOR_DEFAULT);
    setComposerTextFontSize(TEXT_POST_FONT_SIZE_DEFAULT);
    setTextComposerKey((k) => k + 1);
  }

  async function createTextOrVideo(kind: "TEXT" | "VIDEO_LINK") {
    if (!profile?.meta.canViewContent) return;

    const owner = username?.trim().toLowerCase();
    if (!owner) return;
    setComposerBusy(true);
    setComposerErr(null);
    try {
      if (kind === "TEXT") {
        await apiJson(`/api/users/${encodeURIComponent(owner)}/posts`, {
          method: "POST",
          body: JSON.stringify({
            type: "TEXT",
            text: composerText,
            textBackgroundColor: composerTextBg,
            textColor: composerTextColor,
            textFontSize: composerTextFontSize,
          }),
        });
        clearTextComposer();
      } else {
        await apiJson(`/api/users/${encodeURIComponent(owner)}/posts`, {
          method: "POST",
          body: JSON.stringify({ type: "VIDEO_LINK", videoUrl: composerVideo, text: composerText || undefined }),
        });
        setComposerText("");
        setComposerVideo("");
      }

      await refreshActiveFeed();
    } catch (e) {
      setComposerErr(e instanceof Error ? e.message : "Failed creating post");
    } finally {
      setComposerBusy(false);
    }
  }

  function stagePhotoFromFile(file: File | null | undefined) {
    if (!file?.type.startsWith("image/")) return;
    setComposerPhotoFile(file);
    setComposerErr(null);
  }

  function stagePhoto(files: FileList | null) {
    stagePhotoFromFile(files?.item(0));
  }

  function handlePhotoPaste(e: ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (items?.length) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item?.type.startsWith("image/")) {
          e.preventDefault();
          stagePhotoFromFile(item.getAsFile());
          return;
        }
      }
    }

    const pasted = e.clipboardData?.files?.item(0);
    if (pasted?.type.startsWith("image/")) {
      e.preventDefault();
      stagePhotoFromFile(pasted);
    }
  }

  function clearStagedPhoto() {
    setComposerPhotoFile(null);
    setComposerPhotoCaption("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function createPhoto() {
    if (!composerPhotoFile) return;
    if (!profile?.meta.canViewContent) return;

    const owner = username?.trim().toLowerCase();
    if (!owner) return;

    setComposerBusy(true);
    setComposerErr(null);

    try {
      const fd = new FormData();
      fd.append("photo", composerPhotoFile);
      if (composerPhotoCaption.trim()) fd.append("caption", composerPhotoCaption.trim());
      await multipart(`/api/users/${encodeURIComponent(owner)}/posts`, fd);

      clearStagedPhoto();
      await refreshPosts();
    } catch (e) {
      setComposerErr(e instanceof Error ? e.message : "Failed uploading photo");
    } finally {
      setComposerBusy(false);
    }
  }

  async function bannerSelected(files: FileList | null) {
    const file = files?.item(0);
    if (!file) return;

    try {
      const result = await multipartPatchBanner(file);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                bannerUrl: result.user.bannerUrl,
                bannerImageKey: result.user.bannerImageKey ?? prev.user.bannerImageKey,
                bannerPositionX: result.user.bannerPositionX ?? 50,
                bannerPositionY: result.user.bannerPositionY ?? 50,
              },
            }
          : prev,
      );
      setMe((prev) =>
        prev
          ? {
              ...prev,
              bannerUrl: result.user.bannerUrl,
              bannerImageKey: result.user.bannerImageKey ?? prev.bannerImageKey,
              bannerPositionX: result.user.bannerPositionX ?? 50,
              bannerPositionY: result.user.bannerPositionY ?? 50,
            }
          : prev,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Banner upload failed");
    }
  }

  async function saveBannerPosition(x: number, y: number) {
    const result = await apiJson<{ user: PublicUser & { bannerUrl?: string | null } }>("/api/me/banner-position", {
      method: "PATCH",
      body: JSON.stringify({ x, y }),
    });
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            user: {
              ...prev.user,
              bannerPositionX: result.user.bannerPositionX ?? x,
              bannerPositionY: result.user.bannerPositionY ?? y,
            },
          }
        : prev,
    );
    setMe((prev) =>
      prev
        ? {
            ...prev,
            bannerPositionX: result.user.bannerPositionX ?? x,
            bannerPositionY: result.user.bannerPositionY ?? y,
          }
        : prev,
    );
    setBannerEditOpen(false);
  }

  async function requestFriendships() {
    if (!profile) return;

    await apiJson("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ username: profile.user.username }),
    });
    await refreshProfile();
  }

  async function acceptFriendships() {
    if (!profile) return;

    await apiJson("/api/friends/accept", {
      method: "POST",
      body: JSON.stringify({ username: profile.user.username }),
    });
    await refreshProfile();

    await refreshPosts().catch(() => undefined);
    const f = await apiJson<FriendsResp>("/api/friends");
    setFriends(f.friends);
  }

  async function rejectFriendships() {
    if (!profile) return;

    await apiJson("/api/friends/reject", {
      method: "POST",
      body: JSON.stringify({ username: profile.user.username }),
    });
    await refreshProfile();

    await refreshPosts().catch(() => undefined);
    const f = await apiJson<FriendsResp>("/api/friends");
    setFriends(f.friends);
  }

  async function removeFriendship() {
    if (!profile) return;
    if (!confirm(`Remove ${profile.user.displayName} as a friend?`)) return;

    await apiJson("/api/friends/remove", {
      method: "POST",
      body: JSON.stringify({ username: profile.user.username }),
    });
    await refreshProfile();
    setPosts([]);
    const f = await apiJson<FriendsResp>("/api/friends");
    setFriends(f.friends);
  }

  const canComposer = Boolean(profile?.meta.canViewContent);

  const pageOwnerPins = Boolean(profile?.meta.isSelf);

  function canDeletePost(post: PostDTO): boolean {
    if (!profile) return false;
    if (profile.meta.isSelf) return true;
    return Boolean(me && post.authorId === me.id);
  }

  if (!name) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Missing username route.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-col gap-6 p-6 pb-28">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 text-zinc-300">
          <Loader2 className="animate-spin size-5" />
          Loading profile…
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-6 pb-28">
        <div className="text-sm font-semibold text-red-300">Could not load profile</div>
        <div className="text-xs text-red-100/75">{error ?? "Unexpected error"}</div>
        <Button asChild variant="secondary">
          <Link to="/login">Return to login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-28">
      <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">@{profile.user.username}</div>
            <div className="truncate text-[11px] text-zinc-500">logged in as {me?.username ? `@${me.username}` : "…"}</div>
          </div>
          <div className="flex items-center gap-2">
            {me?.username ? (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/${me.username}`}>My profile</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" size="sm">
              <Link to="/friends">Browse users</Link>
            </Button>
            <Button variant="outline" size="sm" title="later" disabled>
              Add to story
            </Button>
            <Button variant="secondary" size="sm" disabled title="later">
              Edit profile
            </Button>
            <Button variant="secondary" size="sm" title="later" disabled>
              More
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Banner — same width/margins as page content */}
      <div className="mx-auto max-w-5xl px-4">
        <div className="relative h-44 w-full overflow-hidden rounded-lg border border-zinc-900 bg-gradient-to-br from-blue-950/70 via-zinc-950 to-purple-950/40 md:h-60">
          {profile.meta.canViewContent && profile.user.bannerUrl ? (
            <button
              type="button"
              className="block h-full w-full cursor-zoom-in"
              onClick={() => setBannerPreviewOpen(true)}
              aria-label="View full banner image"
            >
              <img
                className="h-full w-full object-cover opacity-95"
                alt=""
                src={profile.user.bannerUrl}
                style={bannerObjectPositionStyle(profile.user.bannerPositionX, profile.user.bannerPositionY)}
              />
            </button>
          ) : null}

          {profile.meta.isSelf ? (
            <div className="absolute bottom-4 right-4 z-10 flex flex-wrap items-center justify-end gap-2">
              {profile.user.bannerUrl ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setBannerEditOpen(true)}>
                  Edit
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <label className="cursor-pointer px-4">
                  Banner photo
                  <input
                    className="hidden"
                    accept="image/*"
                    type="file"
                    onChange={(e) => void bannerSelected(e.target.files)}
                  />
                </label>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4">
        {/* Profile header — avatar overlaps banner; text column sets height, avatar pins to its bottom */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
            <div className="relative z-10 shrink-0 -mt-14 md:-mt-20">
              <button
                type="button"
                onClick={cycleAvatarSize}
                className="group relative block cursor-zoom-in"
                title="Click to cycle size: small / med / large / orig"
              >
                <AvatarFrame
                  label={profile.user.displayName}
                  imageUrl={profile.user.profilePicUrl}
                  sizeClass={avatarSizeClass}
                  ring
                />
                <span
                  className={[
                    "absolute left-1 top-1 rounded-full bg-zinc-950/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 transition-opacity",
                    avatarSizeVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                >
                  {avatarSize}
                </span>
              </button>
              <div className="mt-2 max-w-[180px] text-center text-[11px] leading-snug text-zinc-400 sm:hidden">
                <div className="truncate font-semibold text-zinc-300">{profile.user.displayName}</div>
                <div className="truncate">{profile.user.email ?? "email not available"}</div>
              </div>
            </div>

            <div className="relative z-10 min-w-0 flex-1 pb-1 sm:pt-6 md:pt-8">
              <div className="truncate text-[28px] font-bold leading-tight tracking-tight text-white md:text-[32px]">
                {profile.user.displayName}
              </div>

              <div className="mt-1 text-sm text-zinc-400">{friends?.length ?? 0} friends (phase 1 list)</div>

              <CardDescription className="mt-1.5 max-w-xl text-[12px] leading-snug text-zinc-300">
                {profile.meta.isSelf
                  ? "My feed is your wall. Friends feed shows posts friends marked Share."
                  : "Chronological profile timeline with one pinned post."}
              </CardDescription>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-zinc-300">
                <div className="inline-flex items-center gap-2 text-zinc-400">
                  Video posts are URLs only • Images are processed to ≤ ~500KB
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
            {!profile.meta.isSelf && profile.meta.canViewContent ? (
              <Button variant="secondary" disabled>
                Messenger (later)
              </Button>
            ) : null}

            {!profile.meta.isSelf ? (
              <Fragment>
                {profile.meta.friendshipStatus === "none" ? (
                  <Button onClick={() => void requestFriendships()}>Add friend</Button>
                ) : null}

                {profile.meta.friendshipStatus === "pending_out" ? (
                  <Button variant="secondary" disabled title="Awaiting acceptance">
                    Request sent
                  </Button>
                ) : null}

                {profile.meta.friendshipStatus === "pending_in" ? (
                  <>
                    <Button onClick={() => void acceptFriendships()}>Accept request</Button>
                    <Button variant="ghost" onClick={() => void rejectFriendships()}>
                      Reject
                    </Button>
                  </>
                ) : null}

                {profile.meta.friendshipStatus === "accepted" ? (
                  <Button variant="ghost" onClick={() => void removeFriendship()}>
                    Defriend
                  </Button>
                ) : null}
              </Fragment>
            ) : null}
          </div>
        </div>

        {!profile.meta.canViewContent ? (
          <Card className="mt-10">
            <CardHeader className="space-y-1">
              <div className="text-lg font-semibold text-white">This page is restricted</div>
              <CardDescription>
                Become friends with <span className="font-semibold text-zinc-200">@{profile.user.username}</span> to view
                their banner, timeline, composer, comments, etc.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void requestFriendships()}>Send friend request</Button>
                <Button asChild variant="secondary">
                  <Link to="/friends">Browse users</Link>
                </Button>
              </div>
              <FriendlyErrorMessage />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Composer — my feed / friend walls only */}
            {(feedTab === "my" || !profile.meta.isSelf) ? (
            <Card className="mt-6">
              <CardHeader className="space-y-1 pb-4">
                <div className="text-base font-semibold text-white">
                  Share on {profile.meta.isSelf ? "your timeline" : `this person's timeline`}
                </div>
                <CardDescription>Newest-first ordering; one pinned post for the page owner.</CardDescription>
              </CardHeader>
              <CardContent>
                {!canComposer ? (
                  <div className="text-sm text-zinc-400">You can't post here.</div>
                ) : (
                  <Tabs
                    value={composerTab}
                    onValueChange={(v) => setComposerTab(v as typeof composerTab)}
                  >
                    <TabsList className="w-full justify-between md:w-auto">
                      <TabsTrigger value="TEXT">Text</TabsTrigger>
                      <TabsTrigger value="PHOTO">Photo</TabsTrigger>
                      <TabsTrigger value="VIDEO_LINK_VIDEO">Video link</TabsTrigger>
                      <TabsTrigger value="VIDEO_LINK_WEB">Web link</TabsTrigger>
                    </TabsList>

                    <TabsContent value="TEXT">
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-400">
                          <label className="flex items-center gap-2">
                            <span className="shrink-0">Background</span>
                            <input
                              type="color"
                              value={composerTextBg}
                              disabled={composerBusy}
                              onChange={(e) => setComposerTextBg(e.target.value)}
                              aria-label="Text post background color"
                              className="size-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                          <label className="flex items-center gap-2">
                            <span className="shrink-0">Text color</span>
                            <input
                              type="color"
                              value={composerTextColor}
                              disabled={composerBusy}
                              onChange={(e) => setComposerTextColor(e.target.value)}
                              aria-label="Text post text color"
                              className="size-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                          <label className="flex min-w-[220px] flex-1 items-center gap-2">
                            <span className="shrink-0">
                              Font size ({composerTextFontSize}px)
                            </span>
                            <input
                              type="range"
                              min={TEXT_POST_FONT_SIZE_MIN}
                              max={TEXT_POST_FONT_SIZE_MAX}
                              value={composerTextFontSize}
                              disabled={composerBusy}
                              onChange={(e) => setComposerTextFontSize(Number(e.target.value))}
                              aria-label="Text post font size"
                              className="min-w-[100px] flex-1 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                        </div>
                        <Textarea
                          key={textComposerKey}
                          placeholder="Say something…"
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                          disabled={composerBusy}
                          className="min-h-[96px] leading-relaxed"
                          style={{
                            backgroundColor: composerTextBg,
                            color: composerTextColor,
                            fontSize: `${composerTextFontSize}px`,
                          }}
                        />
                        <Button
                          disabled={
                            composerBusy || !composerText.trim() || !profile.meta.canViewContent
                          }
                          onClick={() => void createTextOrVideo("TEXT")}
                        >
                          Post
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="PHOTO">
                      <div className="grid gap-2">
                        <div className="text-xs leading-relaxed text-zinc-500">
                          Paste an image from your clipboard or upload a file. Photos are compressed to roughly 500KB when
                          possible; otherwise you’ll get guidance to share a hosted link instead (Phase 2+).
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            placeholder="Paste image here (Ctrl+V)"
                            disabled={composerBusy}
                            onPaste={handlePhotoPaste}
                            aria-label="Paste photo from clipboard"
                            className="min-w-[200px] flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={composerBusy}
                            onClick={() => photoInputRef.current?.click()}
                          >
                            Upload
                          </Button>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            disabled={composerBusy}
                            className="hidden"
                            onChange={(e) => stagePhoto(e.target.files)}
                          />
                        </div>
                        {composerPhotoPreviewUrl ? (
                          <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              disabled={composerBusy}
                              onClick={clearStagedPhoto}
                              aria-label="Remove photo"
                              className="absolute right-3 top-3 z-10 size-8 bg-zinc-900/90 shadow-sm"
                            >
                              <X />
                            </Button>
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              Photo ready
                            </div>
                            <img
                              src={composerPhotoPreviewUrl}
                              alt=""
                              className="max-h-[260px] w-full rounded-md object-contain"
                            />
                          </div>
                        ) : null}
                        <Textarea
                          placeholder="Caption (optional)"
                          value={composerPhotoCaption}
                          onChange={(e) => setComposerPhotoCaption(e.target.value)}
                          className="min-h-[74px]"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={composerBusy || !composerPhotoFile || !profile.meta.canViewContent}
                            onClick={() => void createPhoto()}
                          >
                            OK
                          </Button>
                          {composerPhotoFile ? (
                            <Button type="button" variant="ghost" disabled={composerBusy} onClick={clearStagedPhoto}>
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="VIDEO_LINK_VIDEO">
                      <div className="grid gap-2">
                        <div className="text-xs leading-relaxed text-zinc-500">
                          Share a video page URL. A fixed preview card shows hero image and slug line when available.
                        </div>
                        <Input
                          value={composerVideo}
                          onChange={(e) => setComposerVideo(e.target.value)}
                          placeholder="https://youtube.com/…"
                          inputMode="url"
                        />
                        {linkComposerPreview && composerVideo.trim() ? (
                          <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-2">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              Preview (hero + slug)
                            </div>
                            <SharedLinkEmbed
                              href={composerVideo.trim()}
                              hostname={linkComposerPreview.hostname}
                              title={linkComposerPreview.title ?? linkComposerPreview.hostname}
                              description={linkComposerPreview.description}
                              heroUrl={linkComposerPreview.remoteImageUrl}
                              compact
                            />
                          </div>
                        ) : null}
                        <Textarea
                          placeholder="Optional message"
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                        />
                        <Button
                          disabled={composerBusy || !composerVideo.trim() || !profile.meta.canViewContent}
                          onClick={() => void createTextOrVideo("VIDEO_LINK")}
                        >
                          Post video link
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="VIDEO_LINK_WEB">
                      <div className="grid gap-2">
                        <div className="text-xs leading-relaxed text-zinc-500">
                          Share any web page URL. A fixed preview card shows hero image and slug line when available.
                        </div>
                        <Input
                          value={composerVideo}
                          onChange={(e) => setComposerVideo(e.target.value)}
                          placeholder="https://example.com/article"
                          inputMode="url"
                        />
                        {linkComposerPreview && composerVideo.trim() ? (
                          <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-2">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              Preview (hero + slug)
                            </div>
                            <SharedLinkEmbed
                              href={composerVideo.trim()}
                              hostname={linkComposerPreview.hostname}
                              title={linkComposerPreview.title ?? linkComposerPreview.hostname}
                              description={linkComposerPreview.description}
                              heroUrl={linkComposerPreview.remoteImageUrl}
                              compact
                            />
                          </div>
                        ) : null}
                        <Textarea
                          placeholder="Optional message"
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                        />
                        <Button
                          disabled={composerBusy || !composerVideo.trim() || !profile.meta.canViewContent}
                          onClick={() => void createTextOrVideo("VIDEO_LINK")}
                        >
                          Post web link
                        </Button>
                      </div>
                    </TabsContent>

                    {composerErr ? (
                      <div className="mt-3 rounded-md bg-red-950/40 px-3 py-2 text-xs text-red-100">
                        {composerErr}
                      </div>
                    ) : null}
                  </Tabs>
                )}
              </CardContent>
            </Card>
            ) : null}

            {/* Two column-ish layout */}
            <div className="mt-6 grid gap-6 pb-24 md:grid-cols-[1fr_320px]">
              <div className="space-y-5">
                {profile.meta.isSelf ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex gap-2">
                        <Button
                          variant={feedTab === "my" ? "default" : "secondary"}
                          size="sm"
                          onClick={() => setFeedTab("my")}
                        >
                          My feed
                        </Button>
                        <Button
                          variant={feedTab === "friends" ? "default" : "secondary"}
                          size="sm"
                          onClick={() => {
                            setFeedTab("friends");
                            setFriendsFeedBucket("unread");
                          }}
                        >
                          Friends feed
                        </Button>
                      </div>
                      {feedTab === "friends" && friendsFeedMeta ? (
                        <div className="text-[11px] text-zinc-500">
                          {friendsFeedMeta.counts.unread} unread · {friendsFeedMeta.counts.saved} saved
                        </div>
                      ) : null}
                    </div>
                    {feedTab === "friends" ? (
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["unread", "Unread"],
                            ["read", "Read"],
                            ["saved", "Saved"],
                            ["discarded", "Discarded"],
                          ] as const
                        ).map(([bucket, label]) => (
                          <Button
                            key={bucket}
                            variant={friendsFeedBucket === bucket ? "default" : "secondary"}
                            size="sm"
                            onClick={() => setFriendsFeedBucket(bucket)}
                          >
                            {label}
                            {friendsFeedMeta ? ` (${friendsFeedMeta.counts[bucket]})` : ""}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    {feedTab === "friends" && friendsFeedBucket === "discarded" ? (
                      <div className="text-[11px] leading-relaxed text-zinc-500">
                        Discarded posts are removed automatically after 30 days.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {posts === null ? (
                  <div className="text-sm text-zinc-400">Loading posts…</div>
                ) : posts.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-sm text-zinc-400">
                      {feedTab === "friends" && profile.meta.isSelf
                        ? friendsFeedBucket === "unread"
                          ? "No unread posts from friends. Shared posts appear here until you read, save, or discard them."
                          : friendsFeedBucket === "read"
                            ? "No read posts yet."
                            : friendsFeedBucket === "saved"
                              ? "No saved posts yet."
                              : "No discarded posts. Discarded items are removed after 30 days."
                        : "No posts yet."}
                    </CardContent>
                  </Card>
                ) : (
                  posts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      canModeratePins={Boolean(pageOwnerPins && profile.meta.canViewContent && feedTab === "my")}
                      canModerateDeletes={canDeletePost(p) && feedTab === "my"}
                      canEditCaption={canDeletePost(p) && feedTab === "my"}
                      canShareToFriendsFeed={Boolean(
                        profile.meta.isSelf && feedTab === "my" && p.profileOwnerId === profile.user.id,
                      )}
                      canReact={profile.meta.canViewContent}
                      showFeedSource={feedTab === "friends"}
                      showFriendsFeedReview={feedTab === "friends" && friendsFeedBucket === "unread"}
                      friendsFeedReviewBusy={friendsFeedReviewBusyId === p.id}
                      onFriendsFeedReview={(action) => void reviewFriendsFeedPost(p.id, action)}
                      onChanged={() => void refreshActiveFeed()}
                    />
                  ))
                )}
              </div>

              <aside className="space-y-4">
                <Card>
                  <CardHeader className="space-y-1">
                    <div className="text-base font-semibold text-white">Friends</div>
                    <CardDescription>Jump directly—no feed in Phase 1.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(friends ?? []).length === 0 ? (
                      <div className="text-sm text-zinc-400">No friends listed yet.</div>
                    ) : (
                      (friends ?? []).map((f) => (
                        <Link
                          key={f.username}
                          to={`/${f.username}`}
                          className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-950"
                        >
                          <span className="truncate font-semibold">{f.displayName}</span>
                          <span className="text-xs font-semibold text-zinc-500">@{f.username}</span>
                        </Link>
                      ))
                    )}
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>

      {bannerEditOpen && profile.meta.isSelf && profile.user.bannerUrl ? (
        <BannerPositionEditor
          bannerUrl={profile.user.bannerUrl}
          initialX={profile.user.bannerPositionX ?? 50}
          initialY={profile.user.bannerPositionY ?? 50}
          onSave={saveBannerPosition}
          onCancel={() => setBannerEditOpen(false)}
        />
      ) : null}

      {bannerPreviewOpen && profile.user.bannerUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Banner image preview"
          onClick={() => setBannerPreviewOpen(false)}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4 z-10 size-9 bg-zinc-900/90"
            aria-label="Close banner preview"
            onClick={() => setBannerPreviewOpen(false)}
          >
            <X />
          </Button>
          <img
            src={profile.user.bannerUrl}
            alt=""
            className="max-h-[92vh] max-w-[min(96vw,1200px)] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}

function FriendlyErrorMessage() {
  return (
    <div className="text-xs leading-relaxed text-zinc-500">
      Prototype rule: friendships are symmetrical (approved), but you browse pages intentionally—nothing global yet.
    </div>
  );
}
