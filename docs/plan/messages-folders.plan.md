# Plan: Message folders (flat, per-user filter)

**Status:** Planned — not implemented.

## Summary

Add **flat folders** on `/messages` so each user organizes **their view** of threads. Folders are a **filter only** — same thread list + expand UI; selecting a folder shows threads assigned to it. **Saved** and **Archived** are created automatically; users add custom folders (e.g. “Trip to Mexico”). **Drag-and-drop** moves threads between folders. **No subfolders.**

## Product rules

- **Per-user:** Folder assignment is private. Edmundo can file a thread under “Trip to Mexico”; Test User can leave it in All or use their own folders.
- **One folder per thread per user:** Many threads → one folder; each thread has at most one folder per participant (or **All** = none).
- **Flat only:** No nested folders.
- **System folders:** **Saved** and **Archived** — auto-created, cannot delete (can rename display? **No** — fixed labels).
- **Custom folders:** User-created, deletable; deleting a folder moves its threads back to **All** (`folderId = null`).
- **All / Inbox:** Default view — threads with no `folderId` for this user (and optionally “show all” toggle — **default: All shows only unfiled**; see open question).
- **Filter, not route:** Clicking a folder filters the existing message surface; expanded thread + composer unchanged.
- **Suggest grouping by subject:** Empty-state / helper copy: *“Group threads by trip, project, or use Saved / Archived.”*

## UX layout (`MessagesPage`)

```
┌─────────────────────────────────────────────────────────┐
│ Messages  [+ New message]  …                            │
├─────────────────────────────────────────────────────────┤
│ [All]  [Saved]  [Archived]     ← system row, always     │
│ ─────────────────────────────────  horizontal rule      │
│ [Trip to Mexico] [Work]  [+ Folder]  [🗑 on custom]      │
│   ↑ drop targets + click to filter                      │
├─────────────────────────────────────────────────────────┤
│ ▼ Test User · testing messaging                         │
│   … existing accordion + bubbles …                      │
└─────────────────────────────────────────────────────────┘
```

### Interactions

| Action | Behavior |
|--------|----------|
| Click **All** | `folderId = null` filter (unfiled only, or all threads — decide below) |
| Click **Saved** / **Archived** | Filter threads where user’s participant `folderId` matches |
| Click custom folder | Same filter |
| **Drag** thread row onto folder chip | `PATCH` assign `folderId` |
| **Drag** to **All** (or “remove from folder” zone) | Set `folderId = null` |
| **+ Folder** | Modal/inline name (max 64 chars); create via API |
| Delete custom folder | Confirm → delete folder; participants in that folder → `null` |

### Drag-and-drop

- **HTML5 DnD** on thread card header + folder chips (no new dep) or **`@dnd-kit/core`** if polish needed.
- Visual: folder chip highlights on `dragover`; thread row `opacity-50` while dragging.

## Data model

```prisma
model MessageFolder {
  id        String   @id @default(uuid())
  userId    String
  name      String   // trim, 1–64 chars; unique per user among custom
  kind      MessageFolderKind @default(CUSTOM)
  sortOrder Int      @default(0)
  user      User     @relation(...)
  participants MessageThreadParticipant[]
  createdAt DateTime @default(now())

  @@unique([userId, name])
  @@index([userId, sortOrder])
}

enum MessageFolderKind {
  CUSTOM
  SAVED
  ARCHIVED
}

model MessageThreadParticipant {
  // existing fields…
  folderId  String?
  folder    MessageFolder? @relation(...)
}
```

**Bootstrap** (on `GET /api/messages/folders` or first `/messages` load):

```ts
ensureSystemFolders(userId) // insert Saved + Archived if missing (kind SAVED/ARCHIVED)
```

## API (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/messages/folders` | List folders (system first, then custom by `sortOrder`) + thread counts per folder |
| `POST` | `/api/messages/folders` | `{ name }` → create custom folder |
| `DELETE` | `/api/messages/folders/:id` | Custom only; reassign participants `folderId → null` |
| `PATCH` | `/api/messages/threads/:threadId/folder` | `{ folderId: string \| null }` — updates **viewer’s** `MessageThreadParticipant` |
| `GET` | `/api/messages/threads?folderId=` | Optional query: omit / `all` / uuid / `none` for unfiled |

Extend existing `GET /threads` response with `folderId` on each thread for the viewer.

## Client (`MessagesPage`)

- State: `selectedFolderId: null | 'all-unfiled' | uuid`, `folders[]`
- `filteredThreads = threads.filter(t => matchesFolder(t.folderId, selectedFolderId))`
- URL optional: `/messages?folder=saved` slug for system folders
- Components:
  - `MessageFolderBar.tsx` — system row, divider, custom chips, add/delete
  - `MessageThreadRow.tsx` — extract from page; `draggable`
- Copy under folder bar (muted): *“Folders group threads on your side only — try Saved, Archived, or Trip to Mexico.”*

## Phases

### Phase 1 (MVP)
- Schema + migration + `ensureSystemFolders`
- Folder CRUD + assign API
- Folder bar UI + click filter
- Drag-drop assign

### Phase 2 (optional)
- Reorder custom folders (`PATCH sortOrder`)
- Rename custom folder
- Unread count per folder in chip badge

## Non-goals

- Subfolders
- Shared/collaborative folders
- Auto-file by subject keyword
- Moving messages (only whole threads)

## Open questions (defaults)

| # | Question | Default |
|---|----------|---------|
| 1 | **All** shows only unfiled or every thread? | **Unfiled only**; Saved/Archived hold filed threads |
| 2 | Thread in Saved still in friend’s inbox? | **Yes** — folder is viewer-local |
| 3 | Max custom folders | **50** per user |

## Tests

- [ ] New user gets Saved + Archived
- [ ] Assign thread → appears only in that folder filter
- [ ] Move thread Saved → Archived via drag
- [ ] Delete custom folder → threads return to All
- [ ] Cannot delete system folders
