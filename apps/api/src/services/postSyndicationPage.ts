import {
  buildPostSyndicationCommentTree,
  escapeHtml,
  type PostSyndicationAuthor,
  type PostSyndicationCommentTreeNode,
  type PostSyndicationSnapshot,
  type SyndicationPushAction,
} from "@socialmedialite/shared";

function profilePageHref(webOrigin: string, username: string): string {
  return `${webOrigin}/${encodeURIComponent(username)}`;
}

function shouldLinkAuthorProfile(author: PostSyndicationAuthor): boolean {
  return author.displayName !== author.username || author.profilePicUrl != null;
}

function renderProfileName(
  webOrigin: string,
  author: PostSyndicationAuthor,
  options?: { alwaysLink?: boolean },
): string {
  const name = escapeHtml(author.displayName);
  const link = options?.alwaysLink || shouldLinkAuthorProfile(author);
  if (!link) return name;
  return `<a class="profile-link" href="${escapeHtml(profilePageHref(webOrigin, author.username))}">${name}</a>`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function linkifyEscapedText(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]'"])/g,
    '<a href="$1" rel="noopener noreferrer" target="_blank">$1</a>',
  );
}

function renderTextInner(text: string): string {
  const escaped = escapeHtml(text);
  return linkifyEscapedText(escaped).replace(/\n/g, "<br />");
}

function renderTextBlock(text: string, className = "text-block"): string {
  return `<div class="${className}">${renderTextInner(text)}</div>`;
}

function renderAvatar(author: { displayName: string; profilePicUrl: string | null }, sizeClass: string): string {
  const initials = escapeHtml(author.displayName.slice(0, 2).toUpperCase());
  if (author.profilePicUrl) {
    return `<img class="avatar ${sizeClass}" src="${escapeHtml(author.profilePicUrl)}" alt="" referrerpolicy="no-referrer" />`;
  }
  return `<div class="avatar avatar-fallback ${sizeClass}" aria-hidden="true">${initials}</div>`;
}

function joinConversationLoginHref(webOrigin: string, snapshot: PostSyndicationSnapshot): string {
  const next = encodeURIComponent(`/${snapshot.post.profileOwner.username}`);
  return `${webOrigin}/login?next=${next}`;
}

function pageTitleFromSnapshot(snapshot: PostSyndicationSnapshot): string {
  const post = snapshot.post;
  const fromText = post.text?.trim() || post.photoCaption?.trim() || post.linkTitle?.trim();
  if (fromText) {
    const oneLine = fromText.replace(/\s+/g, " ").trim();
    return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
  }
  return `${post.author.displayName} — ${formatWhen(post.createdAt)}`;
}

function renderComment(webOrigin: string, node: PostSyndicationCommentTreeNode, depth: number): string {
  const indent = Math.min(depth, 6) * 20;
  const children = node.replies.map((reply) => renderComment(webOrigin, reply, depth + 1)).join("");
  return `
    <article class="comment" style="margin-left:${indent}px">
      <div class="comment-head">
        ${renderAvatar(node.author, "avatar-sm")}
        <div class="comment-meta">
          <div class="comment-author">${renderProfileName(webOrigin, node.author)}</div>
          <time class="comment-time" datetime="${escapeHtml(node.createdAt)}">${escapeHtml(formatWhen(node.createdAt))}</time>
        </div>
      </div>
      ${renderTextBlock(node.text)}
      ${children}
    </article>
  `;
}

