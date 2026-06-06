#!/usr/bin/env bash
# Collect production diagnostics into one log file (PM2, app logs, nginx, health).
#
# Run on the VPS from repo root:
#   ./scripts/collect-prod-logs.sh
#   OUTPUT=~/prod-snapshot.log ./scripts/collect-prod-logs.sh
#
# Default output: logs/prod-diagnostics.log (under repo root)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
PM2_APP="${PM2_APP:-sml-api}"
OUTPUT="${OUTPUT:-$ROOT/logs/prod-diagnostics.log}"
LINES="${LINES:-80}"

mkdir -p "$(dirname "$OUTPUT")"

exec > >(tee "$OUTPUT") 2>&1

hr() { echo ""; echo "======================================================================"; echo "$1"; echo "======================================================================"; }

hr "SocialMediaLite production diagnostics"
echo "collected_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "repo:             $ROOT"
echo "output_file:      $OUTPUT"
echo "hostname:         $(hostname 2>/dev/null || echo unknown)"
echo "user:             $(whoami 2>/dev/null || echo unknown)"

hr "git"
if command -v git >/dev/null 2>&1 && [[ -d "$ROOT/.git" ]]; then
  git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true
  git -C "$ROOT" status -sb 2>/dev/null || true
else
  echo "(not a git checkout)"
fi

hr "system (memory / load)"
free -h 2>/dev/null || true
uptime 2>/dev/null || true
echo ""
ps aux --sort=-%mem 2>/dev/null | head -10 || true

hr "pm2 status"
if command -v pm2 >/dev/null 2>&1; then
  pm2 status 2>/dev/null || true
  echo ""
  pm2 describe "$PM2_APP" 2>/dev/null || echo "PM2 app $PM2_APP not found"
  echo ""
  hr "pm2 logs ($PM2_APP, last $LINES lines)"
  pm2 logs "$PM2_APP" --lines "$LINES" --nostream 2>/dev/null || true
else
  echo "pm2 not installed"
fi

hr "pm2 log files (tail)"
for f in "$HOME/.pm2/logs/${PM2_APP}-out.log" "$HOME/.pm2/logs/${PM2_APP}-error.log"; do
  echo "--- $f"
  if [[ -f "$f" ]]; then
    tail -n "$LINES" "$f" 2>/dev/null || true
  else
    echo "(missing)"
  fi
  echo ""
done

hr "API health (localhost:3001)"
curl -sS -m 5 -w "\nhttp_code=%{http_code} time_total=%{time_total}s\n" http://127.0.0.1:3001/health 2>&1 || echo "health check failed"

hr "apps/api/logs/ai-summary-llm.log (last $LINES)"
if [[ -f "$API_DIR/logs/ai-summary-llm.log" ]]; then
  tail -n "$LINES" "$API_DIR/logs/ai-summary-llm.log"
else
  echo "(missing)"
fi

hr "apps/api/logs/video-player.log (last $LINES)"
if [[ -f "$API_DIR/logs/video-player.log" ]]; then
  tail -n "$LINES" "$API_DIR/logs/video-player.log"
else
  echo "(missing)"
fi

hr "nginx error.log (last $LINES)"
if [[ -r /var/log/nginx/error.log ]]; then
  sudo tail -n "$LINES" /var/log/nginx/error.log 2>/dev/null || tail -n "$LINES" /var/log/nginx/error.log 2>/dev/null || echo "(cannot read)"
else
  echo "(missing or not readable — try with sudo)"
fi

hr "nginx access.log — recent 502/504/499 (last 200 scanned)"
if [[ -r /var/log/nginx/access.log ]]; then
  sudo tail -n 200 /var/log/nginx/access.log 2>/dev/null | grep -E ' (502|504|499) ' || echo "(none in last 200 lines)"
  tail -n 200 /var/log/nginx/access.log 2>/dev/null | grep -E ' (502|504|499) ' || true
else
  echo "(missing or not readable)"
fi

hr "nginx access.log (last $LINES)"
if [[ -r /var/log/nginx/access.log ]]; then
  sudo tail -n "$LINES" /var/log/nginx/access.log 2>/dev/null || tail -n "$LINES" /var/log/nginx/access.log 2>/dev/null || echo "(cannot read)"
else
  echo "(missing or not readable)"
fi

hr "syndicate smoke (localhost)"
TOKEN="${SYNDICATE_SMOKE_TOKEN:-}"
if [[ -n "$TOKEN" ]]; then
  curl -sS -m 10 -I "http://127.0.0.1:3001/syndicate/$TOKEN" 2>&1 | head -12 || true
else
  echo "(set SYNDICATE_SMOKE_TOKEN=... to test a public syndication URL)"
fi

hr "done"
echo "Full snapshot written to: $OUTPUT"
