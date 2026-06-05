import { describe, expect, it } from "vitest";
import {
  canModifyMessage,
  messagePreviewText,
  sortParticipantPair,
} from "./access.js";

describe("sortParticipantPair", () => {
  it("orders ids lexicographically", () => {
    const [low, high] = sortParticipantPair("b", "a");
    expect(low).toBe("a");
    expect(high).toBe("b");
  });
});

describe("canModifyMessage", () => {
  it("allows thread owner and author", () => {
    expect(canModifyMessage("owner", "owner", "other")).toBe(true);
    expect(canModifyMessage("author", "owner", "author")).toBe(true);
    expect(canModifyMessage("stranger", "owner", "author")).toBe(false);
  });
});

describe("messagePreviewText", () => {
  it("returns placeholder for deleted messages", () => {
    expect(messagePreviewText("hello", new Date())).toBe("Message removed");
  });

  it("truncates long text", () => {
    const long = "a".repeat(150);
    expect(messagePreviewText(long, null).endsWith("…")).toBe(true);
  });
});
