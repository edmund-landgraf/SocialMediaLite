import { describe, expect, it } from "vitest";
import { isMajorCommit, parseLocalGitLog, slugFromCommit } from "./blogSync.js";

describe("blogSync", () => {
  it("parses local git log records", () => {
    const raw = [
      "abc123def4567890abcdef1234567890abcdef12\x1fAlice\x1f2024-06-01T12:00:00-07:00\x1fFirst feature\n\nMore detail.\x1e",
      "def4567890abcdef1234567890abcdef12345678\x1fBob\x1f2024-05-01T09:00:00-07:00\x1fFix banner\x1e",
    ].join("");

    const commits = parseLocalGitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0].sha).toBe("abc123def4567890abcdef1234567890abcdef12");
    expect(commits[0].commit.author.name).toBe("Alice");
    expect(commits[0].commit.message).toBe("First feature\n\nMore detail.");
    expect(commits[1].commit.message).toBe("Fix banner");
  });

  it("skips merge commits", () => {
    expect(isMajorCommit("Merge branch 'main'")).toBe(false);
    expect(isMajorCommit("Add blog sync")).toBe(true);
  });

  it("builds stable slugs from title and sha", () => {
    expect(slugFromCommit("Add blog sync", "abc1234567890")).toMatch(/^add-blog-sync-abc1234$/);
  });
});
