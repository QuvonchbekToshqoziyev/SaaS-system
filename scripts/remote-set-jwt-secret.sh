#!/usr/bin/env bash
set -euo pipefail

SERVER_CREDENTIALS_FILE="${SERVER_CREDENTIALS_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/server-pass.md}"
USE_SSH_KEY="${USE_SSH_KEY:-1}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-$HOME/.ssh/id_ed25519}"

if [ -f "$SERVER_CREDENTIALS_FILE" ]; then
  file_ip=$(awk -F':[[:space:]]*' 'tolower($1) ~ /(^|- )[[:space:]]*ip$|server/ {print $2; exit 0}' "$SERVER_CREDENTIALS_FILE" || true)
  file_user=$(awk -F':[[:space:]]*' 'tolower($1) ~ /username|user/ {print $2; exit 0}' "$SERVER_CREDENTIALS_FILE" || true)
  SERVER_IP=${SERVER_IP:-$file_ip}
  SERVER_USER=${SERVER_USER:-$file_user}
  if [ "$USE_SSH_KEY" != "1" ] && [ -z "${SSHPASS:-}" ]; then
    SSHPASS=$(awk -F':[[:space:]]*' 'tolower($1) ~ /password|pass/ {print $2; exit 0}' "$SERVER_CREDENTIALS_FILE" || true)
    export SSHPASS
  fi
fi

REMOTE_HOST="${REMOTE_HOST:-${SERVER_USER:-root}@${SERVER_IP:-206.189.130.168}}"
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/root/apps/ado-b2b/airline-b2b/server}"

if [ "$USE_SSH_KEY" = "1" ]; then
  [ -f "$SSH_IDENTITY_FILE" ] || { echo "SSH key not found: $SSH_IDENTITY_FILE" >&2; exit 1; }
  remote() { ssh -i "$SSH_IDENTITY_FILE" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$REMOTE_HOST" "$@"; }
else
  command -v sshpass >/dev/null 2>&1 || { echo "sshpass is required" >&2; exit 1; }
  [ -n "${SSHPASS:-}" ] || { echo "SSHPASS is not set and no password found in $SERVER_CREDENTIALS_FILE" >&2; exit 1; }
  remote() { sshpass -e ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o PreferredAuthentications=password "$REMOTE_HOST" "$@"; }
fi

remote "mkdir -p '$REMOTE_BACKEND_DIR'"

remote "cd '$REMOTE_BACKEND_DIR' && touch .env && if grep -q '^JWT_SECRET=' .env; then echo 'JWT_SECRET=present'; else secret=\"\$(openssl rand -hex 48)\"; printf '\nJWT_SECRET=%s\n' \"\$secret\" >> .env; echo 'JWT_SECRET=created'; fi"

echo "Done. If you just created JWT_SECRET, existing sessions will require re-login."
