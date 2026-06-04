import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { generateAiSummaryPreview } from "../services/aiSummary/generatePreview.js";
import { LlmNotConfiguredError } from "../services/llm/complete.js";
import { isOfflineTestUserSession } from "../services/offlineTestUser.js";

export const aiSummaryRouter = Router();

const previewBodySchema = z.object({
  mode: z.enum(["real", "comedy"]).default("real"),
});

aiSummaryRouter.post("/me/ai-summary/preview", requireAuth, async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.status(503).json({
      error: "AI summary is not available in offline test mode.",
    });
    return;
  }

  const userId = req.session.userId!;

  const parsed = previewBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const preview = await generateAiSummaryPreview(userId, parsed.data.mode);
    res.json({
      mode: preview.mode,
      narrative: preview.narrative,
      sections: preview.sections,
    });
  } catch (e) {
    console.error("AI summary preview failed:", e);
    if (e instanceof LlmNotConfiguredError) {
      res.status(503).json({ error: e.message });
      return;
    }
    const message = e instanceof Error ? e.message : "Failed to generate summary";
    res.status(500).json({ error: message });
  }
});
