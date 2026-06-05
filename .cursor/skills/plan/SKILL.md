---
name: plan
description: >-
  Produces structured implementation plans for SocialMediaLite (unwhelm.online)
  before coding. Use when the user invokes /plan, asks to plan a feature, or
  wants a threaded-email-style messaging design scoped to friends-only DMs.
disable-model-invocation: true
---

# Plan (`/plan`)

Planning-only skill: explore the repo, align with product constraints, output a concise plan. **Do not implement** unless the user asks after the plan.

## When to use

- User says `/plan`, "let's plan", or "consider a feature before building"
- User wants tradeoffs, schema sketch, API surface, or phased rollout **without code yet**

## Workflow

1. **Read context** — `packages/db/prisma/schema.prisma`, relevant routes in `apps/api/src/routes/`, UI in `apps/web/src/pages/` (especially `ProfilePage.tsx`, `FriendsPage.tsx`).
2. **Restate goal** — one paragraph in plain language.
3. **Apply product constraints** below (and any user additions verbatim).
4. **Propose plan** using the output template.
5. **Call out non-goals** explicitly (no scope creep).
6. **End with open questions** only if blocking; otherwise make reasonable defaults and label them.

Match existing conventions: Express + Prisma + session auth, npm workspaces, shadcn/Tailwind UI, minimal diff philosophy.

---

## Product constraints (messaging — default brief)

Use this when planning **in-app messaging** unless the user overrides:

- **Model**: simple **threaded email**, not IM (no typing indicators, presence, or chat bubbles as the primary metaphor).
- **Simplicity**: people already have email and other messengers — keep unwhelm messaging **dead simple**.
- **Self-contained**: no external integrations (no SMTP, webhooks, push providers, or third-party inboxes).
- **Links**: support **unwhelm.online links 100%** in message bodies (detect, linkify, safe rendering; same-origin paths and profile/post URLs).
- **Who can message whom**: **accepted friends only** — cannot message non-friends.
- **Entry points**:
  - On a friend's profile: **Message** (or similar) opens or continues a thread with that user.
  - On **Send friend request**: optional **message** field attached to the outgoing request (stored with the pending friendship or first thread message — pick one in the plan and justify).

---

## Output template

Deliver the plan in this structure:

```markdown
# Plan: [Feature name]

## Summary
[2–4 sentences: what we're building and why]

## Product rules
- [Bullet constraints from user + this skill]

## User flows
1. [Actor] → [action] → [result]
2. ...

## Data model (sketch)
- Tables/fields, indexes, uniqueness (e.g. one thread per friend pair)
- Enums and status fields

## API (sketch)
- `METHOD /api/...` — auth, body, errors (403 non-friend, etc.)

## UI (sketch)
- Screens/components and where they live (`ProfilePage`, inbox page, etc.)
- Copy for primary buttons ("Message", optional note on friend request)

## Link handling
- How unwhelm.online URLs are parsed, stored, displayed, and validated

## Phases
### Phase 1 (MVP)
- ...
### Phase 2 (optional)
- ...

## Non-goals
- [Explicit out-of-scope items: IM features, email export, etc.]

## Tests / acceptance
- [ ] ...

## Open questions
- [Only if needed]
```

---

## Messaging — technical hints (SocialMediaLite)

Use when the plan is for messaging; adapt if the codebase has changed.

| Area | Starting point |
|------|----------------|
| Friends | `Friendship` model, `status === ACCEPTED`; APIs under `apps/api/src/routes/friends.ts` |
| Profile UI | `ProfilePage.tsx` — friend actions: request / accept / reject / defriend (`friendshipStatus`) |
| Auth | Session `requireAuth`; offline stub users may need parity or clear "not in offline mode" rules |
| Patterns | Zod validation in routes; `apiJson` on web; migrations in `packages/db/prisma/migrations/` |

**Threaded-email UX defaults** (suggest unless user disagrees):

- One **thread** per unordered friend pair (canonical `userLowId` + `userHighId` or participant table).
- **Messages** are ordered posts in a thread (subject optional; body text + linkified HTML/markdown subset).
- **Inbox**: thread list sorted by last message time; thread view shows chronological messages.
- **Friend-request message**: optional single text on `POST /api/friends/request` body; visible to addressee on accept (or becomes first message on accept — state in plan).

**Link policy**:

- Auto-link `https://unwhelm.online/...` and relative `/username`, `/username/...` paths.
- Reject or strip off-site URLs in v1, or render as plain text (plan should choose).
- Reuse existing post/link preview helpers only if zero scope creep; otherwise linkify-only in v1.

**Non-goals to list in every messaging plan**:

- Real-time WebSockets / "online" status
- Read receipts, reactions, attachments (unless user asks)
- Email send/receive, SMS, Meta/Facebook DM bridge
- Messaging non-friends or strangers

---

## Examples

**User**: `/plan messaging`

**Agent**: Read schema + ProfilePage friend flows → output full template above with Phase 1 inbox + profile Message button + optional friend-request note.

**User**: `/plan pin limits on comments`

**Agent**: Same workflow; ignore messaging constraints; produce template for that feature instead.
