/**
 * Shared Vite defaults for SocialMediaLite web.
 *
 * Do not put environment-specific server settings here.
 * - Local dev: vite.config.local.ts
 * - Production build (nginx static): vite.config.production.ts
 *
 * Never hand-edit apps/web/vite.config.ts on production.
 * Edit vite.config.production.ts locally, commit, then git pull on VPS.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — `.env` with VITE_* lives here (same as API). */
export const repoRoot = path.resolve(__dirname, "../..");

/** Proxy API and uploaded assets to the local Express dev server. */
export const apiDevProxy = {
  "/api": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
  "/assets": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
} as const;

export function createSharedConfig(): UserConfig {
  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
}

export default defineConfig(createSharedConfig());
