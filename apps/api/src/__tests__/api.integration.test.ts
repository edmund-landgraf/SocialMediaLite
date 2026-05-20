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
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CommentRec = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
};

const db = {
  users: [] as UserRec[],
  friendships: [] as FriendshipRec[],
  posts: [] as PostRec[],
  comments: [] as CommentRec[],
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
    async update(args: { where: { id: string }; data: Partial<Pick<UserRec, "bannerImageKey">> }) {
      const row = db.users.find((u) => u.id === args.where.id);
      if (!row) throw new Error("user not found");
      if (args.data.bannerImageKey !== undefined) row.bannerImageKey = args.data.bannerImageKey ?? null;
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
    async findMany(args: { where: Record<string, unknown>; include?: { requester: true; addressee: true } }) {
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
    async findMany(args: { where: { profileOwnerId: string }; orderBy?: unknown; include?: Record<string, unknown> }) {
      const rows = db.posts
        .filter((p) => p.profileOwnerId === args.where.profileOwnerId)
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
      if (!args.include) return rows.map((r) => ({ ...r }));
      return rows.map((r) => ({
        ...r,
        author: findUserById(r.authorId),
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
      };
      db.posts.push(rec);
      if (!args.include) return { ...rec };
      return { ...rec, author: findUserById(rec.authorId) };
    },
    async findUnique(args: { where: { id: string }; select?: { profileOwnerId: true } }) {
      const row = db.posts.find((p) => p.id === args.where.id);
      if (!row) return null;
      if (args.select?.profileOwnerId) return { profileOwnerId: row.profileOwnerId };
      return { ...row };
    },
    async update(args: { where: { id: string }; data: Partial<Pick<PostRec, "isPinned" | "photoCaption">>; include?: Record<string, unknown> }) {
      const row = db.posts.find((p) => p.id === args.where.id);
      if (!row) throw new Error("post not found");
      if (args.data.isPinned !== undefined) row.isPinned = args.data.isPinned;
      if (args.data.photoCaption !== undefined) row.photoCaption = args.data.photoCaption ?? null;
      row.updatedAt = now();
      if (!args.include) return { ...row };
      return { ...row, author: findUserById(row.authorId), _count: { comments: db.comments.filter((c) => c.postId === row.id).length } };
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
    async create(args: { data: { postId: string; authorId: string; text: string } }) {
      const rec: CommentRec = {
        id: id(),
        createdAt: now(),
        updatedAt: now(),
        ...args.data,
      };
      db.comments.push(rec);
      return { ...rec, author: findUserById(rec.authorId) };
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

