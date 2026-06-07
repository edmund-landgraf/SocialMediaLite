import { describe, expect, it } from "vitest";
import { buildSyndicationPushMessage } from "./syndicationPush.js";
import type { PostSyndicationSnapshot } from "./postSyndication.js";

const baseSnapshot = (overrides?: Partial<PostSyndicationSnapshot["post"]>): PostSyndicationSnapshot => ({
  post: {
    id: "p1",
    type: "TEXT",
    text: "Hello from the west coast jazz list.",
    photoCaption: null,
    videoUrl: null,
    linkTitle: null,
    linkDescription: null,
    photoUrl: null,
    linkPreviewUrl: null,
    textBackgroundColor: null,
    textColor: null,
    textFontSize: null,
    createdAt: "2026-06-06T12:00:00.000Z",
    author: { displayName: "Alex", username: "alex", profilePicUrl: null },
    profileOwner: { displayName: "Alex", username: "alex", profilePicUrl: null },
    ...overrides,
  },
  comments: [],
});

describe("buildSyndicationPushMessage", () => {
  it("uses post text and appends join line", () => {
    const message = buildSyndicationPushMessage(baseSnapshot());
    expect(message).toContain("Hello from the west coast jazz list.");
    expect(message).toContain("Join the deeper discussion on SocialMediaLite.");
  });

  it("falls back to photo caption", () => {
    const message = buildSyndicationPushMessage(
      baseSnapshot({ type: "PHOTO", text: null, photoCaption: "Sunset photo" }),
    );
    expect(message.startsWith("Sunset photo")).toBe(true);
  });
});
