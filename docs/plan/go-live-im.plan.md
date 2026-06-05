# Plan: Go Live (real-time IM → threaded archive)

**Status:** Planned — UI button + API/client stubs only. Not live yet.

## Summary

When **both friends are online** on unwhelm.online at the same time, either can press **Go live** to open a **separate real-time chat window** (WebSocket/SSE — TBD). When the window closes, the live transcript is **appended to a normal message thread** as sequential bubbles (same format as async messages).

## Product rules

- **Go live** enabled only when **viewer and friend are both online** (presence).
- Live chat is **ephemeral UI** during the session; **persistence happens on close** via archive into `MessageThread` / `Message`.
- Archive uses existing bubble semantics (author, timestamps, linkify); one live line → one `Message` row (flat, no nesting).
- If an open thread exists with same friend + subject, append there; else create thread with subject e.g. `Live chat — {date}` (exact default TBD at implement time).
- Async threaded messages and live chat are **separate surfaces** — live does not replace the accordion thread until close.

## Presence (required for “both online”)

| Piece | Approach (recommended) |
|-------|-------------------------|
| Heartbeat | Client pings `POST /api/messages/live/presence` every ~30s while app tab visible |
| Online | `lastSeenAt` within ~60s |
| Storage | `UserPresence` table or Redis TTL key per `userId` |
| `canGoLive` | `viewerOnline && friendOnline && friendship ACCEPTED` |

## Real-time transport (implement phase — pick one)

1. **WebSocket** `wss://…/api/messages/live/ws` — room per `liveSessionId`, nginx upgrade headers.
2. **SSE** for inbound + existing `POST` for outbound — simpler, one-way push.

Single PM2 instance: in-memory session map. Multi-instance: **Redis pub/sub**.

## Data model (sketch)

```prisma
model LiveChatSession {
  id              String   @id @default(uuid())
  participantLowId  String
  participantHighId String
  startedById     String
  threadId        String?  // optional link if started from expanded thread
  status          LiveChatSessionStatus // ACTIVE | ENDED
  startedAt       DateTime @default(now())
  endedAt         DateTime?
}

enum LiveChatSessionStatus {
  ACTIVE
  ENDED
}

// Ephemeral lines during session: in-memory or LiveChatLine table cleared after archive
```

Archive on close: bulk `Message.create` for each line, update `MessageThread.lastMessageAt`, mark session `ENDED`.

## API (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/messages/live/presence` | Heartbeat (stub: 204) |
| `GET` | `/api/messages/live/presence/:username` | Friend online? + `canGoLive` |
| `POST` | `/api/messages/live/sessions` | Start session → `{ sessionId, wsUrl? }` |
| `POST` | `/api/messages/live/sessions/:id/messages` | Send line during live (if not WS) |
| `POST` | `/api/messages/live/sessions/:id/end` | Close + archive → `{ threadId, messagesAppended }` |

## UI (sketch)

- **Go live** button on expanded message thread + friend profile (disabled until presence true).
- **`LiveChatModal`**: full-screen or large modal, IM bubbles, no subject field during live.
- On close: call `end` → refresh thread in inbox → expand archived thread.

## Stubs in repo (current)

- `packages/shared/src/liveChat.ts` — types + Zod
- `apps/api/src/services/messages/liveChat.ts` — `canGoLive`, `startLiveSession`, `archiveLiveSession` throw `LiveChatNotImplementedError`
- `apps/api/src/routes/liveChat.ts` — presence returns `canGoLive: false`
- `apps/web/src/components/GoLiveButton.tsx` — disabled by default
- `apps/web/src/components/LiveChatModal.tsx` — shell, not opened while stubbed
- `apps/web/src/lib/liveChat.ts` — `useFriendPresence` stub

## Non-goals (v1 live)

- Typing indicators, read receipts in live window
- Live chat without friendship
- Continuing live session after browser refresh (optional v2: rejoin by `sessionId`)

## nginx / prod (when implemented)

- WebSocket proxy on `/api/messages/live/ws` or long timeout for SSE
- Same session cookie as REST
