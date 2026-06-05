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

echo "==> Detecting Nginx server block for: ${SERVER_NAME}"
# Print the first matching server block from nginx -T, including the file path it came from.
server_block_with_file=$(remote "sudo nginx -T 2>/dev/null" | awk -v sn="$SERVER_NAME" '
  /^# configuration file / {
    # Example: # configuration file /etc/nginx/sites-enabled/default:
    file=$4; gsub(/:$/, "", file);
    next
  }
  $0 ~ /^server[[:space:]]*\{/ {
    inblk=1; buf=""; found=0; serverFile=file; buf=$0"\n"; next
  }
  inblk {buf=buf $0"\n"}
  inblk && $0 ~ /server_name/ && $0 ~ sn {found=1}
  inblk && $0 ~ /^\}/ {
    if(found){
      print "__FILE__=" serverFile "\n" buf;
      exit 0
    }
    inblk=0
  }
')

if [ -z "$server_block_with_file" ]; then
  echo "FAIL: Could not find a server block containing server_name ${SERVER_NAME}" >&2
  echo "Tip: run 'nginx -T' on the server and check enabled site files." >&2
  exit 1
fi

server_file=$(echo "$server_block_with_file" | awk -F= 'NR==1 && $1=="__FILE__" {print $2}')
server_block=$(echo "$server_block_with_file" | sed '1d')

echo "config file: ${server_file:-<unknown>}"

echo "--- server block ---"
echo "$server_block"

echo "==> Extracting root + try_files"
root_dir=$(echo "$server_block" | awk '$1=="root" {gsub(";","",$2); print $2; exit 0}')
try_files=$(echo "$server_block" | awk '$1=="try_files" {sub(/^[[:space:]]*/,"",$0); print; exit 0}')

echo "root: ${root_dir:-<not found>}"
echo "try_files: ${try_files:-<not found>}"

if [ -n "$root_dir" ]; then
  echo "==> Checking exported pages exist under root"
  remote "ls -la '$root_dir' || true"
  echo "--- firms/index.html ---"
  remote "ls -la '$root_dir/firms/index.html' || true"
  echo "--- settings/index.html ---"
  remote "ls -la '$root_dir/settings/index.html' || true"
else
  echo "WARN: No root directive found in server block." >&2
fi

echo "\nDone. If /firms/ falls back to /, fix try_files to: try_files \$uri \$uri/ \$uri/index.html =404; and reload nginx."