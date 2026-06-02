import { Router } from "express";
import { readdir } from "node:fs/promises";
import path from "node:path";

export const helpVideosRouter = Router();

function resolveHelpVideoDir(): string {
  if (process.env.HELP_VIDEOS_DIR?.trim()) {
    return path.resolve(process.env.HELP_VIDEOS_DIR.trim());
  }
  // Default repo layout in local dev/prod app runtime.
  return path.resolve(process.cwd(), "..", "web", "public", "help", "videos");
}

helpVideosRouter.get("/help/videos", async (_req, res) => {
  const dir = resolveHelpVideoDir();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));

    res.json({
      directory: dir,
      files: files.map((name) => ({
        name,
        url: `/help/videos/${encodeURIComponent(name)}`,
      })),
    });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      res.json({
        directory: dir,
        files: [],
      });
      return;
    }
    throw e;
  }
});
