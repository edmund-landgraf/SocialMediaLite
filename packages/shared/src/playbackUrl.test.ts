import { describe, expect, it } from "vitest";
import { normalizePlaybackPageUrl } from "./playbackUrl.js";

describe("normalizePlaybackPageUrl", () => {
  it("normalizes Instagram /reels/ to /reel/", () => {
    expect(normalizePlaybackPageUrl("https://www.instagram.com/reels/ABC/")).toBe(
      "https://www.instagram.com/reel/ABC/",
    );
  });

  it("adds www to bare tiktok.com host", () => {
    expect(normalizePlaybackPageUrl("https://tiktok.com/@x/video/1")).toBe(
      "https://www.tiktok.com/@x/video/1",
    );
  });
});
