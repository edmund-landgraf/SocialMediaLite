---
name: AI profile summaries
overview: "Build an AI insights layer that aggregates a user’s activity into structured signals, sends them to an LLM, and stores narrative reports on the profile. MVP is self-only (“Things about me”); later expands to friends and per-friend views."
todos:
  - id: ai-summaries-schema
    content: Add AiProfileSummary model + migration; scope enum (SELF, FRIENDS_ALL, FRIEND_ONE); store structured input snapshot + narrative output.
    status: pending
  - id: ai-summaries-aggregator-self
    content: Server-side aggregator for current user — posts, comments, reactions, frequency, topics, engagement patterns.
    status: pending
  - id: ai-summaries-llm
    content: Pluggable LLM provider (env-driven); prompt template; structured JSON in, narrative markdown out.
    status: pending
  - id: ai-summaries-api-ui-self
    content: POST generate + GET list; profile “AI summaries” grid (one row per run); “Things about me” button (MVP).
    status: pending
  - id: ai-summaries-friends
    content: "Things about your friends" aggregate scope + optional per-friend scope (FRIEND_ONE).
    status: pending
isProject: false
---

# AI profile summaries — implementation plan

**Status:** Planning (not in Phase 1 scope yet).  
**MVP button:** **Things about me** (current session user only).  
**Later buttons:** **Things about your friends** → **Things about {friend X}**.

---

## Next rev notes (prompt + ops)

- Switch summary voice to **third-person analyst** style (not first-person roleplay) so inferred statements can be expressed with calibrated certainty.
- Require **probabilistic language** for inference (`likely`, `appears to`, `suggests`) and avoid deterministic claims when evidence is sparse.
- Ask the LLM to include **brief context glosses** for niche terms (example: “Series A” = early startup funding stage).
- Ask for **inline evidence references** in prose using short quote snippets from source posts/comments.
- User picks **Real** (3 analyst sections) or **Comedy** (single `AI's Take`, 3–5 paragraphs, one LLM pass each).
- Add a durable server-side LLM debug log at `apps/api/logs/ai-summary-llm.log` capturing provider/model/endpoint/status/latency/error body snippets for Ollama troubleshooting.

---

## Product intent

Help users see a **readable narrative** of what their activity suggests about them (and later, about their social circle), derived from **real posts and interactions** in SocialMediaLite—not from a generic personality quiz.

Each time the user taps a summary action, the system:

1. **Collects** activity into a **structured, bounded JSON** dossier (no raw image bytes to the model in v1).
2. **Calls an LLM** with a fixed prompt + schema instructions.
3. **Stores** the result as a new row in **AI summaries** on their profile.
4. **Displays** a **grid** of past runs (newest first): scope label, created time, excerpt, expand to full report.

The user can re-run anytime; each run is a **new row** (history), not an overwrite.

---

## Phased delivery

| Phase | Scope | UI trigger | Subject of analysis |
|-------|--------|------------|------------------------|
| **A (MVP)** | `SELF` | **Things about me** | Current user only |
| **B** | `FRIENDS_ALL` | **Things about your friends** | Accepted friends, aggregated |
| **C** | `FRIEND_ONE` | **Things about @{username}** | One friend (picker or profile action) |

Phase A is the only work item for the first implementation slice.

---

## Signal sources (what the aggregator should extract)

All signals are computed **server-side** from Postgres. The LLM receives **summaries and exemplars**, not full DB dumps.

### From the user’s own posts (wall = `profileOwnerId = self`)

| Signal | Source | Notes |
|--------|--------|--------|
| **Post type mix** | `Post.type` | Counts/ratios: TEXT, PHOTO, VIDEO_LINK, REEL |
| **Posting cadence** | `Post.createdAt` | Posts per week/month; streaks; quiet periods |
| **Pinned emphasis** | `Post.isPinned` | What they chose to highlight |
| **Text themes** | `Post.text`, `photoCaption`, `linkTitle`, `linkDescription` | Keyword clusters / simple topic buckets (v1: TF-IDF or top n-grams; v2: embeddings) |
| **Repeated subjects** | Same as above | Topics with **high count + long captions** → “more passionate” proxy |
| **Link interests** | `videoUrl`, `linkTitle`, domains | Domains and OG titles they share |
| **Friends-feed sharing** | `sharedToFriendsFeed` | What they broadcast vs keep on wall only |
| **Text post styling** | `textBackgroundColor`, `textFontSize` | Optional flavor (“often uses styled text posts”) |

### From the user’s comments

| Signal | Source | Notes |
|--------|--------|--------|
| **Who they comment on** | `Comment` + `Post.profileOwnerId` | Friends vs self-wall vs others |
| **Comment volume** | Per friend / per month | Engagement breadth |
| **Comment tone proxy** | `Comment.text` length, question marks, etc. | Light heuristics only in v1 |

### From reactions (`PostReaction`)

