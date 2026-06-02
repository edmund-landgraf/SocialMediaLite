# SocialMediaLite — documentation index

## Phase 1 (shipped / in progress)

| Doc | Description |
|---|---|
| [PHASE1_GOALS.md](PHASE1_GOALS.md) | Core product goals for the personal-page MVP |
| [plan/socialmedialite_phase_1_ee37fff4.plan.md](plan/socialmedialite_phase_1_ee37fff4.plan.md) | Original Phase 1 implementation checklist + architecture |
| [FACEBOOK_LOGIN_SETUP.md](FACEBOOK_LOGIN_SETUP.md) | Meta app + OAuth configuration for production login |

## Phase 2 — AI features (planned, not implemented)

Both features use the same **hybrid pattern**: Ollama parses natural language → deterministic Postgres tools return facts → Ollama (optional) writes the user-facing reply. Shared config: `OLLAMA_URL`, `OLLAMA_MODEL` in `.env`.

| Doc | Description |
|---|---|
| [plan/ai-profile-summaries.plan.md](plan/ai-profile-summaries.plan.md) | **AI profile summaries** — “Things about me” (then friends) via structured activity + LLM |
| [OLLAMA_VPS_SETUP.md](OLLAMA_VPS_SETUP.md) | Install Ollama on Linux VPS, hardware sizing, env vars, security |
| [AI_ADD_KNOWLEDGE.md](AI_ADD_KNOWLEDGE.md) | **AI Add** on own posts → profile knowledge base + hybrid profile chatbot |
| [FRIEND_SELECT_CHAT.md](FRIEND_SELECT_CHAT.md) | Split-pane **friend select chat** — describe filters left, matching friends right |
| [FB_TO_SML_SHARE_LINK.md](FB_TO_SML_SHARE_LINK.md) | **FB → SML share link** — public `/join/{token}` page with OG metadata for Facebook crawlers |
| [PUSH_TO_FB.md](PUSH_TO_FB.md) | **Push to FB** — share SML post to Facebook (Share Dialog v1, Page API v2) |
| [FB_EXPORT_REPLICATION.md](FB_EXPORT_REPLICATION.md) | **FB-ID export/replication** — feasibility, stable keys, Meta API limits |
| [FB_IMPORT_SPEC.md](FB_IMPORT_SPEC.md) | **Import bundle spec** — upsert rules, `Guest (1…n)` for unmatched authors |

### Shared infrastructure (when built)

| Module | Purpose |
|---|---|
| `apps/api/src/services/llmClient.ts` | Ollama HTTP client; graceful no-LLM fallback |
| `packages/shared` | Zod schemas for filters / API payloads |

### Implementation order (suggested)

1. `llmClient.ts` + `.env.example` entries
2. AI Add Phase 1a (ingest + button)
3. Friend Select Phase 1a (structural filters + split UI)
4. FB → SML share link Phase 1a (public `/join/` OG pages)
5. Push to FB Phase 1 (Share Dialog + join URL)
6. AI Add Phase 2 (hybrid profile chat)
7. Push to FB Phase 2 (Facebook Page Graph API)
8. Friend Select Phase 1b (profile fields + keyword search)
