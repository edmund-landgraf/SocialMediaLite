import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildFacebookShareDialogUrl,
  buildSyndicationFacebookSharePayload,
  resolveFacebookShareRedirectUri,
} from "./facebookShareDialog.js";

describe("resolveFacebookShareRedirectUri", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("skips localhost FACEBOOK_REDIRECT_URI and uses public base", () => {
    process.env.FACEBOOK_REDIRECT_URI = "http://localhost:3001/api/auth/facebook/callback";
    process.env.SYNDICATION_PUBLIC_BASE_URL = "https://unwhelm.online";
    delete process.env.FACEBOOK_SHARE_REDIRECT_URI;
    expect(resolveFacebookShareRedirectUri()).toBe("https://unwhelm.online/");
  });

  it("uses FACEBOOK_SHARE_REDIRECT_URI when set to production HTTPS", () => {
    process.env.FACEBOOK_SHARE_REDIRECT_URI = "https://unwhelm.online/api/auth/facebook/callback";
    expect(resolveFacebookShareRedirectUri()).toBe(
      "https://unwhelm.online/api/auth/facebook/callback",
    );
  });
});

describe("buildSyndicationFacebookSharePayload", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.FACEBOOK_REDIRECT_URI = "http://localhost:3001/api/auth/facebook/callback";
    process.env.SYNDICATION_PUBLIC_BASE_URL = "https://unwhelm.online";
    delete process.env.FACEBOOK_SHARE_REDIRECT_URI;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("uses public HTTPS href and production redirect_uri when testing on localhost", () => {
    const payload = buildSyndicationFacebookSharePayload({
      pageUrl: "https://unwhelm.online/syndicate/abc",
      viewUrl: "http://localhost:3001/syndicate/abc",
      message: "Hello from SML",
    });
    expect(payload.href).toBe("https://unwhelm.online/syndicate/abc");
    expect(payload.redirectUri).toBe("https://unwhelm.online/");
    expect(payload.quote).toContain("Hello from SML");
    expect(payload.quote).toContain("https://unwhelm.online/syndicate/abc");
  });

  it("falls back to viewUrl for href when pageUrl is localhost", () => {
    const payload = buildSyndicationFacebookSharePayload({
      pageUrl: "http://localhost:3001/syndicate/abc",
      viewUrl: "http://localhost:3001/syndicate/abc",
      message: "Local post",
    });
    expect(payload.href).toBe("http://localhost:3001/syndicate/abc");
    expect(payload.redirectUri).toBe("https://unwhelm.online/");
    expect(payload.quote).toContain("http://localhost:3001/syndicate/abc");
  });
});

describe("buildFacebookShareDialogUrl", () => {
  const prev = process.env.FACEBOOK_APP_ID;

  beforeEach(() => {
    process.env.FACEBOOK_APP_ID = "123456789";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.FACEBOOK_APP_ID;
    else process.env.FACEBOOK_APP_ID = prev;
  });

  it("builds dialog/share with app_id, href, redirect_uri, and quote", () => {
    const url = buildFacebookShareDialogUrl({
      href: "https://unwhelm.online/syndicate/tok",
      redirectUri: "https://unwhelm.online/",
      quote: "Check this out",
    });
    expect(url).toContain("facebook.com/dialog/share");
    expect(url).toContain("app_id=123456789");
    expect(url).toContain("href=");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("quote=");
  });

  it("returns null without FACEBOOK_APP_ID", () => {
    delete process.env.FACEBOOK_APP_ID;
    expect(
      buildFacebookShareDialogUrl({
        href: "https://example.com",
        redirectUri: "https://example.com",
      }),
    ).toBeNull();
  });
});
