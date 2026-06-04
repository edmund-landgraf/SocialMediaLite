import { describe, expect, it } from "vitest";
import { pickYtDlpPlaybackFormat } from "./ytDlpClient.js";

describe("pickYtDlpPlaybackFormat", () => {
  it("prefers progressive mp4 with audio over HLS and video-only", () => {
    const pageUrl = "https://www.tiktok.com/@user/video/1";
    const playback = pickYtDlpPlaybackFormat(
      {
        formats: [
          {
            url: "https://cdn.example/hls.m3u8",
            ext: "mp4",
            protocol: "m3u8",
            vcodec: "h264",
            acodec: "aac",
            height: 1080,
          },
          {
            url: "https://cdn.example/video-only.mp4",
            ext: "mp4",
            vcodec: "h264",
            acodec: "none",
            height: 1080,
          },
          {
            url: "https://cdn.example/play.mp4",
            ext: "mp4",
            vcodec: "h264",
            acodec: "aac",
            height: 720,
            http_headers: { Referer: pageUrl },
          },
        ],
      },
      pageUrl,
    );

    expect(playback?.url).toBe("https://cdn.example/play.mp4");
    expect(playback?.requestHeaders.Referer).toBe(pageUrl);
    expect(playback?.requestHeaders.Origin).toBe("https://www.tiktok.com");
  });

  it("forwards yt-dlp cookie blobs for CDN auth", () => {
    const playback = pickYtDlpPlaybackFormat(
      {
        formats: [
          {
            url: "https://cdn.example/play.mp4",
            ext: "mp4",
            vcodec: "h264",
            acodec: "aac",
            format_id: "download",
            cookies: "ttwid=abc; Domain=.tiktok.com; Path=/; tt_chain_token=xyz; Domain=.tiktok.com",
            http_headers: { Referer: "https://www.tiktok.com/@u/video/1" },
          },
        ],
      },
      "https://www.tiktok.com/@u/video/1",
    );

    expect(playback?.requestHeaders.Cookie).toContain("ttwid=abc");
    expect(playback?.requestHeaders.Cookie).toContain("tt_chain_token=xyz");
  });
});
