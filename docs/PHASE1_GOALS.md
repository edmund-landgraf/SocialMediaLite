# SocialMediaLite — Phase 1 goals

Full implementation plan (checklist + architecture): [plan/socialmedialite_phase_1_ee37fff4.plan.md](plan/socialmedialite_phase_1_ee37fff4.plan.md).

## Core MVP

- Stub Facebook OAuth / dev identity → personal profile pages (no global feed).
- Timeline: **text**, **photos** (compression + size policy), **shared links**.
- Shared links accept **any `http(s)` URL** (video pages, articles, storefronts, etc.).
- **URL preview**: server resolves Open Graph / basic HTML metadata (title, short description).
- Preview **hero image**: fetched server-side, **resized/cropped to a fixed aspect and dimensions**, stored alongside the post (consistent card layout—blank/neutral placeholder when no usable image).
- Friends, commenting, posting on friends’ pages, one pinned post per page, banner + stub FB profile frame.
- Friends feed review (Unread / Read / Saved / Discarded buckets).
- Text post styling (background, text color, font size).

## Phase 2 — planned AI features

Documented separately; **not yet implemented**. See [README.md](README.md).

| Feature | Doc | Summary |
|---|---|---|
| AI Add + profile chatbot | [AI_ADD_KNOWLEDGE.md](AI_ADD_KNOWLEDGE.md) | Author adds own post + comments to a KB; hybrid chat answers wall/KB questions |
| Friend select chat | [FRIEND_SELECT_CHAT.md](FRIEND_SELECT_CHAT.md) | Split-pane NL friend filter over accepted friends |
| FB → SML share link | [FB_TO_SML_SHARE_LINK.md](FB_TO_SML_SHARE_LINK.md) | Public join URL with OG tags for Facebook profile links |
| Push to FB | [PUSH_TO_FB.md](PUSH_TO_FB.md) | Push SML post to Facebook (share dialog or Page API) |
| FB export / import | [FB_EXPORT_REPLICATION.md](FB_EXPORT_REPLICATION.md), [FB_IMPORT_SPEC.md](FB_IMPORT_SPEC.md) | Export bundles + import with Guest (1…n) |

Both AI features use **local Ollama** (cheapest) and **SQL tools** for factual queries — no vector DB at early scale.

The share link feature uses **server-rendered HTML** at `/join/{token}` — no LLM required.

## Other docs

- [FACEBOOK_LOGIN_SETUP.md](FACEBOOK_LOGIN_SETUP.md) — production Facebook Login
