#!/usr/bin/env bash
# Ensure Let's Encrypt ssl_certificate lines are active on the live VPS nginx site.
#
# Repo templates:
#   deploy/nginx/unwhelm.online.conf       — production (SSL uncommented)
#   deploy/nginx/unwhelm.online.local.conf — localhost (SSL commented, HTTP only)
#
# Deploy never overwrites the live site file; this only uncomments ssl_certificate
# directives if they were left commented (e.g. after a mistaken blind copy).
#
# Usage (on VPS):
#   ./scripts/ensure-nginx-ssl.sh
#   NGINX_SITE=/etc/nginx/sites-available/unwhelm.online ./scripts/ensure-nginx-ssl.sh

set -euo pipefail

NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/unwhelm.online}"

if [[ ! -f "$NGINX_SITE" ]]; then
  echo "==> nginx: site file not found ($NGINX_SITE) — skip SSL ensure"
  exit 0
fi

if ! sudo grep -q 'listen 443' "$NGINX_SITE"; then
  echo "==> nginx: no 443 server block in $NGINX_SITE — skip SSL ensure"
  exit 0
fi

if sudo grep -qE '^[[:space:]]*ssl_certificate[[:space:]]' "$NGINX_SITE"; then
  echo "==> nginx: ssl_certificate already active in $NGINX_SITE"
  exit 0
fi

if ! sudo grep -qE '^[[:space:]]*#.*ssl_certificate' "$NGINX_SITE"; then
  echo "WARN: nginx: 443 block present but no ssl_certificate lines to uncomment in $NGINX_SITE"
  exit 0
fi

echo "==> nginx: uncommenting ssl_certificate lines in $NGINX_SITE"

sudo sed -i -E \
  's|^([[:space:]]*)# (ssl_certificate[[:space:]].*)|\1\2|' \
  "$NGINX_SITE"

echo "==> nginx -t"
sudo nginx -t

echo "==> reload nginx"
sudo systemctl reload nginx

echo "==> done"
