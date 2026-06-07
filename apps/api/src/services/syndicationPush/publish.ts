import type { Request } from "express";
import { loadSyndicationPushContext } from "./context.js";
import { getSyndicationPushProvider } from "./registry.js";

export type StoredFacebookWritePostsPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
};

export async function publishSyndicationToFacebookPage(
  req: Request,
  syndicationToken: string,
  page: StoredFacebookWritePostsPage,
): Promise<{ fbPostId: string; pageName: string }> {
  const partner = getSyndicationPushProvider("facebook");
  if (!partner?.isConfigured()) {
    throw new Error("WritePostsOnly is not configured");
  }

  const ctx = await loadSyndicationPushContext(req, syndicationToken);
  if (!ctx) throw new Error("Syndication not found");

  const fbPostId = await partner.publishToPage({
    pageId: page.pageId,
    pageAccessToken: page.pageAccessToken,
    message: ctx.message,
    link: ctx.pageUrl,
  });

  return { fbPostId, pageName: page.pageName };
}