function renderPostBody(snapshot: PostSyndicationSnapshot): string {
  const post = snapshot.post;
  const parts: string[] = [];

  if (post.type === "TEXT" && post.text) {
    const style =
      post.textBackgroundColor || post.textColor || post.textFontSize
        ? [
            post.textBackgroundColor ? `background:${escapeHtml(post.textBackgroundColor)}` : "",
            post.textColor ? `color:${escapeHtml(post.textColor)}` : "",
            post.textFontSize ? `font-size:${post.textFontSize}px` : "",
          ]
            .filter(Boolean)
            .join(";")
        : "";
    parts.push(
      style
        ? `<div class="text-post" style="${style}">${renderTextInner(post.text)}</div>`
        : renderTextBlock(post.text),
    );
  } else if (post.type === "PHOTO") {
    if (post.photoUrl) {
      parts.push(`<figure class="photo"><img src="${escapeHtml(post.photoUrl)}" alt="" loading="lazy" /></figure>`);
    }
    const caption = post.photoCaption?.trim() || post.text?.trim();
    if (caption) parts.push(renderTextBlock(caption));
  } else if (post.type === "VIDEO_LINK" || post.type === "REEL") {
    if (post.text) parts.push(renderTextBlock(post.text));
    if (post.videoUrl) {
      const cardParts = [
        post.linkPreviewUrl
          ? `<img class="link-preview-img" src="${escapeHtml(post.linkPreviewUrl)}" alt="" loading="lazy" />`
          : "",
        '<div class="link-preview-body">',
        post.linkTitle ? `<div class="link-title">${escapeHtml(post.linkTitle)}</div>` : "",
        post.linkDescription ? `<div class="link-desc">${escapeHtml(post.linkDescription)}</div>` : "",
        `<a class="link-url" href="${escapeHtml(post.videoUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(post.videoUrl)}</a>`,
        "</div>",
      ];
      parts.push(`<div class="link-card">${cardParts.join("")}</div>`);
    }
  } else if (post.text) {
    parts.push(renderTextBlock(post.text));
  }

  return parts.join("");
}

function renderPushActions(actions: SyndicationPushAction[]): string {
  if (actions.length === 0) return "";
  return actions
    .map((action) => {
      const variant =
        action.method === "share_dialog" ? "btn-push btn-push-timeline" : "btn-push btn-push-page";
      return `<a class="${variant}" href="${escapeHtml(action.href)}" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`;
    })
    .join("");
}

function renderPushStatus(input: {
  outcome: "success" | "error";
  reason?: string;
  pageName?: string;
}): string {
  if (input.outcome === "success") {
    const page = input.pageName ? ` to ${input.pageName}` : "";
    return `<div class="push-status push-status-ok">Pushed${escapeHtml(page)} to Facebook Page.</div>`;
  }
  const reason = input.reason ? `: ${input.reason}` : "";
  return `<div class="push-status push-status-err">Facebook publish failed${escapeHtml(reason)}</div>`;
}

