import { describe, expect, it } from "vitest";
import {
  buildFriendsFeedBucketCounts,
  postMatchesFriendsFeedBucket,
} from "../services/friendsFeedReview.js";

describe("friendsFeedReview", () => {
  it("counts unread posts without review rows", () => {
    const counts = buildFriendsFeedBucketCounts(
      ["a", "b", "c"],
      [{ postId: "b", status: "READ", updatedAt: new Date() }],
    );
    expect(counts).toEqual({ unread: 2, read: 1, saved: 0, discarded: 0 });
  });

  it("matches bucket by review status", () => {
    const map = new Map<string, "READ" | "SAVED" | "DISCARDED">([["p1", "SAVED"]]);
    expect(postMatchesFriendsFeedBucket("p1", map, "unread")).toBe(false);
    expect(postMatchesFriendsFeedBucket("p1", map, "saved")).toBe(true);
    expect(postMatchesFriendsFeedBucket("p2", map, "unread")).toBe(true);
  });
});
