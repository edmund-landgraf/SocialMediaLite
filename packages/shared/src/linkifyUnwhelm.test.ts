import { describe, expect, it } from "vitest";
import { linkifyUnwhelmText } from "./linkifyUnwhelm.js";

describe("linkifyUnwhelmText", () => {
  it("linkifies absolute unwhelm.online URLs", () => {
    const segments = linkifyUnwhelmText("see https://unwhelm.online/testuser today");
    expect(segments.some((s) => s.type === "link" && s.href.includes("unwhelm.online/testuser"))).toBe(true);
  });

  it("linkifies relative profile paths", () => {
    const segments = linkifyUnwhelmText("visit /testuser for more");
    expect(segments.some((s) => s.type === "link" && s.href === "/testuser")).toBe(true);
  });

  it("leaves off-site URLs as plain text", () => {
    const segments = linkifyUnwhelmText("see https://example.com/page");
    expect(segments.every((s) => s.type === "text")).toBe(true);
  });
});
