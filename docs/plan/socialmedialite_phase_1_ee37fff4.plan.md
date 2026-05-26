---
name: SocialMediaLite Phase 1
overview: "Create a Facebook-like “personal page” app with stubbed Facebook login, profiles, friends, posts/comments, pinning, and image uploads (≤500KB with downscale), using a future-proof architecture: Express API + React/Tailwind/shadcn UI, Postgres (docker) + Prisma, and a pluggable storage layer (local disk now, cloud later). Shared links accept any HTTPS URL with server-built Open Graph–style previews and fixed-layout hero thumbnails stored in blob storage."
todos:
  - id: bootstrap-monorepo
    content: Create monorepo skeleton (apps/api, apps/web, packages/db, packages/shared) with scripts and shared tooling.
    status: completed
  - id: docker-postgres
    content: Add docker-compose with Postgres 16 service `my-postgres` and env templates for connection strings.
    status: completed
  - id: prisma-schema
    content: Implement Prisma schema + migrations including partial unique index for pinned post per profile.
    status: completed
  - id: stub-auth
    content: Implement stub Facebook login flow (server session + login page) and protect API routes.
    status: completed
  - id: storage-abstraction
    content: Add StorageProvider interface + LocalDiskStorageProvider, env config stub for future S3.
    status: completed
  - id: uploads-image-policy
    content: Implement image upload endpoints with 500KB policy and sharp downscale/compress.
    status: completed
  - id: profile-page
    content: Build profile page UI (banner, profile frame stub, composer, posts list).
    status: completed
  - id: posts-comments
    content: Implement posts + comments APIs and UI including posting to others’ pages.
    status: completed
  - id: pin-post
    content: Add pin/unpin API + UI and enforce single pinned post.
    status: completed
  - id: friends
    content: Add friend request/accept/list APIs and UI navigation to friends’ pages.
    status: completed
  - id: smoke-tests
    content: Add minimal integration tests for posts, pinning constraint, and upload enforcement.
    status: completed
  - id: shared-link-preview
    content: Shared links for any HTTPS URL; POST /api/link-preview; OG-style card (title, description, fixed-size stored hero WebP); UI embed + composer live preview.
    status: completed
isProject: false
---

# SocialMediaLite Phase 1 (stub FB login, pages, posts, images, shared link previews)

**Living goals list (repo root):** `docs/PHASE1_GOALS.md` — authoritative bullets for Phase 1 scope including shared links + URL previews.

## Goals (Phase 1)

- **Auth**: Require “FB login” to enter the app, but **stub the FB OAuth** (no real Facebook API yet).
- **No global feed**: Users only view **a user’s page** (their own or a friend’s) and interact there.
- **Content types**: Text, photos (upload), and **shared links** — **`POST` type remains `VIDEO_LINK` in Prisma/API**, but UX and copy treat it as **any `https` page** (video, article, storefront, etc.); **`videoUrl` holds the shared URL**.
- **URL previews (server)**:
  - Fetch target page with redirect limits and **basic SSRF protection** (`http/https` only, blocked hosts, DNS resolves to prohibited ranges rejected).
  - Parse **Open Graph** / fallback `<title>` for **title** and short **description**.
  - Optional **`og:image`**: download, **crop/resize** to fixed dimensions (~**476×248** WebP via `sharp`), store under **`linkPreviewImageKey`** for consistent timeline cards (neutral placeholder slot when missing or unloadable).
  - **`POST /api/link-preview`** (authenticated): returns JSON for **composer debounce** (`hostname`, `title`, `description`, `remoteImageUrl` pointing at OG source when present — timeline uses **stored** `linkPreviewUrl` after publish).
- **Timeline**: Page shows posts in **reverse chronological order** (newest first).
- **Pinning**: One pinned post per profile, always at top.
- **Profile visuals**: Stub FB profile pic frame; allow **banner image upload**.
- **Friends**: Users can connect as friends; navigation is **direct to a person’s page**.
- **Posting on others’ pages**: Like Facebook wall posts + comments.
- **Uploads**: Max **500KB**; if larger, **downscale/compress** (or if still too large, prompt user to use a link).
- **Architecture**: Intentionally modular so Phase 2+ can add real FB OAuth, feed, notifications, messaging, etc.

