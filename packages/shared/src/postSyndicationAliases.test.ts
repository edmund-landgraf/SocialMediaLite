import { describe, expect, it } from "vitest";
import { generatePostSyndicationAlias } from "./postSyndicationAliases.js";

describe("generatePostSyndicationAlias", () => {
  it("returns lowercase adjective+noun+digits", () => {
    const alias = generatePostSyndicationAlias(new Set(), 0);
    expect(alias).toMatch(/^[a-z]+\d{2,}$/);
    expect(alias).toBe("cuddlybear10");
  });

  it("avoids duplicates in the same syndication", () => {
    const used = new Set<string>();
    const a = generatePostSyndicationAlias(used, 0);
    used.add(a);
    const b = generatePostSyndicationAlias(used, 0);
    expect(b).not.toBe(a);
    expect(used.has(b)).toBe(false);
  });
});
