import { DELETED_COMMENT_TEXT, DELETED_USER_DISPLAY_NAME } from "@socialmedialite/shared";

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  profilePicUrl: true,
} as const;

export type CommentAuthorPayload = {
  id: string;
  username: string;
  displayName: string;
  profilePicUrl: string | null;
};

export type SerializedComment = {
  id: string;
  postId: string;
  authorId: string | null;
  parentId: string | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  author: CommentAuthorPayload;
};

export const deletedCommentAuthor: CommentAuthorPayload = {
  id: "deleted",
  username: "deleted",
  displayName: DELETED_USER_DISPLAY_NAME,
  profilePicUrl: null,
};

type CommentRow = {
  id: string;
  postId: string;
  authorId: string | null;
  parentId: string | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  author: CommentAuthorPayload | null;
};

export function serializeComment(row: CommentRow): SerializedComment {
  const tombstoned = row.deletedAt != null || row.author == null;
  return {
    id: row.id,
    postId: row.postId,
    authorId: row.authorId,
    parentId: row.parentId,
    text: tombstoned ? DELETED_COMMENT_TEXT : row.text,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    author: tombstoned ? deletedCommentAuthor : row.author!,
  };
}

export { authorSelect };
