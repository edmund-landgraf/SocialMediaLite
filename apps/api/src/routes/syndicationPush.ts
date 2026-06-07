import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { logFacebookWritePostsApp } from "../services/facebookAppLog.js";
import { getFacebookWritePostsConfig } from "../services/facebookWritePostsConfig.js";
import { loadSyndicationPushContext } from "../services/syndicationPush/context.js";
import { publishSyndicationToFacebookPage } from "../services/syndicationPush/publish.js";
import {
  getSyndicationPushProvider,
  listSyndicationPushPartnerMeta,
} from "../services/syndicationPush/registry.js";

const tokenSchema = z.string().trim().min(8).max(64);

function syndicationReturnPath(token: string, params?: Record<string, string>): string {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `/syndicate/${token}${qs}`;
}

function redirectSyndicationPage(res: Response, token: string, params?: Record<string, string>) {
  res.redirect(303, syndicationReturnPath(token, params));
}

async function completeFacebookPagePublish(
  req: Request,
  res: Response,
  syndicationToken: string,
  page: { pageId: string; pageName: string; pageAccessToken: string },
) {
  const { fbPostId, pageName } = await publishSyndicationToFacebookPage(req, syndicationToken, page);

  req.session.facebookWritePostsPage = page;

  void logFacebookWritePostsApp({
    action: "syndication.page_publish",
    requestPath: req.path,
    success: true,
    syndicationToken,
    fbPageId: page.pageId,
    fbPageName: pageName,
    fbPostId,
  });

  redirectSyndicationPage(res, syndicationToken, {
    fbPush: "success",
    fbPage: pageName,
    fbPostId,
  });
}

export const syndicationPushRouter = Router();

syndicationPushRouter.get("/syndication-push/partners", (_req, res) => {
  res.json({ partners: listSyndicationPushPartnerMeta() });
});

/**
 * One-click automated push: uses cached Page token when present, otherwise WritePostsOnly OAuth once.
 */
syndicationPushRouter.get("/syndication-push/:partnerId/push", async (req, res) => {
  const partner = getSyndicationPushProvider(req.params.partnerId);
  if (!partner?.isConfigured()) {
    void logFacebookWritePostsApp({
      action: "syndication.page_publish",
      requestPath: req.path,
      success: false,
      error: "not_configured",
    });
    const tokenForRedirect = tokenSchema.safeParse(req.query.token);
    if (tokenForRedirect.success) {
      redirectSyndicationPage(res, tokenForRedirect.data, {
        fbPush: "error",
        reason: "Push to Facebook is not configured (set FACEBOOK_WRITE_POSTS_* in .env and restart API)",
      });
      return;
    }
    res.status(503).send("Push to Facebook is not configured (set FACEBOOK_WRITE_POSTS_* in .env)");
    return;
  }

  const tokenParsed = tokenSchema.safeParse(req.query.token);
  if (!tokenParsed.success) {
    res.status(400).send("Invalid syndication token");
    return;
  }

  const ctx = await loadSyndicationPushContext(req, tokenParsed.data);
  if (!ctx) {
    res.status(404).send("Syndication not found");
    return;
  }

  const syndicationToken = tokenParsed.data;
  const cachedPage = req.session.facebookWritePostsPage;

  if (cachedPage?.pageAccessToken) {
    try {
      await completeFacebookPagePublish(req, res, syndicationToken, cachedPage);
      return;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Page publish failed";
      void logFacebookWritePostsApp({
        action: "syndication.page_publish",
        requestPath: req.path,
        success: false,
        syndicationToken,
        error: reason,
        meta: { cachedPage: true },
      });
      delete req.session.facebookWritePostsPage;
      // Fall through to OAuth — token may have expired.
    }
  }

  const oauthUrl = partner.beginPageOAuth(req, ctx);
  if (!oauthUrl) {
    res.status(503).send("OAuth is not configured for this partner");
    return;
  }

  void logFacebookWritePostsApp({
    action: "syndication.page_oauth.start",
    requestPath: req.path,
    success: true,
    syndicationToken,
    meta: { partnerId: partner.id, reason: "no_cached_page_token" },
  });
  res.redirect(302, oauthUrl);
});

