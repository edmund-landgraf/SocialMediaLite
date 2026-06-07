import type { SyndicationPushAction, SyndicationPushPartnerMeta } from "@socialmedialite/shared";
import { isSyndicationPushPartnerId } from "@socialmedialite/shared";
import type { SyndicationPushContext, SyndicationPushProvider } from "./types.js";
import { facebookSyndicationPushProvider } from "./partners/facebook/provider.js";

const providers: SyndicationPushProvider[] = [facebookSyndicationPushProvider];

const providerById = new Map(providers.map((p) => [p.id, p]));

export function getSyndicationPushProvider(
  partnerId: string,
): SyndicationPushProvider | undefined {
  if (!isSyndicationPushPartnerId(partnerId)) return undefined;
  return providerById.get(partnerId);
}

export function listSyndicationPushPartnerMeta(): SyndicationPushPartnerMeta[] {
  return providers.map((p) => p.getMeta());
}

/** Push actions on the public syndication page (timeline share always; page API validates config on click). */
export function buildSyndicationPublicPushActions(ctx: SyndicationPushContext): SyndicationPushAction[] {
  const token = encodeURIComponent(ctx.syndicationToken);
  const actions: SyndicationPushAction[] = [];

  for (const provider of providers) {
    const meta = provider.getMeta();

    if (meta.methods.includes("share_dialog")) {
      actions.push({
        partnerId: provider.id,
        label: provider.id === "facebook" ? "Push to FB timeline" : `Share on ${provider.label}`,
        method: "share_dialog",
        href: `/api/syndication-push/${provider.id}/share?token=${token}`,
      });
    }

    actions.push({
      partnerId: provider.id,
      label: provider.id === "facebook" ? "Push to FB page" : `Push to ${provider.label}`,
      method: "page_api",
      href: `/api/syndication-push/${provider.id}/push?token=${token}`,
    });
  }

  return actions;
}

/** All push actions (e.g. owner UI) — same as public page for now. */
export function buildSyndicationPushActions(ctx: SyndicationPushContext): SyndicationPushAction[] {
  return buildSyndicationPublicPushActions(ctx);
}
