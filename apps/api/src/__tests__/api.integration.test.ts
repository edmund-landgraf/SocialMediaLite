import crypto from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRec = {
  id: string;
  fbUserId: string | null;
  email: string | null;
  displayName: string;
  username: string;
  profilePicUrl: string | null;
  bannerImageKey: string | null;
  bannerPositionX: number;
  bannerPositionY: number;
  createdAt: Date;
  updatedAt: Date;
};

type FriendshipRec = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: Date;
  updatedAt: Date;
};

type PostRec = {
  id: string;
  authorId: string;
  profileOwnerId: string;
  type: "TEXT" | "PHOTO" | "VIDEO_LINK";
  text: string | null;
  photoKey: string | null;
  photoCaption: string | null;
  videoUrl: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkPreviewImageKey: string | null;
  textBackgroundColor: string | null;
  textColor: string | null;
  textFontSize: number | null;
  isPinned: boolean;
  sharedToFriendsFeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CommentRec = {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
};

type FriendsFeedReviewRec = {
  id: string;
  viewerId: string;
  postId: string;
  status: "READ" | "SAVED" | "DISCARDED";
  createdAt: Date;
  updatedAt: Date;
};

type PostReactionRec = {
  id: string;
  postId: string;
  userId: string;
  kind: string;
  details: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BlogEntryRec = {
  id: string;
  slug: string;
  title: string;
  body: string;
  committedAt: Date;
  sha: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
};

type FeedbackItemRec = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

type FeedbackCommentRec = {
  id: string;
  feedbackId: string;
  authorId: string;
  parentId: string | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
};

const db = {
  users: [] as UserRec[],
  friendships: [] as FriendshipRec[],
  posts: [] as PostRec[],
  comments: [] as CommentRec[],
  friendsFeedReviews: [] as FriendsFeedReviewRec[],
  postReactions: [] as PostReactionRec[],
  blogEntries: [] as BlogEntryRec[],
  feedbackItems: [] as FeedbackItemRec[],
  feedbackComments: [] as FeedbackCommentRec[],
};

const storage = {
  putObject: vi.fn(async () => undefined),
  getPublicUrl: vi.fn((key: string) => `/assets/${key}`),
  deleteObject: vi.fn(async () => undefined),
};

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date();
}

function findUserById(userId: string) {
  return db.users.find((u) => u.id === userId) ?? null;
}

function cloneUser(u: UserRec) {
  return { ...u };
}

const prisma = {
  user: {
    async upsert(args: {
      where: { username: string };
      create: Pick<UserRec, "displayName" | "username" | "email" | "fbUserId" | "profilePicUrl">;
      update: Partial<Pick<UserRec, "displayName" | "email" | "fbUserId" | "profilePicUrl">>;
    }) {
      const existing = db.users.find((u) => u.username === args.where.username);
      if (existing) {
        if (args.update.displayName !== undefined) existing.displayName = args.update.displayName;
        if (args.update.email !== undefined) existing.email = args.update.email ?? null;
        if (args.update.fbUserId !== undefined) existing.fbUserId = args.update.fbUserId ?? null;
        if (args.update.profilePicUrl !== undefined) existing.profilePicUrl = args.update.profilePicUrl ?? null;
        existing.updatedAt = now();
        return cloneUser(existing);
      }
      const created: UserRec = {
        id: id(),
        fbUserId: args.create.fbUserId ?? null,
        email: args.create.email ?? null,
        displayName: args.create.displayName,
        username: args.create.username,
        profilePicUrl: args.create.profilePicUrl ?? null,
        bannerImageKey: null,
        bannerPositionX: 50,
        bannerPositionY: 50,
        createdAt: now(),
        updatedAt: now(),
      };
      db.users.push(created);
      return cloneUser(created);
    },
    async findUnique(args: { where: { id?: string; username?: string } }) {
      if (args.where.id) {
        const row = db.users.find((u) => u.id === args.where.id);
        return row ? cloneUser(row) : null;
      }
      if (args.where.username) {
        const row = db.users.find((u) => u.username === args.where.username);
        return row ? cloneUser(row) : null;
      }
      return null;
    },
    async findMany(args?: { orderBy?: unknown; take?: number }) {
      let rows = db.users.slice().sort((a, b) => {
        const byName = a.displayName.localeCompare(b.displayName);
        if (byName !== 0) return byName;
        return a.username.localeCompare(b.username);
      });
      if (args?.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map(cloneUser);
    },
    async update(args: {
      where: { id: string };
      data: Partial<Pick<UserRec, "bannerImageKey" | "bannerPositionX" | "bannerPositionY">>;
    }) {
      const row = db.users.find((u) => u.id === args.where.id);
      if (!row) throw new Error("user not found");
      if (args.data.bannerImageKey !== undefined) row.bannerImageKey = args.data.bannerImageKey ?? null;
      if (args.data.bannerPositionX !== undefined) row.bannerPositionX = args.data.bannerPositionX;
      if (args.data.bannerPositionY !== undefined) row.bannerPositionY = args.data.bannerPositionY;
      row.updatedAt = now();
      return cloneUser(row);
    },
  },
  friendship: {
    async findFirst(args: { where: Record<string, unknown> }) {
      const where = args.where as {
        status?: FriendshipRec["status"];
        requesterId?: string;
        addresseeId?: string;
        OR?: Array<{ requesterId: string; addresseeId: string }>;
      };
      let rows = db.friendships.slice();
      if (where.status) rows = rows.filter((f) => f.status === where.status);
      if (where.requesterId) rows = rows.filter((f) => f.requesterId === where.requesterId);
      if (where.addresseeId) rows = rows.filter((f) => f.addresseeId === where.addresseeId);
      if (where.OR) {
        rows = rows.filter((f) =>
          where.OR!.some((c) => c.requesterId === f.requesterId && c.addresseeId === f.addresseeId),
        );
      }
      return rows[0] ? { ...rows[0] } : null;
    },
    async findMany(args: {
      where: Record<string, unknown>;
      include?: { requester: true; addressee: true };
      select?: { requesterId: true; addresseeId: true };
    }) {
      const where = args.where as {
        status?: FriendshipRec["status"];
        OR?: Array<{ requesterId?: string; addresseeId?: string }>;
      };
      let rows = db.friendships.slice();
      if (where.status) rows = rows.filter((f) => f.status === where.status);
      if (where.OR) {
        rows = rows.filter((f) =>
          where.OR!.some(
            (c) =>
              (c.requesterId === undefined || c.requesterId === f.requesterId) &&
              (c.addresseeId === undefined || c.addresseeId === f.addresseeId),
          ),
        );
      }
      if (args.select?.requesterId && args.select?.addresseeId) {
        return rows.map((r) => ({ requesterId: r.requesterId, addresseeId: r.addresseeId }));
      }
      if (!args.include) return rows.map((r) => ({ ...r }));
      return rows.map((r) => ({
        ...r,
        requester: findUserById(r.requesterId)!,
        addressee: findUserById(r.addresseeId)!,
      }));
    },
    async create(args: { data: Omit<FriendshipRec, "id" | "createdAt" | "updatedAt"> }) {
      const rec: FriendshipRec = { id: id(), createdAt: now(), updatedAt: now(), ...args.data };
      db.friendships.push(rec);
      return { ...rec };
    },
    async update(args: { where: { id: string }; data: Partial<Pick<FriendshipRec, "status">> }) {
      const row = db.friendships.find((f) => f.id === args.where.id);
      if (!row) throw new Error("friendship not found");
      if (args.data.status !== undefined) row.status = args.data.status;
      row.updatedAt = now();
      return { ...row };
    },
    async delete(args: { where: { id: string } }) {
      const idx = db.friendships.findIndex((f) => f.id === args.where.id);
      if (idx === -1) throw new Error("friendship not found");
      const [deleted] = db.friendships.splice(idx, 1);
      return { ...deleted };
    },
  },
  post: {
    async findMany(args: {
      where: {
        profileOwnerId?: string | { in: string[] };
        sharedToFriendsFeed?: boolean;
      };
      orderBy?: unknown;
      include?: Record<string, unknown>;
    }) {
      let rows = db.posts.slice();
      const where = args.where;
      if (where.profileOwnerId !== undefined) {
        if (typeof where.profileOwnerId === "string") {
          rows = rows.filter((p) => p.profileOwnerId === where.profileOwnerId);
        } else if (where.profileOwnerId.in) {
          rows = rows.filter((p) => where.profileOwnerId.in.includes(p.profileOwnerId));
        }
      }
      if (where.sharedToFriendsFeed !== undefined) {
        rows = rows.filter((p) => p.sharedToFriendsFeed === where.sharedToFriendsFeed);
      }
      rows.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      if (!args.include) return rows.map((r) => ({ ...r }));
      return rows.map((r) => ({
        ...r,
        author: findUserById(r.authorId),
        profileOwner: findUserById(r.profileOwnerId),
        _count: { comments: db.comments.filter((c) => c.postId === r.id).length },
      }));
    },
    async create(args: { data: Omit<PostRec, "id" | "createdAt" | "updatedAt" | "isPinned"> & { isPinned?: boolean }; include?: Record<string, unknown> }) {
      const d = args.data;
      const rec: PostRec = {
        id: id(),
        createdAt: now(),
        updatedAt: now(),
        isPinned: d.isPinned ?? false,
        authorId: d.authorId,
        profileOwnerId: d.profileOwnerId,
        type: d.type,
        text: d.text ?? null,
        photoKey: d.photoKey ?? null,
        photoCaption: d.photoCaption ?? null,
        videoUrl: d.videoUrl ?? null,
        linkTitle: d.linkTitle ?? null,
        linkDescription: d.linkDescription ?? null,
        linkPreviewImageKey: d.linkPreviewImageKey ?? null,
        textBackgroundColor: d.textBackgroundColor ?? null,
        textColor: d.textColor ?? null,
        textFontSize: d.textFontSize ?? null,
        sharedToFriendsFeed: d.sharedToFriendsFeed ?? false,
      };
      db.posts.push(rec);
      if (!args.include) return { ...rec };
      return {
        ...rec,
        author: findUserById(rec.authorId),
        profileOwner: findUserById(rec.profileOwnerId),
        _count: { comments: 0 },
      };
    },
    async findUnique(args: {
      where: { id: string };
      select?: { profileOwnerId?: boolean; sharedToFriendsFeed?: boolean; id?: boolean };
      include?: Record<string, unknown>;
    }) {
      const row = db.posts.find((p) => p.id === args.where.id);
      if (!row) return null;
      if (args.select) {
        const out: Record<string, unknown> = {};
        if (args.select.id) out.id = row.id;
        if (args.select.profileOwnerId) out.profileOwnerId = row.profileOwnerId;
        if (args.select.sharedToFriendsFeed) out.sharedToFriendsFeed = row.sharedToFriendsFeed;
        return out;
      }
      if (args.include) {
        return {
          ...row,
          author: findUserById(row.authorId),
          profileOwner: findUserById(row.profileOwnerId),
          _count: { comments: db.comments.filter((c) => c.postId === row.id).length },
        };
      }
      return { ...row };
    },
    async update(args: {
      where: { id: string };
      data: Partial<Pick<PostRec, "isPinned" | "photoCaption" | "sharedToFriendsFeed">>;
      include?: Record<string, unknown>;
    }) {
      const row = db.posts.find((p) => p.id === args.where.id);
      if (!row) throw new Error("post not found");
      if (args.data.isPinned !== undefined) row.isPinned = args.data.isPinned;
      if (args.data.photoCaption !== undefined) row.photoCaption = args.data.photoCaption ?? null;
      if (args.data.sharedToFriendsFeed !== undefined) row.sharedToFriendsFeed = args.data.sharedToFriendsFeed;
      row.updatedAt = now();
      if (!args.include) return { ...row };
      return {
        ...row,
        author: findUserById(row.authorId),
        profileOwner: findUserById(row.profileOwnerId),
        _count: { comments: db.comments.filter((c) => c.postId === row.id).length },
      };
    },
    async updateMany(args: { where: { profileOwnerId: string; isPinned?: boolean }; data: Partial<Pick<PostRec, "isPinned">> }) {
      const matches = db.posts.filter(
        (p) =>
          p.profileOwnerId === args.where.profileOwnerId &&
          (args.where.isPinned === undefined || p.isPinned === args.where.isPinned),
      );
      for (const row of matches) {
        if (args.data.isPinned !== undefined) row.isPinned = args.data.isPinned;
        row.updatedAt = now();
      }
      return { count: matches.length };
    },
    async delete(args: { where: { id: string } }) {
      const idx = db.posts.findIndex((p) => p.id === args.where.id);
      if (idx === -1) throw new Error("post not found");
      const [deleted] = db.posts.splice(idx, 1);
      db.comments = db.comments.filter((c) => c.postId !== deleted.id);
      return deleted;
    },
  },
  comment: {
    async findMany(args: { where: { postId: string } }) {
      return db.comments
        .filter((c) => c.postId === args.where.postId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((c) => ({ ...c, author: findUserById(c.authorId) }));
    },
    async create(args: {
      data: { postId: string; authorId: string; text: string; parentId?: string | null };
    }) {
      const rec: CommentRec = {
        id: id(),
        createdAt: now(),
        updatedAt: now(),
        parentId: args.data.parentId ?? null,
        postId: args.data.postId,
        authorId: args.data.authorId,
        text: args.data.text,
      };
      db.comments.push(rec);
      return { ...rec, author: findUserById(rec.authorId) };
    },
    async findUnique(args: { where: { id: string }; select?: { postId?: boolean } }) {
      const rec = db.comments.find((c) => c.id === args.where.id);
      if (!rec) return null;
      if (args.select?.postId) return { postId: rec.postId };
      return { ...rec, author: findUserById(rec.authorId) };
    },
  },
  friendsFeedReview: {
    async findMany(args: {
      where: { viewerId: string; postId?: { in: string[] }; status?: FriendsFeedReviewRec["status"]; updatedAt?: { lt: Date } };
      select?: { postId: true; status: true; updatedAt: true };
    }) {
      let rows = db.friendsFeedReviews.filter((r) => r.viewerId === args.where.viewerId);
      if (args.where.postId?.in) {
        rows = rows.filter((r) => args.where.postId!.in.includes(r.postId));
      }
      if (args.where.status) rows = rows.filter((r) => r.status === args.where.status);
      if (args.where.updatedAt?.lt) {
        rows = rows.filter((r) => r.updatedAt.getTime() < args.where.updatedAt!.lt.getTime());
      }
      return rows.map((r) => ({ ...r }));
    },
    async upsert(args: {
      where: { viewerId_postId: { viewerId: string; postId: string } };
      create: Omit<FriendsFeedReviewRec, "id" | "createdAt" | "updatedAt">;
      update: Pick<FriendsFeedReviewRec, "status">;
    }) {
      const existing = db.friendsFeedReviews.find(
        (r) =>
          r.viewerId === args.where.viewerId_postId.viewerId &&
          r.postId === args.where.viewerId_postId.postId,
      );
      if (existing) {
        existing.status = args.update.status;
        existing.updatedAt = now();
        return { ...existing };
      }
      const rec: FriendsFeedReviewRec = {
        id: id(),
        createdAt: now(),
        updatedAt: now(),
        viewerId: args.create.viewerId,
        postId: args.create.postId,
        status: args.create.status,
      };
      db.friendsFeedReviews.push(rec);
      return { ...rec };
    },
    async deleteMany(args: {
      where: { viewerId: string; status: FriendsFeedReviewRec["status"]; updatedAt?: { lt: Date } };
    }) {
      const before = db.friendsFeedReviews.length;
      db.friendsFeedReviews = db.friendsFeedReviews.filter((r) => {
        if (r.viewerId !== args.where.viewerId) return true;
        if (r.status !== args.where.status) return true;
        if (args.where.updatedAt?.lt && r.updatedAt.getTime() >= args.where.updatedAt.lt.getTime()) return true;
        return false;
      });
      return { count: before - db.friendsFeedReviews.length };
    },
  },
  postReaction: {
    async findMany(args: {
      where: { postId?: { in: string[] } };
      select: { postId: true; kind: true; userId: true };
    }) {
      let rows = db.postReactions.slice();
      if (args.where.postId?.in) {
        rows = rows.filter((r) => args.where.postId!.in.includes(r.postId));
      }
      return rows.map((r) => ({
        postId: r.postId,
        kind: r.kind,
        userId: r.userId,
      }));
    },
    async upsert(args: {
      where: { postId_userId: { postId: string; userId: string } };
      create: Omit<PostReactionRec, "id" | "createdAt" | "updatedAt">;
      update: Pick<PostReactionRec, "kind" | "details">;
    }) {
      const existing = db.postReactions.find(
        (r) =>
          r.postId === args.where.postId_userId.postId &&
          r.userId === args.where.postId_userId.userId,
      );
      if (existing) {
        existing.kind = args.update.kind;
        if (args.update.details !== undefined) existing.details = args.update.details;
        existing.updatedAt = now();
        return { ...existing };
      }
      const rec: PostReactionRec = {
        id: id(),
        createdAt: now(),
        updatedAt: now(),
        postId: args.create.postId,
        userId: args.create.userId,
        kind: args.create.kind,
        details: args.create.details ?? null,
      };
      db.postReactions.push(rec);
      return { ...rec };
    },
  },
  blogEntry: {
    async findMany(args: { orderBy?: { committedAt?: "desc" | "asc" } }) {
      let rows = db.blogEntries.slice();
      if (args.orderBy?.committedAt === "desc") {
        rows.sort((a, b) => b.committedAt.getTime() - a.committedAt.getTime());
      } else if (args.orderBy?.committedAt === "asc") {
        rows.sort((a, b) => a.committedAt.getTime() - b.committedAt.getTime());
      }
      return rows.map((r) => ({ ...r }));
    },
    async upsert(args: {
      where: { sha: string };
      create: Omit<BlogEntryRec, "id" | "createdAt" | "updatedAt">;
      update: Partial<Omit<BlogEntryRec, "id" | "createdAt" | "updatedAt">>;
    }) {
      const existing = db.blogEntries.find((e) => e.sha === args.where.sha);
      if (existing) {
        Object.assign(existing, args.update, { updatedAt: now() });
        return { ...existing };
      }
      const rec: BlogEntryRec = {
        id: id(),
        createdAt: now(),
        updatedAt: now(),
        ...args.create,
      };
      db.blogEntries.push(rec);
      return { ...rec };
    },
  },
  feedbackItem: {
    async findMany(args: { orderBy?: { createdAt?: "desc" | "asc" } }) {
      let rows = db.feedbackItems.slice();
      if (args.orderBy?.createdAt === "desc") {
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return rows.map((row) => ({
        ...row,
        author: findUserById(row.authorId)!,
        _count: { comments: db.feedbackComments.filter((c) => c.feedbackId === row.id).length },
      }));
    },
    async findUnique(args: { where: { id: string }; select?: { id?: boolean } }) {
      const row = db.feedbackItems.find((f) => f.id === args.where.id);
      if (!row) return null;
      if (args.select?.id === true) return { id: row.id };
      return { ...row };
    },
    async create(args: { data: Pick<FeedbackItemRec, "authorId" | "title" | "body"> }) {
      const rec: FeedbackItemRec = {
        id: id(),
        authorId: args.data.authorId,
        title: args.data.title,
        body: args.data.body,
        createdAt: now(),
        updatedAt: now(),
      };
      db.feedbackItems.push(rec);
      return {
        ...rec,
        author: findUserById(rec.authorId)!,
        _count: { comments: 0 },
      };
    },
    async update(args: {
      where: { id: string };
      data: Pick<FeedbackItemRec, "title" | "body">;
    }) {
      const row = db.feedbackItems.find((f) => f.id === args.where.id);
      if (!row) throw new Error("feedback not found");
      row.title = args.data.title;
      row.body = args.data.body;
      row.updatedAt = now();
      return {
        ...row,
        author: findUserById(row.authorId)!,
        _count: { comments: db.feedbackComments.filter((c) => c.feedbackId === row.id).length },
      };
    },
  },
  feedbackComment: {
    async findMany(args: { where: { feedbackId: string }; orderBy?: { createdAt?: "asc" } }) {
      let rows = db.feedbackComments.filter((c) => c.feedbackId === args.where.feedbackId);
      if (args.orderBy?.createdAt === "asc") {
        rows = rows.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return rows.map((row) => ({ ...row, author: findUserById(row.authorId)! }));
    },
    async findUnique(args: { where: { id: string }; select?: { feedbackId?: boolean } }) {
      const row = db.feedbackComments.find((c) => c.id === args.where.id);
      if (!row) return null;
      if (args.select?.feedbackId) return { feedbackId: row.feedbackId };
      return { ...row, author: findUserById(row.authorId)! };
    },
    async create(args: {
      data: Pick<FeedbackCommentRec, "feedbackId" | "authorId" | "parentId" | "text">;
    }) {
      const rec: FeedbackCommentRec = {
        id: id(),
        feedbackId: args.data.feedbackId,
        authorId: args.data.authorId,
        parentId: args.data.parentId,
        text: args.data.text,
        createdAt: now(),
        updatedAt: now(),
      };
      db.feedbackComments.push(rec);
      return { ...rec, author: findUserById(rec.authorId)! };
    },
  },
  async $transaction<T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> {
    return fn(prisma);
  },
};

vi.mock("../lib/prisma.js", () => ({ prisma }));

const processImageToMaxSizeMock = vi.fn();
vi.mock("../services/image.js", async () => {
  const actual = await vi.importActual<typeof import("../services/image.js")>("../services/image.js");
  return {
    ...actual,
    processImageToMaxSize: processImageToMaxSizeMock,
  };
});

vi.mock("../storage/index.js", () => ({
  createStorageProviderFromEnv: () => storage,
  getResolvedLocalStorageRoot: () => process.cwd(),
}));

vi.mock("../services/linkPreview.js", () => ({
  buildStoredLinkPreview: vi.fn(async () => ({
    linkTitle: "Example article",
    linkDescription: "Short description.",
    linkPreviewImageKey: "users/mock/link.webp",
  })),
  fetchLinkPreviewMetadata: vi.fn(async () => ({
    url: "https://example.com/",
    hostname: "example.com",
    title: "Example article",
    description: "Short description.",
    remoteImageUrl: null,
  })),
}));

vi.mock("../services/aiFriend.js", () => ({
  AI_FRIEND: {
    username: "glowbyte",
    displayName: "Glowbyte",
    welcomeMessage: "stub",
  },
  ensureAiFriendSeed: vi.fn(async () => undefined),
  ensureAiFriendshipForUser: vi.fn(async () => undefined),
}));

describe("api integration (phase 1)", () => {
  beforeEach(() => {
    db.users = [];
    db.friendships = [];
    db.posts = [];
    db.comments = [];
    db.friendsFeedReviews = [];
    db.postReactions = [];
    db.blogEntries = [];
    db.feedbackItems = [];
    db.feedbackComments = [];
    storage.putObject.mockClear();
    storage.getPublicUrl.mockClear();
    storage.deleteObject.mockClear();
    processImageToMaxSizeMock.mockReset();
  });

  async function createAgents() {
    const { createApp } = await import("../app.js");
    const app = createApp();
    return {
      alice: request.agent(app),
      bob: request.agent(app),
      app,
    };
  }

  async function loginTestUser(agent: request.SuperAgentTest) {
    const res = await agent.post("/api/auth/stub-login").send({ kind: "test_user" });
    expect(res.status).toBe(200);
  }

  async function loginFacebookStub(agent: request.SuperAgentTest) {
    const res = await agent.post("/api/auth/stub-login").send({ kind: "facebook_stub" });
    expect(res.status).toBe(200);
  }

  async function loginTestUser2(agent: request.SuperAgentTest) {
    const res = await agent.post("/api/auth/stub-login").send({ kind: "test_user_2" });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("testuser2");
  }

  async function fetchFeedbackCaptchaAnswer(agent: request.SuperAgentTest) {
    const captcha = await agent.get("/api/feedback/captcha");
    expect(captcha.status).toBe(200);
    const match = String(captcha.body.question).match(/^What is (\d+) \+ (\d+)\?$/);
    expect(match).not.toBeNull();
    return Number(match![1]) + Number(match![2]);
  }

  it("logs in stub test user 2 on own profile", async () => {
    const { alice } = await createAgents();
    await loginTestUser2(alice);

    const profile = await alice.get("/api/users/testuser2");
    expect(profile.status).toBe(200);
    expect(profile.body.user.username).toBe("testuser2");
    expect(profile.body.meta.isSelf).toBe(true);

    const post = await alice.post("/api/users/testuser2/posts").send({
      type: "TEXT",
      text: "hello from test user 2",
    });
    expect(post.status).toBe(201);
    expect(post.body.post.text).toBe("hello from test user 2");
  });

  it("creates a text post on own page", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    const res = await alice.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "hello from me",
    });
    expect(res.status).toBe(201);
    expect(res.body.post.type).toBe("TEXT");
    expect(res.body.post.text).toBe("hello from me");

    const list = await alice.get("/api/users/testuser/posts");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.posts)).toBe(true);
    expect(list.body.posts).toHaveLength(1);
  });

  it("stores text post styling when provided", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    const res = await alice.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "styled hello",
      textBackgroundColor: "#112233",
      textColor: "#aabbcc",
      textFontSize: 24,
    });
    expect(res.status).toBe(201);
    expect(res.body.post.textBackgroundColor).toBe("#112233");
    expect(res.body.post.textColor).toBe("#aabbcc");
    expect(res.body.post.textFontSize).toBe(24);
  });

  it("rejects text post font size outside allowed range", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    const res = await alice.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "too big",
      textFontSize: 48,
    });
    expect(res.status).toBe(400);
  });

  it("allows posting to another user's page only after friendship is accepted", async () => {
    const { alice, bob } = await createAgents();
    await loginTestUser(alice);
    await loginFacebookStub(bob);

    const blocked = await bob.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "cannot yet",
    });
    expect(blocked.status).toBe(403);

    const requested = await bob.post("/api/friends/request").send({ username: "testuser" });
    expect(requested.status).toBe(200);

    const accepted = await alice.post("/api/friends/accept").send({ username: "fbdemo" });
    expect(accepted.status).toBe(200);

    const allowed = await bob.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "hello alice wall",
    });
    expect(allowed.status).toBe(201);
  });

  it("upserts post reactions and returns counts on list", async () => {
    const { alice, bob } = await createAgents();
    await loginTestUser(alice);
    await loginFacebookStub(bob);

    await bob.post("/api/friends/request").send({ username: "testuser" });
    await alice.post("/api/friends/accept").send({ username: "fbdemo" });

    const created = await bob.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "react to me",
    });
    expect(created.status).toBe(201);
    const postId = created.body.post.id as string;

    const react = await alice.post(`/api/posts/${postId}/reaction`).send({ kind: "celebrate" });
    expect(react.status).toBe(200);
    expect(react.body.viewerReaction).toBe("celebrate");
    expect(react.body.reactionTotal).toBe(1);

    const change = await alice.post(`/api/posts/${postId}/reaction`).send({ kind: "funny" });
    expect(change.status).toBe(200);
    expect(change.body.viewerReaction).toBe("funny");
    expect(change.body.reactionTotal).toBe(1);

    const list = await alice.get("/api/users/testuser/posts");
    expect(list.status).toBe(200);
    const post = list.body.posts.find((p: { id: string }) => p.id === postId);
    expect(post.viewerReaction).toBe("funny");
    expect(post.reactionTotal).toBe(1);
    expect(post.reactions).toEqual([{ kind: "funny", count: 1 }]);
  });

  it("stores optional details for disagree reactions", async () => {
    const { alice, bob } = await createAgents();
    await loginTestUser(alice);
    await loginFacebookStub(bob);

    await bob.post("/api/friends/request").send({ username: "testuser" });
    await alice.post("/api/friends/accept").send({ username: "fbdemo" });

    const created = await bob.post("/api/users/testuser/posts").send({
      type: "TEXT",
      text: "disagree with this",
    });
    const postId = created.body.post.id as string;

    const withDetails = await alice
      .post(`/api/posts/${postId}/reaction`)
      .send({ kind: "disagree", details: "  Not accurate  " });
    expect(withDetails.status).toBe(200);
    expect(withDetails.body.viewerReaction).toBe("disagree");

    const row = db.postReactions.find((r) => r.postId === postId && r.userId === db.users.find((u) => u.username === "testuser")!.id);
    expect(row?.details).toBe("Not accurate");

    const rejected = await alice
      .post(`/api/posts/${postId}/reaction`)
      .send({ kind: "like", details: "should fail" });
    expect(rejected.status).toBe(400);
  });

  it("keeps only one pinned post per profile owner", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    const p1 = await alice.post("/api/users/testuser/posts").send({ type: "TEXT", text: "first" });
    const p2 = await alice.post("/api/users/testuser/posts").send({ type: "TEXT", text: "second" });
    expect(p1.status).toBe(201);
    expect(p2.status).toBe(201);

    const pinFirst = await alice.post(`/api/posts/${p1.body.post.id}/pin`).send({ pinned: true });
    expect(pinFirst.status).toBe(200);
    const pinSecond = await alice.post(`/api/posts/${p2.body.post.id}/pin`).send({ pinned: true });
    expect(pinSecond.status).toBe(200);

    const list = await alice.get("/api/users/testuser/posts");
    expect(list.status).toBe(200);
    const pinned = list.body.posts.filter((p: { isPinned: boolean }) => p.isPinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe(p2.body.post.id);
  });

  it("creates a link post with Open Graph preview fields (stub fetcher)", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    const res = await alice.post("/api/users/testuser/posts").send({
      type: "VIDEO_LINK",
      videoUrl: "https://example.com/page",
      text: "Thoughts?",
    });

    expect(res.status).toBe(201);
    expect(res.body.post.type).toBe("VIDEO_LINK");
    expect(res.body.post.videoUrl).toBe("https://example.com/page");
    expect(res.body.post.linkTitle).toBe("Example article");
    expect(res.body.post.linkPreviewUrl).toContain("/assets/");
  });

  it("returns link preview metadata JSON", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    const res = await alice.post("/api/link-preview").send({ url: "https://example.com/" });
    expect(res.status).toBe(200);
    expect(res.body.hostname).toBe("example.com");
    expect(res.body.title).toBe("Example article");
  });

  it("shows shared friend posts on the viewer friends feed", async () => {
    const { alice, bob } = await createAgents();
    await loginTestUser(alice);
    await loginFacebookStub(bob);

    await bob.post("/api/friends/request").send({ username: "testuser" });
    await alice.post("/api/friends/accept").send({ username: "fbdemo" });

    const created = await bob.post("/api/users/fbdemo/posts").send({
      type: "TEXT",
      text: "share me to alice feed",
    });
    expect(created.status).toBe(201);
    const postId = created.body.post.id as string;

    const notShared = await alice.get("/api/users/testuser/friends-feed");
    expect(notShared.status).toBe(200);
    expect(notShared.body.posts).toHaveLength(0);

    const shared = await bob.post(`/api/posts/${postId}/friends-feed-share`).send({ shared: true });
    expect(shared.status).toBe(200);
    expect(shared.body.post.sharedToFriendsFeed).toBe(true);

    const feed = await alice.get("/api/users/testuser/friends-feed?bucket=unread");
    expect(feed.status).toBe(200);
    expect(feed.body.posts).toHaveLength(1);
    expect(feed.body.posts[0].text).toBe("share me to alice feed");
    expect(feed.body.meta.sharableTotal).toBe(1);
    expect(feed.body.meta.bucket).toBe("unread");
    expect(feed.body.meta.counts.unread).toBe(1);

    const read = await alice.post(`/api/posts/${postId}/friends-feed-review`).send({ action: "read" });
    expect(read.status).toBe(200);

    const unreadAfter = await alice.get("/api/users/testuser/friends-feed?bucket=unread");
    expect(unreadAfter.body.posts).toHaveLength(0);
    expect(unreadAfter.body.meta.counts.read).toBe(1);

    const readFeed = await alice.get("/api/users/testuser/friends-feed?bucket=read");
    expect(readFeed.body.posts).toHaveLength(1);
    expect(readFeed.body.posts[0].text).toBe("share me to alice feed");

    const saved = await alice.post(`/api/posts/${postId}/friends-feed-review`).send({ action: "save" });
    expect(saved.status).toBe(200);

    const savedFeed = await alice.get("/api/users/testuser/friends-feed?bucket=saved");
    expect(savedFeed.body.posts).toHaveLength(1);
    expect(savedFeed.body.meta.counts.saved).toBe(1);

    const discard = await alice.post(`/api/posts/${postId}/friends-feed-review`).send({ action: "discard" });
    expect(discard.status).toBe(200);

    const discardedFeed = await alice.get("/api/users/testuser/friends-feed?bucket=discarded");
    expect(discardedFeed.body.posts).toHaveLength(1);
    expect(discardedFeed.body.meta.counts.discarded).toBe(1);

    const unshared = await bob.post(`/api/posts/${postId}/friends-feed-share`).send({ shared: false });
    expect(unshared.status).toBe(200);

    const empty = await alice.get("/api/users/testuser/friends-feed");
    expect(empty.body.posts).toHaveLength(0);
  });

  it("supports nested comment replies at any depth", async () => {
    const { alice, bob } = await createAgents();
    await loginTestUser(alice);
    await loginTestUser(bob);

    const post = await alice.post("/api/users/testuser/posts").send({ type: "TEXT", text: "thread root" });
    expect(post.status).toBe(201);
    const postId = post.body.post.id as string;

    const root = await bob.post(`/api/posts/${postId}/comments`).send({ text: "top level" });
    expect(root.status).toBe(201);
    expect(root.body.comment.parentId).toBeNull();
    const rootId = root.body.comment.id as string;

    const reply = await alice.post(`/api/posts/${postId}/comments`).send({ text: "first reply", parentId: rootId });
    expect(reply.status).toBe(201);
    expect(reply.body.comment.parentId).toBe(rootId);
    const replyId = reply.body.comment.id as string;

    const nested = await bob
      .post(`/api/posts/${postId}/comments`)
      .send({ text: "reply to reply", parentId: replyId });
    expect(nested.status).toBe(201);
    expect(nested.body.comment.parentId).toBe(replyId);

    const list = await alice.get(`/api/posts/${postId}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.comments).toHaveLength(3);
    expect(list.body.comments.map((c: { parentId: string | null }) => c.parentId)).toEqual([
      null,
      rootId,
      replyId,
    ]);
  });

  it("returns blog entries sorted by committedAt desc (public)", async () => {
    const older = new Date("2024-01-01T12:00:00.000Z");
    const newer = new Date("2024-06-01T12:00:00.000Z");
    db.blogEntries.push(
      {
        id: id(),
        slug: "first-feature-abc1234",
        title: "First feature",
        body: "First feature\n\nDetails here.",
        committedAt: older,
        sha: "abc1234567890abcdef1234567890abcdef123456",
        authorName: "Alice",
        createdAt: older,
        updatedAt: older,
      },
      {
        id: id(),
        slug: "second-release-def5678",
        title: "Second release",
        body: "Second release",
        committedAt: newer,
        sha: "def5678901234abcdef5678901234abcdef567890",
        authorName: "Bob",
        createdAt: newer,
        updatedAt: newer,
      },
    );

    const { app } = await createAgents();
    const res = await request(app).get("/api/blog");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].title).toBe("Second release");
    expect(res.body.entries[1].title).toBe("First feature");
    expect(res.body.entries[1].body).toContain("Details here.");
  });

  it("lists feedback publicly without login", async () => {
    db.feedbackItems.push({
      id: id(),
      authorId: db.users[0]?.id ?? id(),
      title: "Public idea",
      body: "Anyone can read this.",
      createdAt: now(),
      updatedAt: now(),
    });
    if (db.users.length === 0) {
      const u: UserRec = {
        id: db.feedbackItems[0].authorId,
        fbUserId: null,
        email: null,
        displayName: "Alice",
        username: "testuser",
        profilePicUrl: null,
        bannerImageKey: null,
        bannerPositionX: 50,
        bannerPositionY: 50,
        createdAt: now(),
        updatedAt: now(),
      };
      db.users.push(u);
    }

    const { app } = await createAgents();
    const res = await request(app).get("/api/feedback");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("Public idea");
  });

  it("rejects feedback posts with a wrong captcha", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);
    await fetchFeedbackCaptchaAnswer(alice);

    const res = await alice.post("/api/feedback").send({
      title: "Spam",
      body: "Should not post",
      captchaAnswer: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("captcha");
  });

  it("creates feedback, allows author edit, and supports threaded comments", async () => {
    const { alice, bob } = await createAgents();
    await loginTestUser(alice);
    await loginTestUser2(bob);

    const captchaAnswer = await fetchFeedbackCaptchaAnswer(alice);
    const created = await alice.post("/api/feedback").send({
      title: "Dark mode please",
      body: "Would love a dark theme toggle.",
      captchaAnswer,
    });
    expect(created.status).toBe(201);
    expect(created.body.item.title).toBe("Dark mode please");
    const feedbackId = created.body.item.id as string;

    const forbidden = await bob.patch(`/api/feedback/${feedbackId}`).send({
      title: "Hijacked",
      body: "Nope",
    });
    expect(forbidden.status).toBe(403);

    const edited = await alice.patch(`/api/feedback/${feedbackId}`).send({
      title: "Dark mode please",
      body: "Would love a dark theme toggle in settings.",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.item.body).toContain("settings");

    const root = await bob.post(`/api/feedback/${feedbackId}/comments`).send({ text: "+1" });
    expect(root.status).toBe(201);
    const rootId = root.body.comment.id as string;

    const reply = await alice
      .post(`/api/feedback/${feedbackId}/comments`)
      .send({ text: "On the roadmap", parentId: rootId });
    expect(reply.status).toBe(201);
    expect(reply.body.comment.parentId).toBe(rootId);

    const list = await bob.get(`/api/feedback/${feedbackId}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.comments).toHaveLength(2);
  });

  it("returns a friendly 400 for oversized image upload policy failures", async () => {
    const { alice } = await createAgents();
    await loginTestUser(alice);

    processImageToMaxSizeMock.mockRejectedValueOnce(
      new Error(
        "Image is still larger than 500KB after compression. Use a smaller photo or paste an image link instead.",
      ),
    );

    const tooLarge = Buffer.from("fake-image");
    const res = await alice
      .post("/api/users/testuser/posts")
      .field("caption", "big image")
      .attach("photo", tooLarge, { filename: "big.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("500KB");
  });
});

