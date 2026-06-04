import { spawn } from "node:child_process";
import type { Response } from "express";
import { resolveYtDlpExecutable } from "./ytDlpClient.js";
import { writeVideoPlayerLog } from "./videoPlayerLog.js";

const PIPE_FORMAT =
  "best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4][vcodec!=none]/best[ext=mp4]/best";

/**
 * Stream muxed MP4 to the client via yt-dlp stdout (Instagram DASH, TikTok CDN 403, etc.).
 */
export async function pipeYtDlpToResponse(
  pageUrl: string,
  res: Response,
  logExtra?: Record<string, unknown>,
): Promise<boolean> {
  const bin = await resolveYtDlpExecutable();
  return new Promise((resolve) => {
    const proc = spawn(
      bin,
      ["-f", PIPE_FORMAT, "--no-playlist", "--no-warnings", "-o", "-", pageUrl],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    if (!res.headersSent) {
      res.status(200);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Cache-Control", "private, no-cache");
    }

    proc.stdout.on("error", () => {
      if (!res.headersSent) res.status(502).end();
    });

    proc.stdout.pipe(res);

    res.once("close", () => {
      proc.kill("SIGTERM");
    });

    const finish = async (ok: boolean, exitCode: number | null) => {
      await writeVideoPlayerLog({
        source: "api",
        kind: "playback-stream.ytdlp-pipe",
        pageUrl,
        ok,
        exitCode,
        stderr: stderr.trim().slice(0, 1200),
        ...logExtra,
      });
      resolve(ok);
    };

    proc.on("error", async () => {
      if (!res.headersSent) {
        res.status(502).json({ error: "Could not start inline video stream" });
      }
      await finish(false, null);
    });

    proc.on("close", async (code) => {
      const ok = code === 0 || res.headersSent;
      if (code !== 0 && !res.headersSent) {
        res.status(502).json({ error: "Could not stream video for this link" });
      }
      await finish(ok, code);
    });

  });
}