| Signal | Source | Notes |
|--------|--------|--------|
| **Reaction mix** | `PostReaction.kind` on posts they reacted to | love / care / agree / disagree / etc. |
| **Disagree with details** | `PostReaction.details` where kind = disagree | Themes they push back on (redact PII in prompt) |
| **Posts they engage with** | Join reaction → post → author, link domains, post types | “Interest” proxy: if they react, the topic mattered |

### From posts **on the user’s wall** by others (incoming)

| Signal | Source | Notes |
|--------|--------|--------|
| **Who posts on their wall** | `Post.authorId` where `profileOwnerId = self` | Core friend circle |
| **Incoming vs outgoing** | Compare author vs owner | Social balance |

### Phase B/C additions (not MVP)

- **Friends aggregate:** roll up the same signals per friend, then meta-summary (“your friends as a group tend to…”).
- **Friend X:** same dossier as Phase A but `userId = friend`, only if viewer is accepted friend (or self).

---

## Structured payload (LLM input)

Define a versioned JSON schema, e.g. `AiSummaryInputV1`, built by `buildSelfSummaryInput(userId)`.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-28T12:00:00.000Z",
  "scope": "SELF",
  "subject": {
    "userId": "…",
    "username": "testuser",
    "displayName": "Test User",
    "memberSince": "2026-02-01T00:00:00.000Z"
  },
  "window": {
    "from": "2025-01-01T00:00:00.000Z",
    "to": "2026-05-28T12:00:00.000Z",
    "postCount": 42,
    "commentCount": 18,
    "reactionCount": 55
  },
  "postTypeBreakdown": { "TEXT": 10, "PHOTO": 20, "VIDEO_LINK": 8, "REEL": 4 },
  "cadence": {
    "postsPerMonthAvg": 3.2,
    "longestQuietDays": 45,
    "mostActiveMonth": "2026-03"
  },
  "topTopics": [
    { "label": "ski / mammoth / outdoors", "postCount": 6, "avgCaptionLength": 120 },
    { "label": "family", "postCount": 4, "avgCaptionLength": 80 }
  ],
  "samplePosts": [
    {
      "date": "2026-06-01",
      "type": "VIDEO_LINK",
      "snippet": "…",
      "linkDomain": "mammothmountain.com"
    }
  ],
  "commentPatterns": {
    "commentsOnFriendsWalls": 12,
    "topCommentedFriends": [{ "username": "glowbyte", "count": 5 }]
  },
  "reactionPatterns": {
    "byKind": { "love": 10, "care": 3, "agree": 8 },
    "topReactedDomains": ["youtube.com", "mammothmountain.com"]
  },
  "pinnedPost": { "type": "PHOTO", "snippet": "…" }
}
```

**Limits (cost + safety):**

- Cap `samplePosts` / `sampleComments` (e.g. 30 each), prefer recent + diverse topics.
- Truncate snippets (e.g. 300 chars).
- Never send `photoKey` binary; optional one-line “photo post about …” from caption only.

Store the exact JSON sent (`inputSnapshot`) on the summary row for audit/debug.

---

## LLM layer

### Provider interface

`packages/shared` or `apps/api/src/services/llm/`:

```ts
interface LlmProvider {
  complete(params: { system: string; user: string }): Promise<{ text: string }>;
}
```

Implementations (env `LLM_PROVIDER`):

- `openai` — production default
- `stub` — deterministic markdown for dev/tests without API keys

Env: `OPENAI_API_KEY`, `LLM_MODEL` (e.g. `gpt-4o-mini`), optional `LLM_MAX_TOKENS`.

### Prompt shape (MVP)

- **System:** You are writing a warm, specific “things about this person” report for their private profile. Use only provided data. No medical/legal claims. No invented facts. Sections: Interests, How they show up, Social patterns, Surprises / contradictions (if any).
- **User:** Pretty-printed `AiSummaryInputV1` JSON.
- **Output:** Markdown narrative (~400–800 words), stored in `narrativeMarkdown`.

### Job execution

- **Synchronous MVP:** button → API runs aggregate + LLM → returns row (may take 10–30s; show spinner).
- **Later:** background job + polling if timeouts become an issue.

---

## Data model

```prisma
enum AiSummaryScope {
  SELF
  FRIENDS_ALL
  FRIEND_ONE
}

