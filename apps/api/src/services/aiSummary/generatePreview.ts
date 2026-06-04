import { completeChat } from "../llm/complete.js";
import {
  aggregateSelfActivity,
  formatAggregateForLlm,
} from "./aggregateSelf.js";

export type AiSummaryMode = "real" | "comedy";

const ANALYST_SECTION_TITLES = ["About me", "What I share", "How I engage"] as const;

const REAL_SYSTEM_PROMPT = `You write a third-person narrative profile summary for a small social network.

You will receive the user's timeline posts, comments, activity counts, and profile metadata as plain text. Read all of it carefully.

Rules:
- Derive interests, preferences, tone, and themes only from patterns in that source material.
- Use inference: move beyond literal restatement and explain likely motivations, patterns, and priorities.
- Phrase uncertain points probabilistically ("likely", "appears to", "suggests", "possibly"), and avoid over-claiming.
- Do not invent specific facts, events, or relationships that are not supported by the text.
- Do not use long bullet lists of individual posts; write flowing prose.
- Write in third person about the user (by name or "the user"), not in first person.
- Include a few concrete examples from the source text, but synthesize them instead of exhaustively listing them.
- Keep each section to 1-2 compact paragraphs.
- When niche terms appear (e.g., startup/AI jargon), add short parenthetical context for a general reader.
- Include brief source references inline as (from: "<short quote>") 3-6 times total across the output.
- About 220-320 words total across all three sections.
- Do NOT write humor, jokes, bullet lists of fun facts, or a closing sales pitch.

Return markdown with exactly these section headings (same spelling and punctuation):
## About me
## What I share
## How I engage

Output only those three sections.`;

const COMEDY_SYSTEM_PROMPT = `You are a dry, deadpan comedian writing a satirical profile roast from someone's social media activity.

You receive their raw posts, comments, stats, and profile metadata. Read it all, then perform — do NOT write a neutral profile summary.

Rules:
- Address the user as "you" (second person).
- Write exactly 3 to 5 paragraphs (minimum 3, maximum 5), separated by blank lines.
- Go on entertaining tangents: absurd analogies, fake documentaries, bureaucratic asides, overheard dialogue, sudden topic pivots — then snap back to a punchline. Tangents must still orbit their real posts/comments.
- Be specific: cite odd link topics, comment habits (e.g. one-letter replies), post types, reaction counts, new-account energy, contradictions.
- Sound like stage comedy, not LinkedIn ("curious enthusiast", "perfect person to connect with") and not a bullet-list of fun facts.
- No bullet points or numbered lists. No sub-headings inside the section.
- Affectionate roast, not cruel or bigoted.
- About 280-450 words total.
- Do not use (from: "...") citations.

Return markdown with exactly this heading (same spelling and punctuation):
## AI's Take

Put only your 3-5 comedy paragraphs under that heading. Output nothing else.`;

export type AiSummaryPreviewResult = {
  mode: AiSummaryMode;
  narrative: string;
  sections: { title: string; body: string }[];
};

export function parseSummarySections(narrative: string): { title: string; body: string }[] {
  const trimmed = narrative.trim();
  if (!trimmed) return [];

  const chunks = trimmed.split(/^##\s+/m).filter(Boolean);
  if (chunks.length === 1 && !trimmed.startsWith("##")) {
    return [{ title: "Summary", body: trimmed }];
  }

  return chunks.map((chunk) => {
    const newline = chunk.indexOf("\n");
    if (newline === -1) return { title: chunk.trim(), body: "" };
    return {
      title: chunk.slice(0, newline).trim(),
      body: chunk.slice(newline + 1).trim(),
    };
  });
}

function normalizeSectionTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function pickAnalystSections(sections: { title: string; body: string }[]): {
  title: string;
  body: string;
}[] {
  const byTitle = new Map(
    sections.map((s) => [normalizeSectionTitle(s.title), s] as const),
  );
  return ANALYST_SECTION_TITLES.map((title) => {
    const found = byTitle.get(title.toLowerCase());
    return { title, body: found?.body?.trim() ?? "" };
  });
}

export function buildAnalystMarkdown(sections: { title: string; body: string }[]): string {
  return pickAnalystSections(sections)
    .map((s) => `## ${s.title}\n${s.body}`)
    .join("\n\n")
    .trim();
}

export function buildComedyResult(raw: string): AiSummaryPreviewResult {
  const parsed = parseSummarySections(raw);
  const aiTake =
    parsed.find((s) => normalizeSectionTitle(s.title) === "ai's take") ??
    parsed[0];
  const body = aiTake?.body?.trim() || raw.trim();
  const narrative = `## AI's Take\n\n${body}`;
  return {
    mode: "comedy",
    narrative,
    sections: [{ title: "AI's Take", body }],
  };
}

function buildRealResult(raw: string): AiSummaryPreviewResult {
  const sections = pickAnalystSections(parseSummarySections(raw));
  const narrative = buildAnalystMarkdown(sections);
  return { mode: "real", narrative, sections };
}

export async function generateAiSummaryPreview(
  userId: string,
  mode: AiSummaryMode = "real",
): Promise<AiSummaryPreviewResult> {
  const aggregate = await aggregateSelfActivity(userId);
  const sourceCorpus = formatAggregateForLlm(aggregate);

  if (!aggregate.wallPosts.length && !aggregate.comments.length) {
    throw new Error("No post or comment text found on your profile to summarize.");
  }

  const system = mode === "comedy" ? COMEDY_SYSTEM_PROMPT : REAL_SYSTEM_PROMPT;
  const userPrompt =
    mode === "comedy"
      ? [
          `Write the comedy roast for ${aggregate.profile.displayName}.`,
          "3-5 paragraphs under ## AI's Take only. Tangents welcome. Ground jokes in the corpus below.",
          "",
          sourceCorpus,
        ].join("\n")
      : [
          "Write the three analyst sections from this activity corpus.",
          "Factual, third person, probabilistic where needed.",
          "",
          sourceCorpus,
        ].join("\n");

  const raw = await completeChat([
    { role: "system", content: system },
    { role: "user", content: userPrompt },
  ]);

  return mode === "comedy" ? buildComedyResult(raw) : buildRealResult(raw);
}
