import { randomBytes } from "node:crypto";
import type { Request } from "express";
import {
  DELETED_COMMENT_TEXT,
  DELETED_USER_DISPLAY_NAME,
  postSyndicationSnapshotSchema,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import {
  ensurePostSyndicationAliases,
  finalizePostSyndicationSnapshot,
  type RawPostSyndicationSnapshot,
} from "./postSyndicationAliases.js";

const authorSelect = {
  displayName: true,
  username: true,
  profilePicUrl: true,
} as const;

function assetPublicUrl(req: Request, assetKey: string | null | undefined): string | null {
  if (!assetKey) return null;
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${req.storage.getPublicUrl(assetKey)}`;
}

export function newPostSyndicationToken(): string {
  return randomBytes(16).toString("base64url");
}

export function postSyndicationPublicUrl(req: Request, token: string): string {
  return `${req.protocol}://${req.get("host")}/syndicate/${token}`;
}

/** SPA origin for profile/login links (Vite :5174 dev, nginx :443 prod). */
export function resolveWebAppOrigin(req: Request): string {
  const configured = process.env.WEB_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

export async function buildRawPostSyndicationSnapshot(
  req: Request,
  postId: string,
): Promise<RawPostSyndicationSnapshot | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: authorSelect },
      profileOwner: { select: authorSelect },
    },
  });
  if (!post) return null;

  const comments = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: authorSelect } },
  });

  const snapshot = postSyndicationSnapshotSchema.parse({
    post: {
      id: post.id,
      type: post.type,
      text: post.text,
      photoCaption: post.photoCaption,
      videoUrl: post.videoUrl,
      linkTitle: post.linkTitle,
      linkDescription: post.linkDescription,
      photoUrl: assetPublicUrl(req, post.photoKey),
      linkPreviewUrl: assetPublicUrl(req, post.linkPreviewImageKey),
      textBackgroundColor: post.textBackgroundColor,
      textColor: post.textColor,
      textFontSize: post.textFontSize,
      createdAt: post.createdAt.toISOString(),
      author: post.author,
      profileOwner: post.profileOwner,
    },
    comments: comments.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      text: row.deletedAt || !row.author ? DELETED_COMMENT_TEXT : row.text,
      createdAt: row.createdAt.toISOString(),
      author:
        row.deletedAt || !row.author
          ? { displayName: DELETED_USER_DISPLAY_NAME, username: "deleted", profilePicUrl: null }
          : row.author,
    })),
  });

  return {
    ...snapshot,
    postAuthorId: post.authorId,
    comments: comments.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      text: row.deletedAt || !row.author ? DELETED_COMMENT_TEXT : row.text,
      createdAt: row.createdAt.toISOString(),
      authorId: row.authorId,
      author:
        row.deletedAt || !row.author
          ? { displayName: DELETED_USER_DISPLAY_NAME, username: "deleted", profilePicUrl: null }
          : row.author!,
    })),
  };
}

export async function upsertPostSyndicationSnapshot(input: {
  req: Request;
  postId: string;
  viewerId: string;
  randomizeNames: boolean;
}) {
  const raw = await buildRawPostSyndicationSnapshot(input.req, input.postId);
  if (!raw) return null;

  const refreshedAt = new Date();
  const commentAuthorIds = raw.comments
    .map((comment) => comment.authorId)
    .filter((userId): userId is string => userId != null && userId !== raw.postAuthorId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.postSyndication.findUnique({
      where: { postId: input.postId },
    });

    const syndication =
      existing ??
      (await tx.postSyndication.create({
        data: {
          token: newPostSyndicationToken(),
          postId: input.postId,
          createdByUserId: input.viewerId,
          randomizeNames: input.randomizeNames,
          snapshotJson: {},
          refreshedAt,
        },
      }));

    const aliasByUserId = input.randomizeNames
      ? await ensurePostSyndicationAliases(syndication.id, commentAuthorIds, tx)
      : new Map<string, string>();

    const snapshot = finalizePostSyndicationSnapshot(raw, input.randomizeNames, aliasByUserId);

    return tx.postSyndication.update({
      where: { id: syndication.id },
      data: {
        randomizeNames: input.randomizeNames,
        snapshotJson: snapshot,
        refreshedAt,
      },
    });
  });
}

export function canManagePostSyndication(
  viewerId: string,
  post: { authorId: string; profileOwnerId: string },
): boolean {
  return post.authorId === viewerId || post.profileOwnerId === viewerId;
}