model AiProfileSummary {
  id              String         @id @default(uuid())
  /// Who requested / owns this report (always the viewer in MVP).
  ownerUserId     String
  /// What was analyzed (SELF = owner; FRIEND_ONE = targetUserId).
  scope           AiSummaryScope
  targetUserId    String?        // null for SELF and FRIENDS_ALL
  /// e.g. "Things about me"
  buttonLabel     String
  inputSnapshot   Json           // AiSummaryInputV1
  narrativeMarkdown String       @db.Text
  model           String?        // e.g. gpt-4o-mini
  promptVersion   String         // e.g. self-v1
  status          String         // pending | complete | failed
  errorMessage    String?
  createdAt       DateTime       @default(now())

  owner           User           @relation(...)
  target          User?          @relation(...)

  @@index([ownerUserId, createdAt(sort: Desc)])
}
```

**Retention:** keep all rows (grid history). Optional later: prune > N or older than 90 days.

---

## API (MVP)

Prefix `/api`, auth required.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/me/ai-summaries` | Body `{ scope: "SELF" }` → aggregate, LLM, insert row, return summary |
| `GET` | `/api/me/ai-summaries` | List owner’s summaries (newest first), paginated |
| `GET` | `/api/me/ai-summaries/:id` | Full narrative + metadata |

Phase B/C:

- `POST` with `scope: "FRIENDS_ALL"` or `{ scope: "FRIEND_ONE", username: "glowbyte" }`
- Authorization: `FRIEND_ONE` only if accepted friendship exists.

**Rate limit (recommended):** e.g. 3 runs per user per hour to control LLM cost.

---

## UI — profile “AI summaries”

Placement: **own profile only** (MVP), new section below friends sidebar or as a tab **“AI summaries”**.

### Controls

- Primary button: **Things about me** → `POST /api/me/ai-summaries` with `scope: SELF`.
- Disabled + tooltip while generating; show error toast on failure.

### Grid (one row per button push)

| Column | Content |
|--------|---------|
| **When** | `createdAt` relative + absolute |
| **Scope** | `buttonLabel` (“Things about me”) |
| **Status** | complete / failed / pending |
| **Preview** | First ~200 chars of narrative |
| **Action** | Expand / “Read full report” |

Expanded view: render `narrativeMarkdown` (markdown component).

Phase B: second button **Things about your friends** (same grid, different `scope`).

Phase C: on friend’s profile (if friends), **Things about @{username}** → `FRIEND_ONE`.

---

## Server modules (suggested layout)

```
apps/api/src/services/aiSummary/
  aggregateSelf.ts      # build AiSummaryInputV1 for userId
  aggregateFriends.ts   # phase B
  aggregateFriendOne.ts # phase C
  topicBuckets.ts       # simple keyword / n-gram clustering
  prompts.ts            # system + promptVersion constants
  runSummary.ts         # orchestrate aggregate → llm → prisma create
apps/api/src/services/llm/
  provider.ts
  openai.ts
  stub.ts
apps/api/src/routes/aiSummaries.ts
```

---

## Privacy and safety

- Reports are **private to `ownerUserId`** unless explicitly shared later (out of scope).
- Do not expose another user’s dossier to non-friends (Phase C).
- Strip or avoid sending email, tokens, session ids in `inputSnapshot`.
- LLM instructions: no diagnosis, no harassment, no revealing other users’ private details beyond what’s needed for “things about your friends” aggregate (Phase B: prefer aggregated stats over quoting friend post text).
- Log prompt version + model, not full narrative in production logs.

---

## Testing

- **Unit:** `buildSelfSummaryInput` with fixture posts/comments/reactions (in-memory or Prisma mock).
- **Unit:** `stub` LLM returns fixed markdown; assert row `status = complete`.
- **Integration:** authenticated `POST` creates row; `GET` list returns it.
- **Snapshot:** optional golden file for `AiSummaryInputV1` shape.

---

## Configuration (.env.example)

See repo root `.env.example` and **`docs/OLLAMA_VPS_SETUP.md`** (install Ollama on Linux VPS, small models, swap, security).

```env
LLM_PROVIDER=stub
# LLM_PROVIDER=openai-compatible
# LLM_BASE_URL=http://127.0.0.1:11434/v1
# LLM_API_KEY=ollama
LLM_MODEL=llama3.2:3b
OPENAI_API_KEY=
AI_SUMMARY_MAX_POST_SAMPLES=30
AI_SUMMARY_RATE_LIMIT_PER_HOUR=3
```

---

## Milestones (implementation order)

1. Prisma model + migration + stub LLM provider.
2. `aggregateSelf` + `AiSummaryInputV1` types in `packages/shared`.
3. `POST/GET` routes + `runSummary` orchestration.
4. Profile UI: button + summaries grid + expand narrative.
5. OpenAI provider + prompt tuning on real data.
6. Phase B: friends aggregate + second button.
7. Phase C: per-friend scope + friend profile entry point.

---

## Open questions (decide before build)

- **Time window:** all-time vs last 12 months (recommend last 12 months with “all-time stats” footer).
- **Topic clustering:** n-grams only (MVP) vs embedding cluster (v2).
- **Glowbyte / AI friend posts:** include or exclude bot-authored content from “about me”?
- **Minimum data:** require at least N posts before allowing run, or allow “not enough data yet” narrative.

---

## Relation to Phase 1

Phase 1 delivers the **activity graph** (posts, comments, reactions, friends). This feature is a **Phase 2+** consumer of that graph, documented here for a single implementation track.
