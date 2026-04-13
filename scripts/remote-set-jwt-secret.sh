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
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/root/airline-b2b/server}"

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required (or set up SSH keys)." >&2
  exit 1
fi

if [ -z "${SSHPASS:-}" ]; then
  echo "SSHPASS is not set and no password found in $SERVER_CREDENTIALS_FILE" >&2
  exit 1
fi

remote() {
  sshpass -e ssh \
    -o StrictHostKeyChecking=no \
    -o PubkeyAuthentication=no \
    -o PreferredAuthentications=password \
    "$REMOTE_HOST" "$@"
}

remote "mkdir -p '$REMOTE_BACKEND_DIR'"

remote "cd '$REMOTE_BACKEND_DIR' && touch .env && if grep -q '^JWT_SECRET=' .env; then echo 'JWT_SECRET=present'; else secret=\"\$(openssl rand -hex 48)\"; printf '\nJWT_SECRET=%s\n' \"\$secret\" >> .env; echo 'JWT_SECRET=created'; fi"

echo "Done. If you just created JWT_SECRET, existing sessions will require re-login."