/** Manual profile share fallback (opens Facebook UI). */
syndicationPushRouter.get("/syndication-push/:partnerId/share", async (req, res) => {
  const partner = getSyndicationPushProvider(req.params.partnerId);
  if (!partner) {
    res.status(404).send("Unknown syndication push partner");
    return;
  }

  const tokenParsed = tokenSchema.safeParse(req.query.token);
  if (!tokenParsed.success) {
    res.status(400).send("Invalid syndication token");
    return;
  }

  const ctx = await loadSyndicationPushContext(req, tokenParsed.data);
  if (!ctx) {
    res.status(404).send("Syndication not found");
    return;
  }

  const shareUrl = partner.buildShareDialogUrl(ctx);
  if (!shareUrl) {
    res.status(503).send(
      "Facebook timeline share is not configured (set FACEBOOK_APP_ID in .env and restart API)",
    );
    return;
  }

  void logFacebookWritePostsApp({
    action: "syndication.share_redirect",
    requestPath: req.path,
    success: true,
    syndicationToken: tokenParsed.data,
    meta: {
      partnerId: partner.id,
      pageUrl: ctx.pageUrl,
      viewUrl: ctx.viewUrl,
      shareUrl,
    },
  });
  res.redirect(302, shareUrl);
});

/** @deprecated Use /push — kept for direct links. */
syndicationPushRouter.get("/syndication-push/:partnerId/page/start", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  res.redirect(302, `/api/syndication-push/${req.params.partnerId}/push?token=${encodeURIComponent(token)}`);
});

export async function handleFacebookPagesOAuthCallback(req: Request, res: Response) {
  const partner = getSyndicationPushProvider("facebook");
  const config = getFacebookWritePostsConfig();
  const syndicationToken = req.session.syndicationPushToken;

  if (!partner?.isConfigured() || !config) {
    void logFacebookWritePostsApp({
      action: "syndication.page_oauth.callback",
      requestPath: req.path,
      success: false,
      error: "not_configured",
    });
    res.status(503).send("WritePostsOnly is not configured");
    return;
  }

  if (!syndicationToken) {
    void logFacebookWritePostsApp({
      action: "syndication.page_oauth.callback",
      requestPath: req.path,
      success: false,
      error: "missing_syndication_session",
    });
    res.status(400).send("Missing syndication push session — start from a syndication page");
    return;
  }

  const fbOAuthError = typeof req.query.error === "string" ? req.query.error : "";
  if (fbOAuthError) {
    const description =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : fbOAuthError;
    void logFacebookWritePostsApp({
      action: "syndication.page_oauth.callback",
      requestPath: req.path,
      success: false,
      syndicationToken,
      error: description,
    });
    redirectSyndicationPage(res, syndicationToken, {
      fbPush: "error",
      reason: description.slice(0, 200),
    });
    return;
  }

  const oauthState = req.session.syndicationPushOAuthState;
  const returnedState = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!oauthState || oauthState !== returnedState || !code) {
    void logFacebookWritePostsApp({
      action: "syndication.page_oauth.callback",
      requestPath: req.path,
      success: false,
      syndicationToken,
      error: "state_mismatch_or_missing_code",
    });
    redirectSyndicationPage(res, syndicationToken, {
      fbPush: "error",
      reason: "OAuth state mismatch or missing code",
    });
    return;
  }

  delete req.session.syndicationPushOAuthState;

  try {
    const userAccessToken = await partner.exchangeOAuthCode(code);
    const pages = await partner.listManagedPages(userAccessToken);
    if (pages.length === 0) {
      void logFacebookWritePostsApp({
        action: "syndication.page_oauth.callback",
        requestPath: req.path,
        success: false,
        syndicationToken,
        error: "no_managed_pages",
      });
      redirectSyndicationPage(res, syndicationToken, {
        fbPush: "error",
        reason:
          "No Facebook Pages found. Automated push requires a Page you manage (personal profile cannot be API-posted).",
      });
      return;
    }

    const page = pages[0]!;
    const storedPage = {
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.accessToken,
    };

    delete req.session.syndicationPushToken;
    delete req.session.syndicationPushPartnerId;

    await completeFacebookPagePublish(req, res, syndicationToken, storedPage);
  } catch (err) {
    console.error("facebook pages oauth callback failed:", err);
    const reason = err instanceof Error ? err.message : "Page publish failed";
    void logFacebookWritePostsApp({
      action: "syndication.page_oauth.callback",
      requestPath: req.path,
      success: false,
      syndicationToken,
      error: reason,
    });
    redirectSyndicationPage(res, syndicationToken, {
      fbPush: "error",
      reason: reason.slice(0, 200),
    });
  }
}
