/** PM2 — production runs API only; nginx serves static UI from /var/www. */
module.exports = {
  apps: [
    {
      name: "sml-api",
      cwd: "./apps/api",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
