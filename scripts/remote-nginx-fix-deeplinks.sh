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
SERVER_NAME="${SERVER_NAME:-quvonchbek.me}"

REQUIRED_TRY_FILES='try_files $uri $uri/ $uri/index.html =404;'

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

echo "==> Host: ${REMOTE_HOST}"

echo "==> Locating active Nginx config file for server_name ${SERVER_NAME}"
config_file=$(remote "sudo nginx -T 2>/dev/null" | awk -v sn="$SERVER_NAME" '
  /^# configuration file / {
    file=$4; gsub(/:$/, "", file);
    next
  }
    $0 ~ /^server[[:space:]]*\{/ { inblk=1; found=0; serverFile=file; next }
    inblk && $0 ~ /server_name/ && $0 ~ sn { found=1 }
    inblk && $0 ~ /^\}/ { if(found){print serverFile; exit 0} inblk=0 }
')

if [ -z "$config_file" ]; then
  echo "FAIL: Could not locate Nginx config file for ${SERVER_NAME}" >&2
  exit 1
fi

echo "config file: $config_file"

echo "==> Backing up config"
backup_file="$config_file.bak.$(date +%Y%m%d%H%M%S)"
remote "sudo cp '$config_file' '$backup_file'"
echo "backup: $backup_file"

echo "==> Patching deep-link try_files under location / for ${SERVER_NAME}"
# Patch on the server using perl (works reliably over SSH).
# - Replaces any existing try_files line inside location / blocks.
# - If no try_files exists, inserts it right after the opening brace.
remote "sudo perl -0777 -i -pe 'my \$r = q{try_files \$uri \$uri/ \$uri/index.html =404;}; s!(location\s+/\s*\{[^}]*?)\n\s*try_files[^\n]*;!\$1!sg; s!(location\s+/\s*\{\s*\n)(\s*)!\$1\$2\$r\n\$2!sg;' '$config_file'"

echo "==> Testing and reloading Nginx"
remote "sudo nginx -t"
remote "sudo systemctl reload nginx"

echo "Done. Re-run: ./scripts/prod-smoke.sh"