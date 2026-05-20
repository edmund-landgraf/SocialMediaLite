#!/usr/bin/env bash
# Production deploy — run on the Linux VPS only (not on Windows dev machine).
#
# Dev workflow: Windows (Node) + WSL2 Docker Postgres → git push → this script on VPS.
#
# nginx serves static files from WEB_ROOT (default /var/www/unwhelm.online).
# Vite build output lives in apps/web/dist and is rsync'd there after each deploy.
#
# Usage (on VPS, from repo root):
#   ./scripts/deploy-prod.sh
#   WEB_ROOT=/var/www/unwhelm.online ./scripts/deploy-prod.sh
#   SKIP_GIT_PULL=1 ./scripts/deploy-prod.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WEB_ROOT="${WEB_ROOT:-/var/www/unwhelm.online}"
PM2_APP="${PM2_APP:-sml-api}"

echo "==> SocialMediaLite production deploy"
echo "    repo:     $ROOT"
echo "    web root: $WEB_ROOT"

if [[ "${SKIP_GIT_PULL:-}" != "1" ]]; then
  echo "==> git pull"
  git pull origin main
fi

echo "==> npm install"
npm install

echo "==> build (shared, api, web)"
npm run build

echo "==> database migrations"
npm run db:deploy

echo "==> publish web dist -> $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete apps/web/dist/ "$WEB_ROOT/"

echo "==> restart API ($PM2_APP)"
if pm2 describe sml-web >/dev/null 2>&1; then
  echo "==> stopping sml-web (nginx serves static UI; Vite dev server not used in prod)"
  pm2 delete sml-web || true
fi

if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 delete "$PM2_APP"
fi
pm2 start ecosystem.config.cjs --update-env

pm2 save

echo "==> done"
