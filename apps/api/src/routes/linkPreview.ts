import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { fetchLinkPreviewMetadata } from "../services/linkPreview.js";

export const linkPreviewRouter = Router();

linkPreviewRouter.use(requireAuth);

const bodySchema = z.object({
  url: z.string().trim().url().max(2048),
});

linkPreviewRouter.post("/link-preview", async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const meta = await fetchLinkPreviewMetadata(parsed.data.url);
    res.json(meta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("Invalid URL") ||
      msg.includes("Only http") ||
      msg.includes("not allowed") ||
      msg.includes("resolves to a disallowed")
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    next(e instanceof Error ? e : new Error(msg));
  }
});
