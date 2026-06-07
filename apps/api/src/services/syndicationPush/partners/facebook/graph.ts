import { logFacebookWritePostsApp } from "../../../facebookAppLog.js";
import { isFacebookShareableLink } from "../../../postSyndication.js";
import {
  getFacebookWritePostsConfig,
  type FacebookWritePostsConfig,
} from "../../../facebookWritePostsConfig.js";

function parseFacebookGraphErrorBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string; code?: number; type?: string; error_subcode?: number };
    };
    const err = parsed.error;
    if (!err?.message) return trimmed.slice(0, 400);
    const parts = [err.message];
    if (err.code != null) parts.push(`code ${err.code}`);
    if (err.error_subcode != null) parts.push(`subcode ${err.error_subcode}`);
    if (err.type) parts.push(err.type);
    return parts.join(" · ");
  } catch {
    return trimmed.slice(0, 400);
  }
}

function graphRequestError(status: number, body: string, context: string): Error {
  const detail = parseFacebookGraphErrorBody(body);
  if (detail) return new Error(`${context}: ${detail}`);
  return new Error(`${context} (HTTP ${status})`);
}

export async function exchangeFacebookWritePostsCode(
  config: FacebookWritePostsConfig,
  code: string,
): Promise<string> {
  const tokenUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", config.appId);
  tokenUrl.searchParams.set("client_secret", config.appSecret);
  tokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  tokenUrl.searchParams.set("code", code);

  const res = await fetch(tokenUrl, { method: "GET" });
  const body = await res.text();
  if (!res.ok) {
    void logFacebookWritePostsApp({
      action: "graph.oauth.token_exchange",
      graphEndpoint: "/oauth/access_token",
      httpStatus: res.status,
      success: false,
      error: body.slice(0, 300),
    });
    throw graphRequestError(res.status, body, "Facebook token exchange failed");
  }
  let data: { access_token?: string; error?: { message?: string } };
  try {
    data = JSON.parse(body) as { access_token?: string; error?: { message?: string } };
  } catch {
    throw new Error("Facebook token exchange returned invalid JSON");
  }
  if (data.error?.message) {
    throw new Error(`Facebook token exchange failed: ${data.error.message}`);
  }
  if (!data.access_token) throw new Error("Facebook token missing from response");
  void logFacebookWritePostsApp({
    action: "graph.oauth.token_exchange",
    graphEndpoint: "/oauth/access_token",
    httpStatus: res.status,
    success: true,
  });
  return data.access_token;
}

type FacebookManagedPage = {
  id: string;
  name: string;
  access_token?: string;
};

export async function fetchFacebookManagedPages(
  userAccessToken: string,
): Promise<Array<{ id: string; name: string; accessToken: string }>> {
  const config = getFacebookWritePostsConfig();
  if (!config) throw new Error("WritePostsOnly app is not configured");

  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", userAccessToken);

  const res = await fetch(url, { method: "GET" });
  const body = await res.text();
  if (!res.ok) {
    void logFacebookWritePostsApp({
      action: "graph.me_accounts",
      graphEndpoint: "/me/accounts",
      httpStatus: res.status,
      success: false,
      error: body.slice(0, 300),
    });
    throw graphRequestError(res.status, body, "Facebook pages fetch failed");
  }

  const parsed = JSON.parse(body) as {
    data?: FacebookManagedPage[];
    error?: { message?: string };
  };
  if (parsed.error?.message) {
    void logFacebookWritePostsApp({
      action: "graph.me_accounts",
      graphEndpoint: "/me/accounts",
      httpStatus: res.status,
      success: false,
      error: parsed.error.message,
    });
    throw new Error(`Facebook pages fetch failed: ${parsed.error.message}`);
  }

  const pages = (parsed.data ?? [])
    .filter((row): row is FacebookManagedPage & { access_token: string } => !!row.id && !!row.access_token)
    .map((row) => ({
      id: row.id,
      name: row.name || row.id,
      accessToken: row.access_token,
    }));
  void logFacebookWritePostsApp({
    action: "graph.me_accounts",
    graphEndpoint: "/me/accounts",
    httpStatus: res.status,
    success: true,
    meta: { pageCount: pages.length },
  });
  return pages;
}

export async function publishFacebookPageFeedPost(input: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  link: string;
}): Promise<string> {
  const config = getFacebookWritePostsConfig();
  if (!config) throw new Error("WritePostsOnly app is not configured");

  let linkOmitted = false;
  const payload: Record<string, unknown> = {
    published: true,
    access_token: input.pageAccessToken,
  };

  if (isFacebookShareableLink(input.link)) {
    payload.message = input.message;
    payload.link = input.link;
  } else {
    // Graph rejects localhost / non-HTTPS link params (error 1500).
    payload.message = `${input.message}\n\n${input.link}`;
    linkOmitted = true;
  }

  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${input.pageId}/feed`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    void logFacebookWritePostsApp({
      action: "graph.page_feed.publish",
      graphEndpoint: `/${input.pageId}/feed`,
      httpStatus: res.status,
      success: false,
      fbPageId: input.pageId,
      error: body.slice(0, 300),
    });
    throw graphRequestError(res.status, body, "Facebook page publish failed");
  }

  const parsed = JSON.parse(body) as { id?: string; error?: { message?: string } };
  if (parsed.error?.message) {
    void logFacebookWritePostsApp({
      action: "graph.page_feed.publish",
      graphEndpoint: `/${input.pageId}/feed`,
      httpStatus: res.status,
      success: false,
      fbPageId: input.pageId,
      error: parsed.error.message,
    });
    throw new Error(`Facebook page publish failed: ${parsed.error.message}`);
  }
  if (!parsed.id) throw new Error("Facebook page publish returned no post id");
  void logFacebookWritePostsApp({
    action: "graph.page_feed.publish",
    graphEndpoint: `/${input.pageId}/feed`,
    httpStatus: res.status,
    success: true,
    fbPageId: input.pageId,
    fbPostId: parsed.id,
    meta: linkOmitted ? { linkOmitted: true } : { link: input.link },
  });
  return parsed.id;
}
