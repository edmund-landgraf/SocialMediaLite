import { describe, expect, it } from "vitest";
import {
  canonicalYouTubeWatchUrl,
  isYouTubeHostname,
  parseYouTubeVideoId,
} from "./youtubeMetadata.js";

describe("youtubeMetadata URL helpers", () => {
  it("detects YouTube hostnames", () => {
    expect(isYouTubeHostname("www.youtube.com")).toBe(true);
    expect(isYouTubeHostname("youtu.be")).toBe(true);
    expect(isYouTubeHostname("example.com")).toBe(false);
  });

  it("parses watch, short, and youtu.be URLs", () => {
    expect(
      parseYouTubeVideoId(new URL("https://www.youtube.com/watch?v=-SSYX8sIOmM")),
    ).toBe("-SSYX8sIOmM");
    expect(parseYouTubeVideoId(new URL("https://youtu.be/-SSYX8sIOmM"))).toBe("-SSYX8sIOmM");
    expect(
      parseYouTubeVideoId(new URL("https://www.youtube.com/shorts/-SSYX8sIOmM")),
    ).toBe("-SSYX8sIOmM");
  });

  it("builds canonical watch URLs", () => {
    expect(
      canonicalYouTubeWatchUrl(new URL("https://www.youtube.com/watch?v=abc123_-XYZ")),
    ).toBe("https://www.youtube.com/watch?v=abc123_-XYZ");
  });
});
