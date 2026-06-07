import { isFacebookShareableLink } from "./postSyndication.js";

const FACEBOOK_SHARE_DIALOG = "https://www.facebook.com/dialog/share";

export function getFacebookShareDialogAppId(): string | null {
  return process.env.FACEBOOK_APP_ID?.trim() || null;
}

export function buildFacebookShareDialogUrl(input: {
  href: string;
  redirectUri: string;
  quote?: string;
}): string | null {
  const appId = getFacebookShareDialogAppId();
  if (!appId) return null;

  const url = new URL(FACEBOOK_SHARE_DIALOG);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("display", "page");
  url.searchParams.set("href", input.href);
  url.searchParams.set("redirect_uri", input.redirectUri);
  if (input.quote?.trim()) {
    url.searchParams.set("quote", input.quote.trim());
  }
  return url.toString();
}

function isLocalDevHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Share Dialog `redirect_uri` must be on a domain in App Domains (e.g. unwhelm.online).
 * Localhost is rejected even when listed as a Valid OAuth Redirect URI.
 */
export function resolveFacebookShareRedirectUri(): string {
  const explicit = process.env.FACEBOOK_SHARE_REDIRECT_URI?.trim();
  if (explicit && !isLocalDevHost(explicit)) return explicit;

  const oauthRedirect = process.env.FACEBOOK_REDIRECT_URI?.trim();
  if (oauthRedirect && !isLocalDevHost(oauthRedirect)) return oauthRedirect;

  const publicBase = process.env.SYNDICATION_PUBLIC_BASE_URL?.trim();
  if (publicBase && !isLocalDevHost(publicBase)) {
    return `${publicBase.replace(/\/+$/, "")}/`;
  }

  return "https://unwhelm.online/";
}

/** Pick href + quote for timeline share (public HTTPS link when available). */
export function buildSyndicationFacebookSharePayload(input: {
  pageUrl: string;
  viewUrl?: string;
  message: string;
}): { href: string; redirectUri: string; quote: string } {
  const viewUrl = input.viewUrl ?? input.pageUrl;
  const href = isFacebookShareableLink(input.pageUrl) ? input.pageUrl : viewUrl;
  const linkForText = isFacebookShareableLink(input.pageUrl) ? input.pageUrl : viewUrl;
  const quote = `${input.message}\n\n${linkForText}`;
  return {
    href,
    redirectUri: resolveFacebookShareRedirectUri(),
    quote,
  };
}
