# FB-ID Export & Replication — Feasibility

**Status:** Design note — not implemented.

Can we gate SML on Facebook friends only, then **export** full posts + comment threads with **Facebook IDs preserved**, and **replicate** elsewhere because everything is keyed by FB id?

**Short answer:** **Partially yes for people**, **not yet for posts/comments** in the current schema. Feasible with explicit **`fbPostId` / `fbCommentId`** fields and realistic expectations about Meta’s API.

**Related:** [PUSH_TO_FB.md](PUSH_TO_FB.md) · [FB_TO_SML_SHARE_LINK.md](FB_TO_SML_SHARE_LINK.md) · [FB_IMPORT_SPEC.md](FB_IMPORT_SPEC.md) · [FACEBOOK_LOGIN_SETUP.md](FACEBOOK_LOGIN_SETUP.md)

---

## What is true today (SML schema)

| Entity | Primary key today | Facebook id stored? |
|---|---|---|
| **User** | SML `id` (UUID) | **`fbUserId`** (optional; set on FB login) |
| **Post** | SML `id` (UUID) | **No** `fbPostId` |
| **Comment** | SML `id` (UUID) | **No** `fbCommentId` |
| **Friendship** | SML `Friendship` row | **Not** FB friend graph — separate accept/request model |

So your intuition is **half right**:

- **Users** can be treated as stable across export/import **if** everyone joined via Facebook Login → upsert by `fbUserId`.
- **Posts and comments** are keyed by **SML UUIDs**, not FB ids. Export today would emit internal ids unless you add and populate FB foreign keys.

---

## “Only FB friends can join SML” — API reality

You **cannot** enforce “must be my Facebook friend” for **every** visitor using Graph API alone:

| Meta behavior | Implication |
|---|---|
| `user_friends` returns only friends **who also use your app** and granted the permission | Not the full FB friend list |
| No permission gives full friend list for general apps | Invite/tagging APIs are separate, restricted use cases |
| Pair check `GET /{user-a}/friends/{user-b}` | Works only when both use the app + `user_friends` |

**Practical SML model (what you already have + share links):**

1. Owner **pushes / shares** join link on Facebook → audience is *de facto* FB friends (social distribution).
2. On SML, **friendship accept** mirrors trust (Phase 1 list).
3. Optional: on login, if `user_friends` granted, **suggest** or auto-request SML friendship with app-using FB friends — not a hard gate for entire FB graph.

**Hard gate “only FB friends”** is feasible only among **subset who installed SML + granted permissions**, not all FB friends.

---

## Export preserving FB ids — when it works

### Export format (conceptual JSON)

```json
{
  "exportedAt": "2026-05-25T12:00:00Z",
  "profileOwnerFbUserId": "102…",
  "post": {
    "fbPostId": "123456789_987654321",
    "smlPostId": "uuid-…",
    "type": "VIDEO_LINK",
    "text": "…",
    "comments": [
      {
        "fbCommentId": "178…",
        "authorFbUserId": "102…",
        "parentFbCommentId": null,
        "text": "…",
        "createdAt": "…"
      }
    ]
  }
}
```

### Stable keys for idempotent replication

| Field | Upsert key on import | Available today? |
|---|---|---|
| `authorFbUserId` / `profileOwnerFbUserId` | `User.fbUserId` | **Yes** (if FB login) |
| `fbPostId` | `Post.fbPostId` (new unique) | **No** — must add column |
| `fbCommentId` | `Comment.fbCommentId` (new unique) | **No** — must add column |
| SML-only stub users | `username` or internal id | Stub logins have fake `fbUserId` |

**Replication story:** Import service does `upsert User by fbUserId` → `upsert Post by fbPostId` → `upsert Comment by fbCommentId`, remap `parentId` via fb comment parent. **Yes, that replicates cleanly** — but only if those FB ids were **captured at creation/import time**.

---

## Where do FB post/comment ids come from?

