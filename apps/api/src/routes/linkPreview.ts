import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { z } from "zod";
import { normalizePlaybackPageUrl, supportsYtDlpPlayback } from "@socialmedialite/shared";
import { requireAuth } from "../middleware/auth.js";
import { assertOutboundUrlSafe, fetchLinkPreviewMetadata } from "../services/linkPreview.js";
import { getYtDlpPlayback } from "../services/ytDlpClient.js";
import { pipeYtDlpToResponse } from "../services/ytDlpStream.js";
import { writeVideoPlayerLog } from "../services/videoPlayerLog.js";

export const linkPreviewRouter = Router();

linkPreviewRouter.use(requireAuth);

const bodySchema = z.object({
  url: z.string().trim().url().max(2048),
});

const playbackQuerySchema = z.object({
  url: z.string().trim().url().max(2048),
});

const videoPlayerErrorBodySchema = z.object({
  playerKind: z.enum([
    "native",
    "hybrid-native",
    "iframe",
    "hybrid-iframe",
    "soundcloud",
    "mixcloud",
    "audio",
  ]),
  message: z.string().trim().min(1).max(2000),
  pageUrl: z.string().trim().url().max(2048).optional(),
  embedUrl: z.string().trim().url().max(2048).optional(),
  mediaErrorCode: z.number().int().min(0).max(99).optional(),
  networkState: z.number().int().min(0).max(99).optional(),
  readyState: z.number().int().min(0).max(99).optional(),
});

async function logPlaybackStreamError(
  req: { session: { userId?: string }; headers: { range?: string | string[] } },
  event: Record<string, unknown>,
): Promise<void> {
  await writeVideoPlayerLog({
    source: "api",
    userId: req.session.userId ?? null,
    ...event,
  });
}

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
] as const;

linkPreviewRouter.post("/link-preview/video-player-error", async (req, res) => {
  const parsed = videoPlayerErrorBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  await writeVideoPlayerLog({
    source: "client",
    kind: "player.error",
    userId: req.session.userId ?? null,
    ...parsed.data,
  });

  res.status(204).end();
});

linkPreviewRouter.get("/link-preview/playback-stream", async (req, res, next) => {
  const pageUrlRaw = typeof req.query.url === "string" ? req.query.url : undefined;

  try {
    const parsed = playbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      await logPlaybackStreamError(req, {
        kind: "playback-stream.validation",
        pageUrl: pageUrlRaw,
        message: "Invalid playback query",
      });
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const pageUrl = await assertOutboundUrlSafe(parsed.data.url);
    if (!supportsYtDlpPlayback(pageUrl)) {
      await logPlaybackStreamError(req, {
        kind: "playback-stream.unsupported",
        pageUrl: pageUrl.href,
        message: "Inline playback is not supported for this link",
      });
      res.status(400).json({ error: "Inline playback is not supported for this link" });
      return;
    }

    const playbackHref = normalizePlaybackPageUrl(pageUrl.href);
    const playback = await getYtDlpPlayback(playbackHref);

    if (playback) {
      const upstreamHeaders: Record<string, string> = {
        ...playback.requestHeaders,
        Accept: "video/*,*/*",
      };
      const range = req.headers.range;
      if (typeof range === "string") {
        upstreamHeaders.Range = range;
      }

      const upstream = await fetch(playback.url, { headers: upstreamHeaders });
      if (upstream.ok && upstream.body) {
        res.status(upstream.status);
        for (const name of FORWARD_RESPONSE_HEADERS) {
          const value = upstream.headers.get(name);
          if (value) res.setHeader(name, value);
        }
        res.setHeader("Cache-Control", "private, max-age=300");

        const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        try {
          await pipeline(nodeStream, res);
          return;
        } catch (pipeErr) {
          await logPlaybackStreamError(req, {
            kind: "playback-stream.pipe",
            pageUrl: playbackHref,
            message: pipeErr instanceof Error ? pipeErr.message : String(pipeErr),
            headersSent: res.headersSent,
          });
          if (!res.headersSent) res.status(502).end();
          else res.end();
          return;
        }
      }

      await logPlaybackStreamError(req, {
        kind: "playback-stream.upstream",
        pageUrl: playbackHref,
        message: "Upstream video stream unavailable",
        upstreamStatus: upstream.status,
      });
    } else {
      await logPlaybackStreamError(req, {
        kind: "playback-stream.ytdlp",
        pageUrl: playbackHref,
        message: "No direct progressive URL; falling back to yt-dlp pipe",
      });
    }

    const piped = await pipeYtDlpToResponse(playbackHref, res, {
      userId: req.session.userId ?? null,
      fallback: true,
    });
    if (!piped && !res.headersSent) {
      res.status(502).json({ error: "Could not stream video for this link" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("Invalid URL") ||
      msg.includes("Only http") ||
      msg.includes("not allowed") ||
      msg.includes("resolves to a disallowed")
    ) {
      await logPlaybackStreamError(req, {
        kind: "playback-stream.url-safety",
        pageUrl: pageUrlRaw,
        message: msg,
      });
      res.status(400).json({ error: msg });
      return;
    }
    await logPlaybackStreamError(req, {
      kind: "playback-stream.exception",
      pageUrl: pageUrlRaw,
      message: msg,
    });
    next(e instanceof Error ? e : new Error(msg));
  }
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
