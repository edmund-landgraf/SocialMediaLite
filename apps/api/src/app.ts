import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { friendsRouter } from "./routes/friends.js";
import { postsRouter } from "./routes/posts.js";
import { commentsRouter } from "./routes/comments.js";
import { linkPreviewRouter } from "./routes/linkPreview.js";
import { blogRouter } from "./routes/blog.js";
import { feedbackRouter } from "./routes/feedback.js";
import { facebookImportRouter } from "./routes/facebookImport.js";
import { aiSummaryRouter } from "./routes/aiSummary.js";
import { helpVideosRouter } from "./routes/helpVideos.js";
import { messagesRouter } from "./routes/messages.js";
import { getPublicPostSyndicationPage, postSyndicationRouter } from "./routes/postSyndication.js";
import {
  createStorageProviderFromEnv,
  getResolvedLocalStorageRoot,
} from "./storage/index.js";
import { writeVideoPlayerLog } from "./services/videoPlayerLog.js";

export function createApp() {
  const app = express();
  const storage = createStorageProviderFromEnv();

  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5174";

  app.set("trust proxy", 1);
  /** In dev, Vite serves the web app separately — mirror any browser Origin. */
  const corsMiddleware =
    process.env.NODE_ENV === "production"
      ? cors({
          origin: webOrigin,
          credentials: true,
        })
      : cors({
          origin: true,
          credentials: true,
        });
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      name: "sml.sid",
      secret: process.env.SESSION_SECRET ?? "dev-insecure-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    }),
  );

  const localRoot = getResolvedLocalStorageRoot();
  app.use(
    "/assets",
    express.static(localRoot, {
      fallthrough: true,
      maxAge: "1h",
    }),
  );

  app.use((req, _res, next) => {
    (req as express.Request).storage = storage;
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/syndicate/:token", getPublicPostSyndicationPage);

  app.use("/api/auth", authRouter);
  /** Public blog + feedback reads — register before routers with global requireAuth on /api. */
  app.use("/api", blogRouter);
  app.use("/api", feedbackRouter);
  app.use("/api", helpVideosRouter);
  app.use("/api", usersRouter);
  app.use("/api", facebookImportRouter);
  app.use("/api", aiSummaryRouter);
  app.use("/api/friends", friendsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api", postsRouter);
  app.use("/api", linkPreviewRouter);
  app.use("/api", commentsRouter);
  app.use("/api", postSyndicationRouter);

  const jsonErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const path = req.path ?? "";
    if (path.includes("playback-stream") || path.includes("video-player-error")) {
      void writeVideoPlayerLog({
        source: "api",
        kind: "api.unhandled",
        path,
        userId: req.session.userId ?? null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    console.error("Unhandled API error:", err);
    const dev = process.env.NODE_ENV !== "production";
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    res.status(status).json({
      error: message,
      ...(dev && err instanceof Error ? { detail: err.stack } : {}),
    });
  };

  app.use(jsonErrorHandler);

  return app;
}
