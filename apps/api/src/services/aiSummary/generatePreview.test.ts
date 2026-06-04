import { describe, expect, it } from "vitest";
import {
  buildAnalystMarkdown,
  buildComedyResult,
  parseSummarySections,
  pickAnalystSections,
} from "./generatePreview.js";

describe("parseSummarySections", () => {
  it("parses analyst sections", () => {
    const md = `## About me
Analyst bit.

## What I share
Sharing bit.

## How I engage
Engage bit.`;

    const sections = parseSummarySections(md);
    expect(sections).toHaveLength(3);
  });
});

describe("pickAnalystSections", () => {
  it("keeps only the three analyst sections in order", () => {
    const picked = pickAnalystSections([
      { title: "What I share", body: "B" },
      { title: "About me", body: "A" },
      { title: "How I engage", body: "C" },
    ]);
    expect(picked.map((s) => s.title)).toEqual(["About me", "What I share", "How I engage"]);
  });
});

describe("buildAnalystMarkdown", () => {
  it("rebuilds markdown for real mode", () => {
    const md = buildAnalystMarkdown([
      { title: "About me", body: "One." },
      { title: "What I share", body: "Two." },
      { title: "How I engage", body: "Three." },
    ]);
    expect(md).toContain("## About me");
    expect(md).not.toContain("AI's Take");
  });
});

describe("buildComedyResult", () => {
  it("wraps multi-paragraph comedy under AI's Take", () => {
    const result = buildComedyResult(
      `## AI's Take\n\nFirst bit.\n\nSecond tangent.\n\nThird punchline.`,
    );
    expect(result.mode).toBe("comedy");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.title).toBe("AI's Take");
    expect(result.sections[0]?.body).toContain("tangent");
    expect(result.narrative).toContain("## AI's Take");
  });
});
