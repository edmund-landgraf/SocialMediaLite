import crypto from "node:crypto";
import type { Request } from "express";
import { logFacebookWritePostsApp } from "../../../facebookAppLog.js";
import {
  FB_WRITE_POSTS_SCOPE,
  buildFacebookWritePostsOAuthUrl,
  getFacebookWritePostsConfig,
  isFacebookWritePostsConfigured,
} from "../../../facebookWritePostsConfig.js";
import type { SyndicationPushProvider } from "../../types.js";
import {
  buildFacebookShareDialogUrl,
  buildSyndicationFacebookSharePayload,
} from "../../../facebookShareDialog.js";
import {
  exchangeFacebookWritePostsCode,
  fetchFacebookManagedPages,
  publishFacebookPageFeedPost,
} from "./graph.js";

export const facebookSyndicationPushProvider: SyndicationPushProvider = {
  id: "facebook",
  label: "Facebook",
  methods: ["share_dialog", "page_api"],

  isConfigured() {
    return isFacebookWritePostsConfigured();
  },

  getMeta() {
    const pageApi = this.isConfigured();
    return {
      id: "facebook",
      label: "Facebook",
      configured: pageApi,
      methods: pageApi ? this.methods : ["share_dialog"],
    };
  },

  buildShareDialogUrl(ctx) {
    const { href, redirectUri, quote } = buildSyndicationFacebookSharePayload({
      pageUrl: ctx.pageUrl,
      viewUrl: ctx.viewUrl,
      message: ctx.message,
    });
    return buildFacebookShareDialogUrl({ href, redirectUri, quote });
  },

  beginPageOAuth(req, ctx) {
    const config = getFacebookWritePostsConfig();
    if (!config) return null;

    const state = crypto.randomUUID();
    req.session.syndicationPushOAuthState = state;
    req.session.syndicationPushToken = ctx.syndicationToken;
    req.session.syndicationPushPartnerId = "facebook";

    void logFacebookWritePostsApp({
      action: "oauth.dialog_url",
      success: true,
      syndicationToken: ctx.syndicationToken,
      scope: config.configId ? undefined : FB_WRITE_POSTS_SCOPE,
      meta: config.configId ? { configId: config.configId } : { mode: "scope" },
    });
    return buildFacebookWritePostsOAuthUrl(config, { state });
  },

  async exchangeOAuthCode(code) {
    const config = getFacebookWritePostsConfig();
    if (!config) throw new Error("WritePostsOnly app is not configured");
    return exchangeFacebookWritePostsCode(config, code);
  },

  listManagedPages(userAccessToken) {
    return fetchFacebookManagedPages(userAccessToken);
  },

  publishToPage(input) {
    return publishFacebookPageFeedPost(input);
  },
};
