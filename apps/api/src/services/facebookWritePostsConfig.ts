/**
 * OAuth scopes for WritePostsOnly.
 * Meta Login for Business often auto-bundles pages_read_engagement with Manage Pages —
 * it must be added on the app (Ready for testing) even if we only need write/publish.
 */
export const FB_WRITE_POSTS_SCOPE =
  "pages_show_list,pages_manage_posts,pages_read_engagement";

export type FacebookWritePostsConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  /** Facebook Login for Business configuration — avoids bundled invalid scopes like pages_read_engagement. */
  configId: string | null;
};

function getFacebookWritePostsRedirectUri(): string {
  const explicit = process.env.FACEBOOK_WRITE_POSTS_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const webOrigin = process.env.WEB_ORIGIN?.trim() || "http://localhost:5174";
  return `${webOrigin.replace(/\/+$/, "")}/api/auth/facebook/pages/callback`;
}

export function getFacebookWritePostsConfig(): FacebookWritePostsConfig | null {
  const appId = process.env.FACEBOOK_WRITE_POSTS_APP_ID?.trim() ?? "";
  const appSecret = process.env.FACEBOOK_WRITE_POSTS_APP_SECRET?.trim() ?? "";
  const redirectUri = getFacebookWritePostsRedirectUri();
  const graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
  const configId = process.env.FACEBOOK_WRITE_POSTS_CONFIG_ID?.trim() || null;
  if (!appId || !appSecret) return null;
  return { appId, appSecret, redirectUri, graphVersion, configId };
}

export function isFacebookWritePostsConfigured(): boolean {
  return getFacebookWritePostsConfig() != null;
}

/** Build Meta OAuth dialog URL. Prefer config_id (Login for Business); else plain scope list. */
export function buildFacebookWritePostsOAuthUrl(
  config: FacebookWritePostsConfig,
  params: { state: string },
): string {
  const dialogUrl = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  dialogUrl.searchParams.set("client_id", config.appId);
  dialogUrl.searchParams.set("redirect_uri", config.redirectUri);
  dialogUrl.searchParams.set("state", params.state);
  dialogUrl.searchParams.set("response_type", "code");

  if (config.configId) {
    dialogUrl.searchParams.set("config_id", config.configId);
  } else {
    dialogUrl.searchParams.set("scope", FB_WRITE_POSTS_SCOPE);
  }

  return dialogUrl.toString();
}
