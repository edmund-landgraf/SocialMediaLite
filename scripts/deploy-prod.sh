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
#
# Do not edit tracked files on the VPS (e.g. LoginPage.tsx). Fix in dev, push, then deploy.
# If git pull fails due to LoginPage.tsx edits on the VPS, restore and pull:
#   git restore apps/web/src/pages/LoginPage.tsx
#   git pull origin main
# (package-lock.json drift from VPS npm install is auto-restored by this script.)
#
# If pull fails with "untracked working tree files would be overwritten", a script
# was copied to the VPS before it landed in git — safe to remove and pull:
#   rm scripts/collect-prod-logs.sh   # example
#   git pull origin main

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WEB_ROOT="${WEB_ROOT:-/var/www/unwhelm.online}"
PM2_APP="${PM2_APP:-sml-api}"

echo "==> SocialMediaLite production deploy"
echo "    repo:     $ROOT"
echo "    web root: $WEB_ROOT"

if [[ "${SKIP_GIT_PULL:-}" != "1" ]]; then
  if [[ -n "$(git status --porcelain -- package-lock.json 2>/dev/null || true)" ]]; then
    echo "==> restoring package-lock.json (VPS npm install drift — use repo lockfile)"
    git restore package-lock.json
  fi
  login_dirty="$(git status --porcelain -- apps/web/src/pages/LoginPage.tsx 2>/dev/null || true)"
  if [[ -n "$login_dirty" ]]; then
    echo "WARN: local VPS edits to LoginPage.tsx would block git pull"
    git diff --stat -- apps/web/src/pages/LoginPage.tsx 2>/dev/null || true
    echo "    Restore tracked file, then re-run deploy:"
    echo "      git restore apps/web/src/pages/LoginPage.tsx"
    echo "      git pull origin main"
    exit 1
  fi
  # Untracked copies of repo scripts (scp'd before push) block git pull.
  for f in scripts/collect-prod-logs.sh scripts/sync-nginx-syndicate.sh scripts/ensure-nginx-ssl.sh; do
    if [[ -f "$f" ]] && ! git ls-files --error-unmatch "$f" &>/dev/null; then
      echo "==> removing untracked $f (repo version replaces on pull)"
      rm "$f"
    fi
  done
  echo "==> git pull"
  git pull origin main
fi

echo "==> npm install"
npm install

echo "==> build (shared, api, web)"
npm run build

echo "==> database migrations"
npm run db:deploy

echo "==> sync blog from git"
npm run blog:sync || echo "    (blog sync skipped or failed — continuing deploy)"

echo "==> publish web dist -> $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete apps/web/dist/ "$WEB_ROOT/"

# Patch live nginx only (never overwrite the whole site file).
if [[ "${SKIP_NGINX_RELOAD:-}" != "1" ]] && command -v nginx >/dev/null 2>&1; then
  bash "$ROOT/scripts/ensure-nginx-ssl.sh"
  bash "$ROOT/scripts/sync-nginx-syndicate.sh"
fi

if [[ "$(uname -s)" == "Linux" ]]; then
  echo "==> yt-dlp / ffmpeg check (inline video playback)"
  if bash scripts/check-ytdlp-prod.sh; then
    echo "    (optional: SMOKE=1 ./scripts/check-ytdlp-prod.sh for network extract test)"
  else
    echo "    WARN: yt-dlp check failed — iframe embeds still work; fix before relying on Play inline"
  fi
fi

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
