export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  profilePicUrl: string | null;
  bannerImageKey: string | null;
  bannerUrl?: string | null;
  createdAt: string;
};

export type ProfileMeta = {
  isSelf: boolean;
  friendshipStatus:
    | "self"
    | "none"
    | "pending_out"
    | "pending_in"
    | "accepted"
    | "blocked";
  canViewContent: boolean;
};

export type PostAuthor = {
  id: string;
  username: string;
  displayName: string;
  profilePicUrl: string | null;
};

export type PostReactionCount = {
  kind: string;
  count: number;
};

export type PostDTO = {
  id: string;
  authorId: string;
  profileOwnerId: string;
  type: "TEXT" | "PHOTO" | "VIDEO_LINK";
  text: string | null;
  photoKey: string | null;
  photoCaption: string | null;
  videoUrl: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  isPinned: boolean;
  sharedToFriendsFeed: boolean;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  profileOwner?: PostAuthor;
  _count: { comments: number };
  photoUrl: string | null;
  /** Stored Open Graph thumbnail (fixed server-side crop); omitted on older rows. */
  linkPreviewUrl?: string | null;
  textBackgroundColor?: string | null;
  textColor?: string | null;
  textFontSize?: number | null;
  reactions?: PostReactionCount[];
  viewerReaction?: string | null;
  reactionTotal?: number;
};

export type FriendsFeedBucket = "unread" | "read" | "saved" | "discarded";

export type FriendsFeedMeta = {
  sharableTotal: number;
  rankedCount: number;
  bucket: FriendsFeedBucket;
  counts: Record<FriendsFeedBucket, number>;
};

export type CommentDTO = {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  text: string;
  createdAt: string;
  author: PostAuthor;
};

export type CommentTreeNode = CommentDTO & { replies: CommentTreeNode[] };

export type BlogEntryDTO = {
  id: string;
  slug: string;
  title: string;
  body: string;
  committedAt: string;
  sha: string;
  commitUrl?: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};
