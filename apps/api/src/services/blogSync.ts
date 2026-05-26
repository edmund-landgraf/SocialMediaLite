import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "../lib/prisma.js";

const execFileAsync = promisify(execFile);

const MAX_COMMITS = 500;
const PER_PAGE = 100;

export type GitHubRepo = {
  owner: string;
  name: string;
};

type GitHubCommitResponse = {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
};

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

export async function resolveGitHubRepo(): Promise<GitHubRepo | null> {
  const owner = process.env.GITHUB_REPO_OWNER?.trim();
  const name = process.env.GITHUB_REPO_NAME?.trim();
  if (owner && name) {
    return { owner, name };
  }

  try {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
      cwd: repoRoot,
    });
    return parseGitHubRemoteUrl(stdout);
  } catch {
    return null;
  }
}

export async function fetchGitHubCommits(
  repo: GitHubRepo,
  options?: { token?: string; maxCommits?: number },
): Promise<GitHubCommitResponse[]> {
  const maxCommits = options?.maxCommits ?? MAX_COMMITS;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SocialMediaLite-BlogSync",
  };
  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const commits: GitHubCommitResponse[] = [];
  let page = 1;

  while (commits.length < maxCommits) {
    const url = new URL(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits`);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub commits fetch failed (${res.status})`);
    }

    const batch = (await res.json()) as GitHubCommitResponse[];
    if (batch.length === 0) break;

    commits.push(...batch);
    if (batch.length < PER_PAGE) break;
    page += 1;
  }

  return commits.slice(0, maxCommits);
}

export async function syncBlogEntriesFromCommits(commits: GitHubCommitResponse[]): Promise<number> {
  let synced = 0;

  for (const commit of commits) {
    const message = commit.commit.message;
    if (!isMajorCommit(message)) continue;

    const title = commitTitle(message);
    const sha = commit.sha;
    const slug = slugFromCommit(title, sha);
    const committedAt = new Date(commit.commit.author.date);
    const authorName = commit.commit.author.name || "Unknown";

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
    synced += 1;
  }

  return synced;
}

/** Pull major commits from GitHub and upsert blog entries (idempotent). */
export async function ensureBlogEntriesFromGitHub(): Promise<void> {
  const repo = await resolveGitHubRepo();
  if (!repo) {
    console.warn("Blog sync skipped: could not resolve GitHub repo (set GITHUB_REPO_OWNER/NAME or git remote).");
    return;
  }

  try {
    const token = process.env.GITHUB_TOKEN?.trim();
    const commits = await fetchGitHubCommits(repo, { token: token || undefined });
    const synced = await syncBlogEntriesFromCommits(commits);
    console.log(`Blog sync: upserted ${synced} entries from ${repo.owner}/${repo.name}.`);
  } catch (err) {
    console.warn("Blog sync failed (continuing startup):", err instanceof Error ? err.message : err);
  }
}
