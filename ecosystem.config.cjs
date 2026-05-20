/** PM2 — production runs API only; nginx serves static UI from /var/www. */
const path = require("node:path");

const repoRoot = __dirname;
const apiDir = path.join(repoRoot, "apps/api");

module.exports = {
  apps: [
    {
      name: "sml-api",
      cwd: apiDir,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        /** Absolute path so uploads work even if PM2 cwd drifts from repo root. */
        STORAGE_LOCAL_ROOT: path.join(apiDir, "storage"),
      },
    },
  ],
};
