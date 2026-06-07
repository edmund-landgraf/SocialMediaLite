import type { Request } from "express";
import type {
  SyndicationPushMethod,
  SyndicationPushPartnerId,
  SyndicationPushPartnerMeta,
} from "@socialmedialite/shared";
import type { PostSyndicationSnapshot } from "@socialmedialite/shared";

export type SyndicationPushContext = {
  syndicationToken: string;
  /** Public/share URL sent to partners (may differ from browser view URL on localhost). */
  pageUrl: string;
  /** URL the user is viewing in the browser (optional). */
  viewUrl?: string;
  snapshot: PostSyndicationSnapshot;
  message: string;
};

export type SyndicationPagePublishResult = {
  fbPageId: string;
  fbPageName: string;
  fbPostId: string;
};

export interface SyndicationPushProvider {
  id: SyndicationPushPartnerId;
  label: string;
  methods: SyndicationPushMethod[];
  isConfigured(): boolean;
  getMeta(): SyndicationPushPartnerMeta;
  buildShareDialogUrl(ctx: SyndicationPushContext): string | null;
  /** Sets OAuth session fields and returns the Meta dialog URL. */
  beginPageOAuth(req: Request, ctx: SyndicationPushContext): string | null;
  exchangeOAuthCode(code: string): Promise<string>;
  listManagedPages(userAccessToken: string): Promise<
    Array<{ id: string; name: string; accessToken: string }>
  >;
  publishToPage(input: {
    pageId: string;
    pageAccessToken: string;
    message: string;
    link: string;
  }): Promise<string>;
}
