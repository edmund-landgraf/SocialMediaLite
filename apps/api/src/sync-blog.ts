import { loadEnv } from "./load-env.js";
import { syncBlogFromGit } from "./services/blogSync.js";

loadEnv();

const result = await syncBlogFromGit({ throwOnError: true });

const repoLabel = result.repo ? `${result.repo.owner}/${result.repo.name}` : "unknown";
console.log(
  `Blog sync (${result.source}): ${result.newEntries} new, ${result.synced} major commits scanned from ${repoLabel}.`,
);

if (result.source === "skipped") {
  process.exitCode = 1;
}