export function renderPostSyndicationHtml(input: {
  snapshot: PostSyndicationSnapshot;
  refreshedAt: string;
  pageUrl: string;
  webOrigin: string;
  pushActions?: SyndicationPushAction[];
  pushStatus?: { outcome: "success" | "error"; reason?: string; pageName?: string };
}): string {
  const { snapshot, refreshedAt, pageUrl } = input;
  const pushActions = input.pushActions ?? [];
  const webOrigin = input.webOrigin.replace(/\/+$/, "");
  const post = snapshot.post;
  const title = pageTitleFromSnapshot(snapshot);
  const commentTree = buildPostSyndicationCommentTree(snapshot.comments);
  const commentsHtml =
    commentTree.length > 0
      ? commentTree.map((node) => renderComment(webOrigin, node, 0)).join("")
      : '<p class="muted">No comments yet.</p>';

  const description = post.text?.trim() || post.photoCaption?.trim() || post.linkTitle?.trim() || title;
  const ogImage = post.photoUrl || post.linkPreviewUrl;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description.slice(0, 300))}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description.slice(0, 300))}" />
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ""}
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #111114;
      --surface: #1c1c21;
      --card: #26262d;
      --border: #3f3f46;
      --text: #d4d4d8;
      --muted: #a1a1aa;
      --link: #7dd3fc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
    }
    a { color: var(--link); }
    .profile-link {
      color: #f4f4f5;
      font-weight: inherit;
      text-decoration: none;
    }
    .profile-link:hover {
      color: var(--link);
      text-decoration: underline;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
    .post-card, .comments-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1rem 1.1rem;
    }
    .comments-card { margin-top: 1rem; }
    .post-head, .comment-head { display: flex; gap: 0.75rem; align-items: flex-start; }
    .avatar {
      border-radius: 999px;
      object-fit: cover;
      background: #27272a;
      flex-shrink: 0;
    }
    .avatar-lg { width: 48px; height: 48px; }
    .avatar-sm { width: 32px; height: 32px; }
    .avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
      color: #f4f4f5;
    }
    .author { font-weight: 700; color: #f4f4f5; }
    .when, .comment-time, .muted, .footer { color: var(--muted); font-size: 0.875rem; }
    .wall-note { margin-top: 0.15rem; font-size: 0.8rem; color: var(--muted); }
    .text-block { margin-top: 0.85rem; white-space: pre-wrap; word-break: break-word; }
    .text-post {
      margin-top: 0.85rem;
      padding: 0.75rem 0.85rem;
      border-radius: 0.5rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .photo img, .link-preview-img {
      display: block;
      width: 100%;
      max-height: 640px;
      object-fit: contain;
      border-radius: 0.5rem;
      margin-top: 0.85rem;
      background: #0a0a0c;
    }
    .link-card {
      margin-top: 0.85rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      overflow: hidden;
      background: var(--surface);
    }
    .link-preview-body { padding: 0.75rem 0.85rem; }
    .link-title { font-weight: 700; color: #f4f4f5; }
    .link-desc { margin-top: 0.35rem; font-size: 0.9rem; color: var(--muted); }
    .link-url { display: inline-block; margin-top: 0.5rem; font-size: 0.85rem; word-break: break-all; }
    .section-title {
      margin: 0 0 0.85rem;
      font-size: 0.95rem;
      font-weight: 700;
      color: #f4f4f5;
    }
    .comment { margin-top: 0.85rem; padding-top: 0.85rem; border-top: 1px solid var(--border); }
    .comment:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
    .comment-meta { min-width: 0; }
    .comment-author { font-weight: 600; color: #f4f4f5; font-size: 0.9rem; }
    .cta {
      margin-top: 1.25rem;
      padding: 1.1rem 1rem;
      text-align: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
    }
    .cta-note {
      margin: 0 0 0.85rem;
      font-size: 0.875rem;
      color: var(--muted);
    }
    .btn-join {
      display: inline-block;
      padding: 0.55rem 1.15rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #fff;
      background: #2563eb;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .btn-join:hover { background: #1d4ed8; }
    .cta-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
      align-items: center;
    }
    .btn-push {
      display: inline-block;
      padding: 0.55rem 1.15rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #f4f4f5;
      background: #1877f2;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .btn-push:hover { background: #166fe5; }
    .push-status {
      margin: 0 0 0.85rem;
      padding: 0.65rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.85rem;
      text-align: left;
    }
    .push-status-ok {
      background: #052e16;
      border: 1px solid #166534;
      color: #bbf7d0;
    }
    .push-status-err {
      background: #450a0a;
      border: 1px solid #991b1b;
      color: #fecaca;
    }
    .footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <article class="post-card">
      <div class="post-head">
        ${renderAvatar(post.author, "avatar-lg")}
        <div>
          <div class="author">${renderProfileName(webOrigin, post.author, { alwaysLink: true })}</div>
          <time class="when" datetime="${escapeHtml(post.createdAt)}">${escapeHtml(formatWhen(post.createdAt))}</time>
          ${
            post.profileOwner.username !== post.author.username
              ? `<div class="wall-note">On ${renderProfileName(webOrigin, post.profileOwner, { alwaysLink: true })}&apos;s page</div>`
              : ""
          }
        </div>
      </div>
      ${renderPostBody(snapshot)}
    </article>

    <section class="comments-card" aria-label="Comments">
      <h2 class="section-title">Comments (${snapshot.comments.length})</h2>
      ${commentsHtml}
    </section>

    <section class="cta" aria-label="Join and share">
      <p class="cta-note">This page is read-only. Sign in to comment on SocialMediaLite. Push to FB timeline opens Facebook&apos;s share dialog for your personal feed. Push to FB page publishes automatically to a Page you manage.</p>
      ${input.pushStatus ? renderPushStatus(input.pushStatus) : ""}
      <div class="cta-actions">
        <a class="btn-join" href="${escapeHtml(joinConversationLoginHref(webOrigin, snapshot))}">Join the conversation on SML</a>
        ${renderPushActions(pushActions)}
      </div>
    </section>

    <footer class="footer">
      Refreshed at ${escapeHtml(formatWhen(refreshedAt))}
    </footer>
  </main>
</body>
</html>`;
}
