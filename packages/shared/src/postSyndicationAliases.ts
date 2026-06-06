import { z } from "zod";

const ADJECTIVES = [
  "cuddly",
  "swift",
  "mighty",
  "gentle",
  "bright",
  "quiet",
  "lucky",
  "clever",
  "cosmic",
  "sunny",
  "misty",
  "brave",
  "jolly",
  "witty",
  "zesty",
] as const;

const NOUNS = [
  "bear",
  "oak",
  "river",
  "falcon",
  "maple",
  "otter",
  "comet",
  "meadow",
  "sparrow",
  "willow",
  "badger",
  "cedar",
  "heron",
  "pebble",
  "fox",
] as const;

export const postSyndicationUpsertSchema = z.object({
  randomizeNames: z.boolean().optional().default(true),
});

export type PostSyndicationUpsertInput = z.infer<typeof postSyndicationUpsertSchema>;

function pickWord<T extends readonly string[]>(words: T, index: number): T[number] {
  return words[index % words.length]!;
}

/** Stable random alias like `cuddlybear45` — unique within `usedAliases`. */
export function generatePostSyndicationAlias(usedAliases: ReadonlySet<string>, seed = 0): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    const adj = pickWord(ADJECTIVES, seed + attempt);
    const noun = pickWord(NOUNS, seed + attempt);
    const num = 10 + ((seed * 3 + attempt * 17) % 90);
    const alias = `${adj}${noun}${num}`;
    if (!usedAliases.has(alias)) return alias;
  }

  let fallback = `${pickWord(ADJECTIVES, seed)}${pickWord(NOUNS, seed + 1)}${seed % 1000}`;
  while (usedAliases.has(fallback)) {
    fallback = `${fallback}x`;
  }
  return fallback;
}