## Tech decisions

- **Backend**: Node.js + Express
- **Frontend**: React + Vite + Tailwind + shadcn/ui
- **DB**: Postgres 16 in Docker (or equivalent), via Prisma; API may use **`pg` + `@prisma/adapter-pg`** per project setup.
- **Storage**: Local disk now, but behind a **storage provider interface** with a config flag for future S3

## Repo layout (monorepo)

- `apps/api/` Express server
- `apps/web/` React app
- `packages/shared/` shared types + validation schemas
- `packages/db/` Prisma schema + migrations
- `docs/` goals and plans (`PHASE1_GOALS.md`, `plan/`)

## Infrastructure & local dev

- Add `docker-compose.yml` with a Postgres service named **`my-postgres`** (per your setup), exposing `5432:5432`.
- Add `.env.example` at repo root and per-app env files as needed.
- Add workspace scripts (npm workspaces): `dev`, `db:deploy`, `db:migrate`, `db:studio`, `postinstall` (shared build + prisma generate).

## Data model (Prisma + Postgres)

Schema in `packages/db/prisma/schema.prisma`.

### Core tables

- **User**
  - `id` (uuid)
  - `fbUserId` (string, nullable for now)
  - `displayName`
  - `username` (unique, used in URLs)
  - `profilePicUrl` (string, nullable; stubbed)
  - `bannerImageKey` (string, nullable)
  - timestamps

- **Friendship**
  - `requesterId`, `addresseeId`
  - `status` enum: `PENDING | ACCEPTED | BLOCKED`
  - timestamps

- **Post** (a “wall post”)
  - `id`
  - `authorId` (who created)
  - `profileOwnerId` (whose page it appears on)
  - `type` enum: `TEXT | PHOTO | VIDEO_LINK`
  - `text` (nullable)
  - `photoKey` (nullable)
  - **`videoUrl` (nullable) — canonical shared link URL**
  - **`linkTitle` / `linkDescription` (nullable) — OG / inferred preview text**
  - **`linkPreviewImageKey` (nullable) — resized preview hero in blob storage**
  - `isPinned` (bool)
  - timestamps

- **Comment**
  - `id`
  - `postId`
  - `authorId`
  - `text`
  - timestamps

### Constraints & indexes

- Enforce **only one pinned post per profile** (Prisma-level transaction + DB constraint approach):
  - Prefer a partial unique index on `(profileOwnerId)` where `isPinned = true` (implemented via SQL migration).
- Indexes for page performance:
  - `Post(profileOwnerId, createdAt desc)`
  - `Comment(postId, createdAt asc)`

## Storage abstraction (local now, cloud later)

In `apps/api/src/storage`:

- `StorageProvider` interface:
  - `putObject({ key, contentType, buffer })`
  - `getPublicUrl(key)`
  - `deleteObject(key)`
- Implement `LocalDiskStorageProvider`:
  - Base path from env `STORAGE_LOCAL_ROOT` (e.g. `apps/api/storage`)
  - Per-user directory convention: `users/{userId}/...` **including OG hero files** (`link-preview-{timestamp}.webp`)
- Add config env `STORAGE_PROVIDER=local` (accepted values: `local`, `s3`) but **only implement `local`** in Phase 1; stub wiring for `s3`.
- Serve local assets via Express static route `GET /assets/*`.
- **`DELETE /api/posts/:postId`** also removes **`linkPreviewImageKey`** when present.

## Image upload rules

- Accept only images: `jpeg`, `png`, `webp`.
- Max input size: **500KB** policy for **user uploads** (posts + banner).
- If >500KB:
  - Attempt downscale/compress with `sharp` (e.g. max width cap, convert to WebP).
  - If still >500KB, return a friendly error telling user to use a link instead.
- Link preview thumbs use a **separate** resize path (**fixed aspect**, WebP capped by quality loop; not necessarily the same 500KB UX string as timelines).

