import { describe, expect, it } from "vitest";
import {
  isPublicReel,
  isUnavailableFacebookMetadata,
  parseYtDlpFacebookReelTitle,
} from "./facebookReelMetadata.js";

describe("facebookReelMetadata", () => {
  it("flags Facebook login-wall copy", () => {
    expect(isUnavailableFacebookMetadata("See more on Facebook")).toBe(true);
    expect(isUnavailableFacebookMetadata("This content isn't available right now")).toBe(true);
    expect(
      isUnavailableFacebookMetadata(
        "When this happens, it's usually because the owner only shared it with a small group of people",
      ),
    ).toBe(true);
    expect(isUnavailableFacebookMetadata("POV: You're at a craft rave")).toBe(false);
  });

  it("parses yt-dlp Facebook reel titles", () => {
    const parsed = parseYtDlpFacebookReelTitle(
      "13M views · 367K reactions | SOUND ON: Otters at the park | Pennsylvania DCNR",
    );
    expect(parsed.title).toBe("SOUND ON: Otters at the park");
    expect(parsed.authorName).toBe("Pennsylvania DCNR");
  });

  it("treats reels as public only when Graph confirms access", () => {
    expect(
      isPublicReel(
        {
          title: "Craft rave",
          description: "Yarn and paint",
          thumbnailUrl: "https://cdn.example/thumb.jpg",
          permalinkUrl: "https://www.facebook.com/reel/1",
          authorName: "Karla",
        },
        { videoNodeOk: true, graphThumbnailOk: true, postEmbedOk: false, ytDlpOk: false },
      ),
    ).toBe(true);

    expect(
      isPublicReel(
        {
          title: null,
          description: null,
          thumbnailUrl: "https://cdn.example/thumb.jpg",
          permalinkUrl: "https://www.facebook.com/reel/1",
          authorName: null,
        },
        { videoNodeOk: false, graphThumbnailOk: false, postEmbedOk: true, ytDlpOk: false },
      ),
    ).toBe(true);

    expect(
      isPublicReel(
        {
          title: "Otters rager",
          description: null,
          thumbnailUrl: "https://cdn.example/thumb.jpg",
          permalinkUrl: "https://www.facebook.com/reel/1",
          authorName: "PA DCNR",
        },
        { videoNodeOk: false, graphThumbnailOk: false, postEmbedOk: false, ytDlpOk: true },
      ),
    ).toBe(true);

    expect(
      isPublicReel(
        {
          title: null,
          description: null,
          thumbnailUrl: "https://cdn.example/thumb.jpg",
          permalinkUrl: "https://www.facebook.com/reel/1",
          authorName: null,
        },
        { videoNodeOk: false, graphThumbnailOk: false, postEmbedOk: false, ytDlpOk: false },
      ),
    ).toBe(false);
  });
});
