import { describe, expect, it } from "vitest";
import {
  filterFacebookPostsByTitle,
  formatFacebookGraphError,
  mapGraphPostToPreview,
} from "./facebookImport.js";

describe("facebookImport", () => {
  it("formats Facebook rate-limit errors", () => {
    const err = formatFacebookGraphError(
      "Facebook post fetch failed",
      403,
      JSON.stringify({ error: { message: "(#4) Application request limit reached", code: 4, is_transient: true } }),
    );
    expect(err.message).toContain("rate limit");
  });

  it("maps a text post to title and description", () => {
    const preview = mapGraphPostToPreview({
      id: "123_456",
      message: "Hello world\nSecond line detail",
      created_time: "2026-05-01T12:00:00+0000",
    });
    expect(preview.title).toBe("Hello world");
    expect(preview.description).toBe("Second line detail");
    expect(preview.previewType).toBe("text");
  });

  it("filters posts by title query", () => {
    const posts = [
      mapGraphPostToPreview({ id: "1", message: "Vacation photos" }),
      mapGraphPostToPreview({ id: "2", message: "Work update" }),
    ];
    expect(filterFacebookPostsByTitle(posts, "vacation")).toHaveLength(1);
  });

  it("maps photo posts with a preview image url", () => {
    const preview = mapGraphPostToPreview({
      id: "789",
      message: "ahh, too many side projects!",
      attachments: {
        data: [
          {
            type: "photo",
            media: { image: { src: "https://example.com/photo.jpg" } },
          },
        ],
      },
    });
    expect(preview.previewType).toBe("photo");
    expect(preview.previewImageUrl).toBe("https://example.com/photo.jpg");
  });

  it("detects a reel URL in post text", () => {
    const preview = mapGraphPostToPreview({
      id: "123_456",
      message:
        "Craft Rave!\nI'm down to help produce something here!\nhttps://www.facebook.com/reel/1179569570797101",
      created_time: "2026-05-17T04:06:00+0000",
      attachments: {
        data: [
          {
            type: "video_inline",
            title: "POV: You're at a craft rave",
            description: "All kinds of spinning happening at another jam packed craft rave",
            url: "https://www.facebook.com/reel/1179569570797101",
            media: { image: { src: "https://example.com/reel-thumb.jpg" } },
          },
        ],
      },
    });
    expect(preview.previewType).toBe("reel");
    expect(preview.title).toBe("Craft Rave!");
    expect(preview.description).toBe("I'm down to help produce something here!");
  });
});
