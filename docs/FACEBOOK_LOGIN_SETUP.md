# Facebook Login Setup (SocialMediaLite)

This guide sets up real Facebook Login for `SocialMediaLite` with scope limited to:

- User display name
- User email
- User profile picture

## 1) Create a Meta app

1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Create App.
3. App Name: `SocialMediaLite`.
4. App Type: choose **Consumer** (or equivalent login-focused type offered in the current UI).
5. Add the **Facebook Login** product.

## 2) Configure Facebook Login settings

In **Facebook Login > Settings**:

1. Add Valid OAuth Redirect URI(s):
   - Local dev example: `http://localhost:3000/api/auth/facebook/callback`
   - If web and API ports differ, use your API callback URL.
2. Keep **Client OAuth Login** enabled.
3. Keep **Web OAuth Login** enabled.
4. Enforce HTTPS for non-local environments.

## 3) Add required permissions/scopes

For this phase, request:

- `public_profile`
- `email`

These are enough to read:

- Name (`name`)
- Email (`email`)
- Profile picture (`picture`)

## 4) Configure app domains and privacy links

In **App Settings > Basic**:

1. Add App Domains: `unwhelm.online` only (Meta does **not** allow `localhost` in App Domains; localhost OAuth redirect URIs are auto-allowed in Development mode).
2. Set **Privacy Policy URL**: `https://unwhelm.online/help/privacy.html`
3. Set **User data deletion URL**: `https://unwhelm.online/help/data-deletion.html`
4. Set Terms of Service URL (optional; can point at privacy page until you add terms).
5. Select a category (e.g. Social).

Static pages live in `apps/web/public/help/` and deploy with the nginx static bundle.

These are required on the Meta **Publish** checklist before Live mode and App Review.

## 5) Add environment variables to SocialMediaLite

Add to your API environment file (example names):

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_REDIRECT_URI`

Optional:

- `FACEBOOK_GRAPH_API_VERSION` (example `v20.0`)

## 6) OAuth flow to implement in backend

1. User clicks **Login with Facebook**.
2. Backend redirects user to Facebook OAuth dialog:
   - `scope=public_profile,email`
3. Facebook redirects back to callback with `code`.
4. Backend exchanges `code` for an access token.
5. Backend fetches profile from Graph API:
   - `GET /me?fields=id,name,email,picture.type(large)`
6. Upsert user with:
   - `fbUserId = id`
   - `displayName = name`
   - `email = email`
   - `profilePicUrl = picture.data.url`
7. Create session and redirect to profile page.

## 7) Graph API calls (reference)

Token exchange:

- `GET https://graph.facebook.com/v20.0/oauth/access_token`
  - `client_id`
  - `client_secret`
  - `redirect_uri`
  - `code`

Profile fetch:

- `GET https://graph.facebook.com/v20.0/me?fields=id,name,email,picture.type(large)&access_token=...`

## 8) Test users for development

In Meta app roles/tools, create Facebook test users and validate:

- First-time login creates user record.
- Repeat login updates `displayName`, `email`, and `profilePicUrl`.
- Session is created correctly.
- Logout clears session.

## 9) Go-live checklist

- Switch app from Development to Live when ready.
- Verify approved permissions match requested scope.
- Confirm redirect URIs for production.
- Confirm privacy/terms URLs are valid.

---

Implementation scope for this phase remains intentionally limited to profile name, email, and profile picture via `public_profile,email`.

---

See also: [README.md](README.md) (documentation index).
