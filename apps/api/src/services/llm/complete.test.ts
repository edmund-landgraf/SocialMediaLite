import { describe, expect, it } from "vitest";
import { extractPostTextContent } from "../aiSummary/aggregateSelf.js";
import { assertLlmConfigured, LlmNotConfiguredError } from "./complete.js";

describe("extractPostTextContent", () => {
  it("merges caption, link fields, and dedupes identical blocks", () => {
    const content = extractPostTextContent({
      type: "REEL",
      text: "Same caption",
      photoCaption: "Same caption",
      linkTitle: "Reel title",
      linkDescription: "Longer description",
      videoUrl: "https://example.com/reel",
    });
    expect(content).toContain("Same caption");
    expect(content).toContain("Reel title");
    expect(content).toContain("Longer description");
    expect(content).toContain("https://example.com/reel");
    expect(content.split("Same caption").length).toBe(2);
  });
});

describe("assertLlmConfigured", () => {
  it("rejects stub provider", () => {
    const prev = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "stub";
    try {
      expect(() => assertLlmConfigured()).toThrow(LlmNotConfiguredError);
    } finally {
      if (prev === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = prev;
    }
  });
});
