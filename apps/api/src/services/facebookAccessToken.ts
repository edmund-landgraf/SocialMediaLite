import { logFacebookLoginApp } from "./facebookAppLog.js";

function graphVersion(): string {
  return process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v20.0";
}

export type FacebookImportTokenProbe =
  | { ok: true }
  | { ok: false; reason: string; expired?: boolean };

/**
 * Verifies the session token can read timeline posts (user_posts scope).
 * Used to skip a second OAuth when the user already authorized import.
 */
export async function probeFacebookImportAccessToken(
  accessToken: string,
): Promise<FacebookImportTokenProbe> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/me/posts`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("fields", "id");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { method: "GET" });
  if (res.ok) {
    void logFacebookLoginApp({
      action: "graph.me_posts.probe",
      graphEndpoint: "/me/posts",
      httpStatus: res.status,
      success: true,
    });
    return { ok: true };
  }

  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: number; type?: string };
    };
    const err = parsed.error;
    const message = err?.message ?? `HTTP ${res.status}`;
    if (err?.code === 190) {
      void logFacebookLoginApp({
        action: "graph.me_posts.probe",
        graphEndpoint: "/me/posts",
        httpStatus: res.status,
        success: false,
        error: message,
        meta: { expired: true },
      });
      return {
        ok: false,
        expired: true,
        reason: "Facebook session expired. Sign in with Facebook again.",
      };
    }
    if (err?.code === 10 || err?.code === 200 || err?.type === "OAuthException") {
      void logFacebookLoginApp({
        action: "graph.me_posts.probe",
        graphEndpoint: "/me/posts",
        httpStatus: res.status,
        success: false,
        error: message,
      });
      return {
        ok: false,
        reason:
          "Timeline import needs permission to read your Facebook posts. Connect once to enable import.",
      };
    }
    void logFacebookLoginApp({
      action: "graph.me_posts.probe",
      graphEndpoint: "/me/posts",
      httpStatus: res.status,
      success: false,
      error: message,
    });
    return { ok: false, reason: message };
  } catch {
    void logFacebookLoginApp({
      action: "graph.me_posts.probe",
      graphEndpoint: "/me/posts",
      success: false,
      error: "invalid_json",
    });
    return { ok: false, reason: "Could not verify Facebook access." };
  }
}
