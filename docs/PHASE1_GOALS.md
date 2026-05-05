# SocialMediaLite — Phase 1 goals

Full implementation plan (checklist + architecture): `docs/plan/socialmedialite_phase_1_ee37fff4.plan.md`.

- Stub Facebook OAuth / dev identity → personal profile pages (no global feed).
- Timeline: **text**, **photos** (compression + size policy), **shared links**.
- Shared links accept **any `http(s)` URL** (video pages, articles, storefronts, etc.).
- **URL preview**: server resolves Open Graph / basic HTML metadata (title, short description).
- Preview **hero image**: fetched server-side, **resized/cropped to a fixed aspect and dimensions**, stored alongside the post (consistent card layout—blank/neutral placeholder when no usable image).
- Friends, commenting, posting on friends’ pages, one pinned post per page, banner + stub FB profile frame.
