/**
 * Production Vite config — used for `npm run build` (static bundle for nginx).
 *
 * Linux/nginx prod: nginx serves apps/web/dist from /var/www (see scripts/deploy-prod.sh).
 * Do not run a Vite dev server in production; PM2 runs sml-api only.
 *
 * `dev:prod` is for emergency debugging only — not the normal deploy path.
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
