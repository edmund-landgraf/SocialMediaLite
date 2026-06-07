import type { Request } from "express";
import { buildSyndicationPushMessage, postSyndicationSnapshotSchema } from "@socialmedialite/shared";
import { prisma } from "../../lib/prisma.js";
import { postSyndicationPublicUrl, postSyndicationShareUrl } from "../postSyndication.js";
import type { SyndicationPushContext } from "./types.js";

export async function loadSyndicationPushContext(
  req: Request,
  syndicationToken: string,
): Promise<SyndicationPushContext | null> {
  const row = await prisma.postSyndication.findUnique({
    where: { token: syndicationToken },
  });
  if (!row) return null;

  const snapshotParsed = postSyndicationSnapshotSchema.safeParse(row.snapshotJson);
  if (!snapshotParsed.success) return null;

  return {
    syndicationToken,
    pageUrl: postSyndicationShareUrl(req, syndicationToken),
    viewUrl: postSyndicationPublicUrl(req, syndicationToken),
    snapshot: snapshotParsed.data,
    message: buildSyndicationPushMessage(snapshotParsed.data),
  };
}
