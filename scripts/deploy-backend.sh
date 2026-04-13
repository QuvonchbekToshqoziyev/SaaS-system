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
PM2_APP_NAME="${PM2_APP_NAME:-airline-backend}"
RUN_PRISMA_DB_PUSH="${RUN_PRISMA_DB_PUSH:-0}"

LOCAL_BACKEND_DIR="${LOCAL_BACKEND_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/airline-b2b/server}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required (or set up SSH keys and run rsync without sshpass)." >&2
  exit 1
fi

if [ ! -d "$LOCAL_BACKEND_DIR" ]; then
  echo "Local backend directory not found: $LOCAL_BACKEND_DIR" >&2
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

echo "==> Syncing backend sources to ${REMOTE_HOST}:${REMOTE_BACKEND_DIR}"
remote "mkdir -p '$REMOTE_BACKEND_DIR'"

# Sync source (keep remote .env and any persisted error registry files)
sshpass -e rsync -av \
  -e "ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -o PreferredAuthentications=password" \
  --exclude ".env" \
  --exclude "node_modules" \
  --exclude "dist" \
  --exclude ".next" \
  --exclude "error-registry*.json" \
  "$LOCAL_BACKEND_DIR/" \
  "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"

echo "==> Verifying required env exists (JWT_SECRET)"
# Don't print secret values; just check presence.
remote "cd '$REMOTE_BACKEND_DIR' && if [ -f .env ] && grep -q '^JWT_SECRET=' .env; then echo 'JWT_SECRET=present'; else echo 'JWT_SECRET=missing'; exit 2; fi" || {
  echo "FAIL: JWT_SECRET missing on production." >&2
  echo "Run: ./scripts/remote-set-jwt-secret.sh" >&2
  exit 2
}

echo "==> Stopping PM2 process (${PM2_APP_NAME})"
remote "pm2 stop '$PM2_APP_NAME' >/dev/null 2>&1 || true"

echo "==> Installing deps + rebuilding on server"
remote "cd '$REMOTE_BACKEND_DIR' && rm -rf node_modules dist && npm ci"

if [ "$RUN_PRISMA_DB_PUSH" = "1" ]; then
  echo "==> Syncing database schema (prisma db push)"
  remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db push"
fi

remote "cd '$REMOTE_BACKEND_DIR' && npm run build"

echo "==> Restarting PM2 process (${PM2_APP_NAME})"
remote "pm2 restart '$PM2_APP_NAME' --update-env"

echo "==> Health check: /auth/users should not be 404"
status=$(remote "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/auth/users || true")
if [ "$status" = "404" ] || [ -z "$status" ]; then
  echo "FAIL: /auth/users still returns 404" >&2
  echo "Tip: check logs: pm2 logs $PM2_APP_NAME --lines 80" >&2
  exit 1
fi

echo "OK: backend deployed (status=$status)"