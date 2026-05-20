/**
 * Local workstation dev (npm run dev from repo root or apps/web).
 */
import { defineConfig, mergeConfig } from "vite";
import { apiDevProxy, createSharedConfig } from "./vite.config.js";

export default defineConfig(
  mergeConfig(createSharedConfig(), {
    server: {
      port: 5174,
      strictPort: true,
      proxy: apiDevProxy,
    },
  }),
);
