import { completeChat } from "../llm/complete.js";
import {
  aggregateSelfActivity,
  formatAggregateForLlm,
} from "./aggregateSelf.js";

const SYSTEM_PROMPT = `You write a third-person narrative profile summary for a small social network.

You will receive the user's timeline posts and comments as plain text. Read all of it carefully.

Rules:
- Derive interests, preferences, tone, and themes only from patterns in that source material.
- Use inference: move beyond literal restatement and explain likely motivations, patterns, and priorities.
- Phrase uncertain points probabilistically ("likely", "appears to", "suggests", "possibly"), and avoid over-claiming.
- Do not invent specific facts, events, or relationships that are not supported by the text.
- Do not use long bullet lists of individual posts; write flowing prose.
- Write in third person about the user (by name or "the user"), not in first person.
- Aim for a medium-length result: concise but substantial (about 260-420 words total).
- Include a few concrete examples from the source text, but synthesize them instead of exhaustively listing them.
- Keep each section to 1-2 compact paragraphs.
- When niche terms appear (e.g., startup/AI jargon), add short parenthetical context for a general reader.
- Include brief source references inline as (from: "<short quote>") 3-6 times total across the whole output.

Return markdown with exactly these section headings:
## About me
## What I share
## How I engage

Output only the markdown summary.`;

export type AiSummaryPreviewResult = {
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

export async function generateAiSummaryPreview(userId: string): Promise<AiSummaryPreviewResult> {
  const aggregate = await aggregateSelfActivity(userId);
  const sourceCorpus = formatAggregateForLlm(aggregate);

  if (!aggregate.wallPosts.length && !aggregate.comments.length) {
    throw new Error("No post or comment text found on your profile to summarize.");
  }

  const narrative = await completeChat([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Write a medium-length narrative profile summary from this activity corpus.",
        "I want something between a tiny profile blurb and a long report.",
        "Avoid hardcoded assumptions and derive everything from the evidence below.",
        "Use third person and inferred/likely statements with clear confidence language.",
        "",
        sourceCorpus,
      ].join("\n"),
    },
  ]);

  return {
    narrative,
    sections: parseSummarySections(narrative),
  };
}