## Backend API (Express)

Prefix: `/api`.

### Auth (stub)

- `POST /api/auth/stub-login`
  - body: `{ fbUserId, displayName, username }`
  - creates/updates user; cookie session for Phase 1.
- `POST /api/auth/logout`
- `GET /api/me`

### Users / profiles

- `GET /api/users/:username`
- `PATCH /api/me/banner` (multipart upload)

### Friends

- `POST /api/friends/request` `{ username }`
- `POST /api/friends/accept` `{ username }`
- `GET /api/friends` (accepted)

### Link preview (composer)

- `POST /api/link-preview` `{ url }` (authenticated): returns `{ url, hostname, title, description, remoteImageUrl }` for UI debouncing (does not persist thumbnails).

### Posts

- `GET /api/users/:username/posts` (includes pinned + newest-first); each row includes **`photoUrl`** and **`linkPreviewUrl`** where applicable).
- `POST /api/users/:username/posts`
  - text or shared-link JSON **`{ type: "VIDEO_LINK", videoUrl, text? }`**
  - or multipart for photo posts
  - Creating a **`VIDEO_LINK`** post runs **`buildStoredLinkPreview`** server-side before insert.
- `POST /api/posts/:postId/pin` (pin/unpin with transaction)
- `DELETE /api/posts/:postId` (author or profile owner)

### Comments

- `GET /api/posts/:postId/comments`
- `POST /api/posts/:postId/comments`

## Frontend UI (React + Tailwind + shadcn)

Routes:

- `/login` stub “Continue with Facebook” form (fbUserId optional) + username setup
- `/:username` profile page

Profile page layout:

- Top: banner image (upload button if owner)
- Left/top: circular profile pic frame (stub)
- Friend actions (Add/Accept) + direct links to friends’ pages
- Composer:
  - Tabs: Text / Photo / **Link** (shared URLs; backend type `VIDEO_LINK`)
  - Link tab: debounced **`/api/link-preview`** → **live preview card** matches timeline layout slot
- Posts list:
  - Pinned post (if any)
  - Rest in newest-first order
  - **`VIDEO_LINK`** posts render **`SharedLinkEmbed`** (fixed hero frame + title/description + outbound link).
  - Each post: content + comments + add comment
  - Pin button (only on own profile)

## Validation, types, and security basics

- Use shared Zod schemas in `packages/shared` for request validation where applicable.
- Server-side validation for URLs and username format; **URL preview fetching** guarded against obvious SSRF (Phase 2 can harden further, e.g. stricter redirects, caching, allowlists).

- Basic auth guard middleware to require login for all API routes except `/auth/*`.

## Testing (minimal)

- Backend integration tests for:
  - create post on own profile
  - create post on friend’s profile (requires friendship accepted)
  - pinning enforces single pinned post
  - image downscale and size enforcement
  - **shared link posts + `/api/link-preview`** (preview service mocked offline in tests)

## Milestones / order of implementation

- Bootstrap monorepo + dev scripts
- Docker Postgres + Prisma schema + migrations
- Auth stub + session
- Storage provider interface + local disk implementation
- Profile page read + banner upload
- Posts (text/photo/link) + list + pinned behavior
- **Shared link previews (OG scrape, thumbnails, composer + timeline cards)**
- Comments
- Friends request/accept + UI navigation
- Polish UI with shadcn components and good empty/loading states

---

## Phase 2 (separate plans — not in this checklist)

Post–Phase 1 AI features are documented outside this file:

- [../AI_ADD_KNOWLEDGE.md](../AI_ADD_KNOWLEDGE.md) — AI Add + hybrid profile chatbot
- [../FRIEND_SELECT_CHAT.md](../FRIEND_SELECT_CHAT.md) — friend select chat (split pane)
- [../FB_TO_SML_SHARE_LINK.md](../FB_TO_SML_SHARE_LINK.md) — FB → SML public share links (Open Graph)
- [../PUSH_TO_FB.md](../PUSH_TO_FB.md) — Push SML post to Facebook
- [../README.md](../README.md) — documentation index
