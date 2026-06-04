import { describe, expect, it } from "vitest";
import { isInlineVideoLink, resolveInlineVideoEmbed } from "./videoEmbeds.js";

describe("resolveInlineVideoEmbed", () => {
  it("resolves YouTube watch URLs", () => {
    const embed = resolveInlineVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(embed?.kind).toBe("iframe");
    expect(embed?.layout).toBe("landscape");
    if (embed?.kind === "iframe") {
      expect(embed.embedUrl).toContain("youtube.com/embed/dQw4w9WgXcQ");
    }
  });

  it("resolves Instagram reels with embed iframe and yt-dlp fallback", () => {
    const embed = resolveInlineVideoEmbed("https://www.instagram.com/reel/ABC123xyz/");
    expect(embed?.kind).toBe("iframe");
    expect(embed?.layout).toBe("portrait");
    if (embed?.kind === "iframe") {
      expect(embed.embedUrl).toBe("https://www.instagram.com/reel/ABC123xyz/embed/");
      expect(embed.nativeFallback?.externalLabel).toBe("Instagram");
      expect(embed.nativeFallback?.pageUrl).toContain("instagram.com/reel/ABC123xyz");
    }
  });

  it("resolves TikTok with iframe and yt-dlp fallback", () => {
    const embed = resolveInlineVideoEmbed("https://www.tiktok.com/@user/video/7123456789012345678");
    expect(embed?.kind).toBe("iframe");
    if (embed?.kind === "iframe") {
      expect(embed.embedUrl).toContain("tiktok.com/embed/v2/7123456789012345678");
      expect(embed.embedUrl).toContain("lang=en-US");
      expect(embed.nativeFallback?.externalLabel).toBe("TikTok");
    }
  });

  it("resolves X status URLs with embed and yt-dlp fallback", () => {
    const embed = resolveInlineVideoEmbed("https://x.com/someone/status/1234567890123456789");
    expect(embed?.kind).toBe("iframe");
    if (embed?.kind === "iframe") {
      expect(embed.embedUrl).toContain("platform.twitter.com/embed/Tweet.html?id=1234567890123456789");
      expect(embed.nativeFallback?.externalLabel).toBe("X");
    }
  });

  it("does not treat Snapchat as inline video", () => {
    expect(resolveInlineVideoEmbed("https://www.snapchat.com/spotlight/abc")).toBeNull();
  });

  it("resolves Instagram /reels/ share URLs", () => {
    const embed = resolveInlineVideoEmbed("https://www.instagram.com/reels/DZD4zLjPqwt/");
    expect(embed?.kind).toBe("iframe");
    expect(embed?.layout).toBe("portrait");
    if (embed?.kind === "iframe") {
      expect(embed.embedUrl).toContain("/reel/DZD4zLjPqwt/embed/");
      expect(embed.nativeFallback?.externalLabel).toBe("Instagram");
    }
  });

  it("resolves Facebook reel URLs", () => {
    const embed = resolveInlineVideoEmbed("https://www.facebook.com/reel/1179569570797101");
    expect(embed?.kind).toBe("iframe");
    expect(embed?.layout).toBe("portrait");
    if (embed?.kind === "iframe") {
      expect(embed.embedUrl).toContain("facebook.com/plugins/video.php");
    }
  });

  it("returns null for generic web links", () => {
    expect(isInlineVideoLink("https://example.com/article")).toBe(false);
  });
});
