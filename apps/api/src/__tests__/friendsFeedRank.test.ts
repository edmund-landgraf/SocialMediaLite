import { describe, expect, it } from "vitest";
import { rankFriendsFeedPosts, scoreFriendsFeedCandidate } from "../services/friendsFeedRank.js";

describe("friendsFeedRank", () => {
  it("prefers newer and more engaged posts", () => {
    const now = Date.now();
    const older = {
      postId: "a",
      authorId: "u1",
      profileOwnerId: "u1",
      createdAt: new Date(now - 48 * 60 * 60 * 1000),
      commentCount: 0,
      authorSharedPostCount: 1,
    };
    const newer = {
      postId: "b",
      authorId: "u1",
      profileOwnerId: "u1",
      createdAt: new Date(now - 1 * 60 * 60 * 1000),
      commentCount: 5,
      authorSharedPostCount: 1,
    };
    expect(scoreFriendsFeedCandidate(newer, {}, now)).toBeGreaterThan(scoreFriendsFeedCandidate(older, {}, now));
  });

  it("boosts authors who have appeared less on the feed", () => {
    const now = Date.now();
    const base = {
      postId: "a",
      authorId: "quiet",
      profileOwnerId: "quiet",
      createdAt: new Date(now),
      commentCount: 0,
      authorSharedPostCount: 1,
    };
    const fresh = scoreFriendsFeedCandidate(base, {}, now);
    const saturated = scoreFriendsFeedCandidate(base, { quiet: 5 }, now);
    expect(fresh).toBeGreaterThan(saturated);
  });

  it("updates appearance history for ranked authors", () => {
    const now = Date.now();
    const candidates = [
      {
        postId: "1",
        authorId: "a",
        profileOwnerId: "a",
        createdAt: new Date(now),
        commentCount: 0,
        authorSharedPostCount: 1,
      },
      {
        postId: "2",
        authorId: "b",
        profileOwnerId: "b",
        createdAt: new Date(now),
        commentCount: 0,
        authorSharedPostCount: 3,
      },
    ];
    const { nextAppearanceHistory, meta } = rankFriendsFeedPosts(candidates, {}, { nowMs: now });
    expect(meta.sharableTotal).toBe(2);
    expect(nextAppearanceHistory.a).toBe(1);
    expect(nextAppearanceHistory.b).toBe(1);
  });
});
