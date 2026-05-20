/**
 * VPS production dev server (PM2 `sml-web` behind nginx).
 *
 * Never hand-edit apps/web/vite.config.ts on production.
 * Edit this file locally, commit, then git pull on VPS and restart sml-web.
 */
import { defineConfig, mergeConfig } from "vite";
import { apiDevProxy, createSharedConfig } from "./vite.config.js";

export default defineConfig(
  mergeConfig(createSharedConfig(), {
    server: {
      host: true,
      port: 5174,
      strictPort: true,
      allowedHosts: ["108.181.252.101", "unwhelm.online", "www.unwhelm.online"],
      proxy: apiDevProxy,
    },
  }),
);
