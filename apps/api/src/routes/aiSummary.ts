import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { generateAiSummaryPreview } from "../services/aiSummary/generatePreview.js";
import { LlmNotConfiguredError } from "../services/llm/complete.js";
import { isOfflineTestUserSession } from "../services/offlineTestUser.js";

export const aiSummaryRouter = Router();

aiSummaryRouter.post("/me/ai-summary/preview", requireAuth, async (req, res) => {
  if (isOfflineTestUserSession(req)) {
    res.status(503).json({
      error: "AI summary is not available in offline test mode.",
    });
    return;
  }

  const userId = req.session.userId!;

  try {
    const preview = await generateAiSummaryPreview(userId);
    res.json({
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
