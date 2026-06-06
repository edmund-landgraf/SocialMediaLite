import { z } from "zod";

export const postSyndicationAuthorSchema = z.object({
  displayName: z.string(),
  username: z.string(),
  profilePicUrl: z.string().nullable(),
});

export type PostSyndicationAuthor = z.infer<typeof postSyndicationAuthorSchema>;

export const postSyndicationPostSnapshotSchema = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().nullable(),
  photoCaption: z.string().nullable(),
  videoUrl: z.string().nullable(),
  linkTitle: z.string().nullable(),
  linkDescription: z.string().nullable(),
  photoUrl: z.string().nullable(),
  linkPreviewUrl: z.string().nullable(),
  textBackgroundColor: z.string().nullable(),
  textColor: z.string().nullable(),
  textFontSize: z.number().nullable(),
  createdAt: z.string(),
  author: postSyndicationAuthorSchema,
  profileOwner: postSyndicationAuthorSchema,
});

export type PostSyndicationPostSnapshot = z.infer<typeof postSyndicationPostSnapshotSchema>;

export const postSyndicationCommentSnapshotSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  text: z.string(),
  createdAt: z.string(),
  author: postSyndicationAuthorSchema,
});

export type PostSyndicationCommentSnapshot = z.infer<typeof postSyndicationCommentSnapshotSchema>;

export const postSyndicationSnapshotSchema = z.object({
  post: postSyndicationPostSnapshotSchema,
  comments: z.array(postSyndicationCommentSnapshotSchema),
});

export type PostSyndicationSnapshot = z.infer<typeof postSyndicationSnapshotSchema>;

export type PostSyndicationCommentTreeNode = PostSyndicationCommentSnapshot & {
  replies: PostSyndicationCommentTreeNode[];
};

export function buildPostSyndicationCommentTree(
  items: PostSyndicationCommentSnapshot[],
): PostSyndicationCommentTreeNode[] {
  const byId = new Map<string, PostSyndicationCommentTreeNode>();
  const roots: PostSyndicationCommentTreeNode[] = [];
  for (const item of items) {
    byId.set(item.id, { ...item, replies: [] });
  }
  for (const item of items) {
    const node = byId.get(item.id)!;
    if (item.parentId && byId.has(item.parentId)) {
      byId.get(item.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
