#!/usr/bin/env bash
# Patch the LIVE nginx site on the VPS — adds /syndicate/ proxy only.
# Does NOT overwrite ssl_certificate lines or other production edits.
#
# Usage (on VPS):
#   ./scripts/sync-nginx-syndicate.sh
#   NGINX_SITE=/etc/nginx/sites-available/unwhelm.online ./scripts/sync-nginx-syndicate.sh

set -euo pipefail

NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/unwhelm.online}"

if [[ ! -f "$NGINX_SITE" ]]; then
  echo "ERROR: nginx site not found: $NGINX_SITE"
  exit 1
fi

if sudo grep -q 'location /syndicate/' "$NGINX_SITE"; then
  echo "==> nginx: location /syndicate/ already present in $NGINX_SITE"
  exit 0
fi

if ! sudo grep -q 'location /api/' "$NGINX_SITE"; then
  echo "ERROR: expected an existing location /api/ block in $NGINX_SITE — patch manually"
  exit 1
fi

echo "==> nginx: inserting location /syndicate/ before location /api/ in $NGINX_SITE"

sudo sed -i '/location \/api\/ {/i\
    location /syndicate/ {\
        proxy_pass http://127.0.0.1:3001;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
    }\
' "$NGINX_SITE"

echo "==> nginx -t"
sudo nginx -t

echo "==> reload nginx"
sudo systemctl reload nginx

echo "==> done"