| Source | Feasibility |
|---|---|
| **Push to FB Page (Graph API v2)** | **Yes** — response includes Page post `id` → store as `fbPostId` |
| **User shares via Share Dialog (v1)** | **Partial** — you often **don’t** get post id back unless you use FB SDK callbacks / manual paste |
| **Import comments from FB thread** | **Mostly no** for personal posts — Graph API does not expose arbitrary FB comment threads to third-party apps |
| **SML-native comments** | Only have SML ids unless you **also** mirror to FB and store returned ids |

So: **export of full conversation with FB comment ids** is realistic when:

- Discussion **originates or is mirrored on a Facebook Page** you control (API returns ids), **or**
- You accept export with **SML ids + user `fbUserId` only** (no FB comment ids for SML-native replies)

**SML-native threads** (comments only on SML after join link): export preserves **`fbUserId` per author**, not FB comment ids — because those comments never existed on Facebook.

---

## End-to-end scenarios

### A) SML is source of truth (join link from FB)

```
FB share → users land on SML → comment on SML
```

- Export: rich thread, **`authorFbUserId` on each comment**, post keyed by SML id (+ optional `ShareLink.token`).
- FB comment ids: **N/A** (comments aren’t on FB).
- Replication: re-import by SML post uuid or new `exportBundleId`; users upsert by `fbUserId`.

### B) Page post is source of truth (Push to FB Page v2)

```
SML post → push to Page → some reply on FB Page (API) + deeper thread on SML
```

- Store **`fbPostId`** from Graph API on push.
- Page comment ids: possible **only for Page-managed content** via Pages API (scope + review).
- Export: merge Page API snapshot + SML thread; map authors by `fbUserId` where FB login linked accounts.

### C) “Replicate what we did in SML since each entry is keyed by fb id”

**Accurate if you change the model to:**

```prisma
model User {
  fbUserId String? @unique  // already exists; make unique for FB users
}
model Post {
  fbPostId String? @unique
}
model Comment {
  fbCommentId String? @unique
  parentId    String?  // SML internal tree
  // optional: parentFbCommentId in export only
}
```

Without those columns, replication is keyed by **SML UUIDs**, not FB ids.

---

## Recommended approach (if you want this product path)

### Phase 1 — Export what you have

- `GET /api/me/export/post/:postId` (owner only)
- JSON: post + comment tree + **`author.fbUserId`** + **`profileOwner.fbUserId`**
- Include `shareLink.token`, push `fbPostId` if present
- No claim of FB comment ids for SML-only comments

### Phase 2 — Capture FB post id on push

- When [PUSH_TO_FB](PUSH_TO_FB.md) Page API succeeds → `Post.fbPostId` or `ShareLink.fbPostId`
- Export includes it for cross-system correlation

### Phase 3 — Import / replicate

- Full spec: **[FB_IMPORT_SPEC.md](FB_IMPORT_SPEC.md)**
- `POST /api/import/bundle` — upsert by `fbUserId`, `fbPostId`, `fbCommentId`
- Unmatched authors → **`Guest (1)` … `Guest (n)`** (stable per `bundleId`)
- Idempotent: re-run same bundle doesn’t duplicate

### Do not rely on

- Exporting **full FB personal timeline** + all comment ids without user/Page API access
- **Blocking** non–app-using FB friends from join link (use SML friend accept + privacy instead)

---

## Direct answers to your question

| Statement | Verdict |
|---|---|
| “Only FB friends can join SML” | **Soft yes** (social + SML friends); **hard API gate for all FB friends** → **no** |
| “Export entire post + conversation preserving FB ids” | **Users: yes** (`fbUserId`). **Post/comment FB ids: only if stored** when created/pushed |
| “Replicate since each entry is keyed by fb id” | **Not today**. **Yes after** schema adds `fbPostId` / `fbCommentId` and ingest captures them |
| “Same as what we did in SML” | Same **shape** (post + threaded comments by person), but keys must be **designed in**, not automatic |

---

## Summary

The **architecture is sound** for **user-stable, idempotent export/import** using **`fbUserId`**. Treating the **whole thread** as FB-keyed requires **explicit FB id columns** and a **clear source** (SML-native vs Page API). Meta will **not** let you pull arbitrary FB personal post comment trees to backfill ids later — capture at push/import time or accept SML ids for discussion that only lives on SML.
