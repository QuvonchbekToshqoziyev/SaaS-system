#!/usr/bin/env bash
set -euo pipefail

SERVER_CREDENTIALS_FILE="${SERVER_CREDENTIALS_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/server_credentials.md}"

if [ -f "$SERVER_CREDENTIALS_FILE" ]; then
  SERVER_IP=${SERVER_IP:-$(awk -F': ' '/^- IP:/ {print $2; exit 0}' "$SERVER_CREDENTIALS_FILE")}
  SERVER_USER=${SERVER_USER:-$(awk -F': ' '/^- Username:/ {print $2; exit 0}' "$SERVER_CREDENTIALS_FILE")}
  if [ -z "${SSHPASS:-}" ]; then
    SSHPASS=$(awk -F': ' '/^- Password:/ {print $2; exit 0}' "$SERVER_CREDENTIALS_FILE" || true)
    export SSHPASS
  fi
fi

REMOTE_HOST="${REMOTE_HOST:-${SERVER_USER:-root}@${SERVER_IP:-206.189.130.168}}"
REMOTE_WEBROOT="${REMOTE_WEBROOT:-/var/www/airline-b2b/html}"
LOCAL_OUT_DIR="${LOCAL_OUT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/airline-b2b/client/out}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required (or set up SSH keys and run rsync without sshpass)." >&2
  exit 1
fi

if [ ! -d "$LOCAL_OUT_DIR" ]; then
  echo "Local out directory not found: $LOCAL_OUT_DIR" >&2
  echo "Run: cd airline-b2b/client && npm run build" >&2
  exit 1
fi

if [ -z "${SSHPASS:-}" ]; then
  echo "SSHPASS is not set and no password found in $SERVER_CREDENTIALS_FILE" >&2
  exit 1
fi

# Ensure remote webroot exists
sshpass -e ssh \
  -o StrictHostKeyChecking=no \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  "$REMOTE_HOST" "mkdir -p '$REMOTE_WEBROOT'"

# Sync static export
sshpass -e rsync -av --delete \
  -e "ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -o PreferredAuthentications=password" \
  "$LOCAL_OUT_DIR/" \
  "$REMOTE_HOST:$REMOTE_WEBROOT/"

echo "Deployed client out/ to $REMOTE_HOST:$REMOTE_WEBROOT"