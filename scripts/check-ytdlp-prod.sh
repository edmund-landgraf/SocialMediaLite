#!/usr/bin/env bash
# Verify yt-dlp + ffmpeg for inline video playback on Linux production.
#
# Run on the VPS from repo root (after deploy):
#   ./scripts/check-ytdlp-prod.sh
#   SMOKE=1 ./scripts/check-ytdlp-prod.sh    # also resolve a public YouTube URL (~15s)
#
# Exit 0 = OK or warnings only; exit 1 = binary missing / broken.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
CACHE_BIN="$API_DIR/.cache/yt-dlp/yt-dlp"
ENV_FILE="$ROOT/.env"

echo "==> yt-dlp production check"
echo "    repo: $ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "WARN: not Linux ($(uname -s)) — this script is meant for the VPS"
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  YT_DLP_PATH="$(grep -E '^YT_DLP_PATH=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  export YT_DLP_PATH
fi

WARN=0

if command -v ffmpeg >/dev/null 2>&1; then
  echo "OK   ffmpeg: $(ffmpeg -version | head -1)"
else
  echo "WARN ffmpeg not in PATH — install for reliable inline mux (apt install ffmpeg)"
  WARN=1
fi

resolve_ytdlp() {
  if [[ -n "${YT_DLP_PATH:-}" ]]; then
    if [[ -x "$YT_DLP_PATH" ]]; then
      echo "$YT_DLP_PATH"
      return 0
    fi
    echo "ERROR YT_DLP_PATH is set but not executable: $YT_DLP_PATH" >&2
    return 1
  fi
  if [[ -x "$CACHE_BIN" ]]; then
    echo "$CACHE_BIN"
    return 0
  fi
  if command -v yt-dlp >/dev/null 2>&1; then
    command -v yt-dlp
    return 0
  fi
  return 1
}

YTDLP=""
if YTDLP="$(resolve_ytdlp)"; then
  echo "OK   yt-dlp binary: $YTDLP"
else
  echo "WARN yt-dlp not found yet"
  echo "     First inline play will download to: $CACHE_BIN"
  echo "     (needs outbound HTTPS to GitHub). Or set YT_DLP_PATH in .env"
  echo "     Or: sudo apt install -y yt-dlp   # if your distro packages it"
  exit 1
fi

echo "==> yt-dlp --version"
"$YTDLP" --version

if [[ "${SMOKE:-}" == "1" ]]; then
  SMOKE_URL="${SMOKE_URL:-https://www.youtube.com/watch?v=jNQXAC9IVRw}"
  echo "==> smoke extract (no download): $SMOKE_URL"
  "$YTDLP" -j --no-playlist --no-warnings --simulate "$SMOKE_URL" | head -c 400
  echo ""
  echo "OK   smoke JSON received (truncated above)"
fi

CACHE_DIR="$(dirname "$CACHE_BIN")"
if [[ -d "$CACHE_DIR" ]]; then
  echo "OK   cache dir: $CACHE_DIR ($(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1 || echo ?))"
fi

if [[ -d "$API_DIR/logs" ]]; then
  if [[ -f "$API_DIR/logs/video-player.log" ]]; then
    echo "==> recent video-player.log (last 5 lines)"
    tail -5 "$API_DIR/logs/video-player.log" || true
  fi
fi

if [[ "$WARN" -eq 1 ]]; then
  echo "==> done with warnings (inline may still work for some hosts)"
  exit 0
fi

echo "==> done"
