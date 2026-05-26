import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../lib/prisma.js";

const execFileAsync = promisify(execFile);

const MAX_COMMITS = 500;
const PER_PAGE = 100;
const GIT_RECORD_SEP = "\x1e";
const GIT_FIELD_SEP = "\x1f";

export type GitHubRepo = {
  owner: string;
  name: string;
};

export type GitCommitRecord = {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
};

export type BlogSyncSource = "local-git" | "github-api" | "skipped";

export type BlogSyncResult = {
  source: BlogSyncSource;
  repo: GitHubRepo | null;
  scanned: number;
  synced: number;
  newEntries: number;
};

type GitHubCommitResponse = GitCommitRecord;

/** Skip trivial merge commits; keep all other commits as blog entries. */
export function isMajorCommit(message: string): boolean {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  return !firstLine.startsWith("Merge ");
}

export function commitTitle(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  return firstLine || "Untitled commit";
}

export function slugFromCommit(title: string, sha: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "commit";
  return `${base}-${sha.slice(0, 7)}`;
}

export function githubCommitUrl(repo: GitHubRepo, sha: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/commit/${sha}`;
}

export function parseGitHubRemoteUrl(url: string): GitHubRepo | null {
  const trimmed = url.trim();
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }
  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }
  return null;
}

export async function findRepoRoot(startDir = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: startDir });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveGitHubRepo(repoRoot?: string): Promise<GitHubRepo | null> {
  const owner = process.env.GITHUB_REPO_OWNER?.trim();
  const name = process.env.GITHUB_REPO_NAME?.trim();
  if (owner && name) {
    return { owner, name };
  }

  const root = repoRoot ?? (await findRepoRoot());
  if (!root) return null;

  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: root });
    return parseGitHubRemoteUrl(stdout);
  } catch {
    return null;
  }
}

/** Parse `git log --format=…` output produced by {@link fetchLocalGitCommits}. */
export function parseLocalGitLog(raw: string): GitCommitRecord[] {
  const records: GitCommitRecord[] = [];
  for (const chunk of raw.split(GIT_RECORD_SEP)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const [sha, authorName, date, ...bodyParts] = trimmed.split(GIT_FIELD_SEP);
    if (!sha || !date) continue;
    const message = bodyParts.join(GIT_FIELD_SEP).trimEnd();
    records.push({
      sha,
      commit: {
        message,
        author: { name: authorName?.trim() || "Unknown", date: date.trim() },
      },
    });
  }
  return records;
}

export async function fetchLocalGitCommits(
  repoRoot: string,
  maxCommits = MAX_COMMITS,
): Promise<GitCommitRecord[]> {
  const format = ["%H", "%an", "%aI", "%B"].join(GIT_FIELD_SEP) + GIT_RECORD_SEP;
  const { stdout } = await execFileAsync(
    "git",
    ["log", `--max-count=${maxCommits}`, `--format=${format}`, "--no-merges"],
    { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  return parseLocalGitLog(stdout);
}

export async function fetchGitHubCommits(
  repo: GitHubRepo,
  options?: { token?: string; maxCommits?: number },
): Promise<GitCommitRecord[]> {
  const maxCommits = options?.maxCommits ?? MAX_COMMITS;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SocialMediaLite-BlogSync",
  };
  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const commits: GitCommitRecord[] = [];
  let page = 1;

  while (commits.length < maxCommits) {
    const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits`);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub commits fetch failed (${res.status})`);
    }

    const batch = (await res.json()) as GitCommitRecord[];
    if (batch.length === 0) break;

    commits.push(...batch);
    if (batch.length < PER_PAGE) break;
    page += 1;
  }

  return commits.slice(0, maxCommits);
}

async function upsertBlogEntryFromCommit(commit: GitCommitRecord): Promise<"skipped" | "created" | "updated"> {
  const message = commit.commit.message;
  if (!isMajorCommit(message)) return "skipped";

  const title = commitTitle(message);
  const sha = commit.sha;
  const slug = slugFromCommit(title, sha);
  const committedAt = new Date(commit.commit.author.date);
  const authorName = commit.commit.author.name || "Unknown";

  const existing = await prisma.blogEntry.findUnique({ where: { sha }, select: { id: true } });

  await prisma.blogEntry.upsert({
    where: { sha },
    create: {
      slug,
      title,
      body: message,
      committedAt,
      sha,
      authorName,
    },
    update: {
      slug,
      title,
      body: message,
      committedAt,
      authorName,
    },
  });

  return existing == null ? "created" : "updated";
}

export async function syncBlogEntriesFromCommits(commits: GitCommitRecord[]): Promise<number> {
  let synced = 0;
  for (const commit of commits) {
    const result = await upsertBlogEntryFromCommit(commit);
    if (result !== "skipped") synced += 1;
  }
  return synced;
}

export type SyncBlogFromGitOptions = {
  maxCommits?: number;
  repoRoot?: string;
  /** Prefer local `git log` when true (default). Falls back to GitHub API. */
  preferLocalGit?: boolean;
  /** When true, rethrow instead of returning source=skipped on failure. */
  throwOnError?: boolean;
};

/**
 * Scan git for major commits and upsert any new blog entries (idempotent).
 * Uses local `git log` when available; otherwise GitHub REST API.
 */
export async function syncBlogFromGit(options: SyncBlogFromGitOptions = {}): Promise<BlogSyncResult> {
  const maxCommits = options.maxCommits ?? MAX_COMMITS;
  const preferLocalGit = options.preferLocalGit ?? true;
  const repoRoot = options.repoRoot ?? (await findRepoRoot());
  const repo = await resolveGitHubRepo(repoRoot ?? undefined);

  let commits: GitCommitRecord[] = [];
  let source: BlogSyncSource = "skipped";

  if (preferLocalGit && repoRoot) {
    try {
      commits = await fetchLocalGitCommits(repoRoot, maxCommits);
      source = "local-git";
    } catch (err) {
      if (options.throwOnError) throw err;
    }
  }

  if (commits.length === 0 && repo) {
    try {
      const token = process.env.GITHUB_TOKEN?.trim();
      commits = await fetchGitHubCommits(repo, { token: token || undefined, maxCommits });
      source = "github-api";
    } catch (err) {
      if (options.throwOnError) throw err;
      return { source: "skipped", repo, scanned: 0, synced: 0, newEntries: 0 };
    }
  }

  if (commits.length === 0) {
    return { source: "skipped", repo, scanned: 0, synced: 0, newEntries: 0 };
  }

  let synced = 0;
  let newEntries = 0;
  for (const commit of commits) {
    const result = await upsertBlogEntryFromCommit(commit);
    if (result === "skipped") continue;
    synced += 1;
    if (result === "created") newEntries += 1;
  }

  return { source, repo, scanned: commits.length, synced, newEntries };
}

/** Pull major commits from git/GitHub and upsert blog entries (idempotent). */
export async function ensureBlogEntriesFromGitHub(): Promise<BlogSyncResult> {
  try {
    const result = await syncBlogFromGit();
    if (result.source === "skipped") {
      console.warn("Blog sync skipped: could not read git log or GitHub (set GITHUB_REPO_OWNER/NAME or git remote).");
    } else {
      const repoLabel = result.repo ? `${result.repo.owner}/${result.repo.name}` : "unknown repo";
      console.log(
        `Blog sync (${result.source}): ${result.newEntries} new, ${result.synced} major commits from ${repoLabel}.`,
      );
    }
    return result;
  } catch (err) {
    console.warn("Blog sync failed (continuing startup):", err instanceof Error ? err.message : err);
    return { source: "skipped", repo: null, scanned: 0, synced: 0, newEntries: 0 };
  }
}
