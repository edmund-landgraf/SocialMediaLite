import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

/** Load repo-root `.env`, then `apps/api/.env` so local overrides win. */
export function loadEnv(): void {
  const apiDir = process.cwd();
  const repoRoot = path.resolve(apiDir, "..", "..");

  const repoEnv = path.join(repoRoot, ".env");
  const apiEnv = path.join(apiDir, ".env");

  if (fs.existsSync(repoEnv)) config({ path: repoEnv });
  if (fs.existsSync(apiEnv)) config({ path: apiEnv, override: true });
}
