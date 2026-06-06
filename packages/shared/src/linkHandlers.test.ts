import { describe, expect, it } from "vitest";
import {
  parseKnownLinkHandler,
  parseYtDlpWebLinkHandler,
  resolveWebLinkHandler,
} from "./linkHandlers.js";

describe("linkHandlers", () => {
  it("parses known YouTube embed handlers", () => {
    const handler = parseKnownLinkHandler("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(handler?.source).toBe("embed");
    if (handler?.source === "embed") {
      expect(handler.embed.kind).toBe("iframe");
    }
  });

  it("returns null for generic articles without yt-dlp probe", () => {
    expect(parseYtDlpWebLinkHandler("https://medium.com/@user/some-story", false)).toBeNull();
    expect(resolveWebLinkHandler("https://medium.com/@user/some-story", false)).toBeNull();
  });

  it("returns yt-dlp native handler when probe succeeds", () => {
    const handler = parseYtDlpWebLinkHandler("https://news.yahoo.com/some-video-123.html", true);
    expect(handler).toMatchObject({
      source: "ytdlp",
      pageUrl: "https://news.yahoo.com/some-video-123.html",
      hostname: "news.yahoo.com",
      externalLabel: "news.yahoo.com",
      layout: "landscape",
    });
  });

  it("prefers known embed handlers over yt-dlp probe", () => {
    const handler = resolveWebLinkHandler("https://www.youtube.com/watch?v=dQw4w9WgXcQ", true);
    expect(handler?.source).toBe("embed");
  });
});
