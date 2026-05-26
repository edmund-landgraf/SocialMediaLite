import { Router } from "express";
import type { BlogEntry } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ensureBlogEntriesFromGitHub, githubCommitUrl, resolveGitHubRepo } from "../services/blogSync.js";

export const blogRouter = Router();

function serializeBlogEntry(entry: BlogEntry, commitUrl: string | null) {
  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    body: entry.body,
    committedAt: entry.committedAt.toISOString(),
    sha: entry.sha,
    commitUrl,
    authorName: entry.authorName,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

async function listBlogEntries() {
  const [entries, repo] = await Promise.all([
    prisma.blogEntry.findMany({ orderBy: { committedAt: "desc" } }),
    resolveGitHubRepo(),
  ]);
  return entries.map((entry) =>
    serializeBlogEntry(entry, repo ? githubCommitUrl(repo, entry.sha) : null),
  );
}

blogRouter.get("/blog", async (_req, res, next) => {
  try {
    res.json({ entries: await listBlogEntries() });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});

blogRouter.post("/blog/sync", async (_req, res, next) => {
  try {
    await ensureBlogEntriesFromGitHub();
    const entries = await listBlogEntries();
    res.json({ entries, count: entries.length });
  } catch (e) {
    next(e instanceof Error ? e : new Error(String(e)));
  }
});
