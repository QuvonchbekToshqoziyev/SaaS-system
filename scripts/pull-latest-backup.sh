#!/usr/bin/env bash
set -euo pipefail

REMOTE="${ADO_BACKUP_HOST:-root@206.189.130.168}"
REMOTE_DIR="${ADO_BACKUP_REMOTE_DIR:-/var/backups/ado-b2b/postgres}"
LOCAL_DIR="${ADO_BACKUP_LOCAL_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/.private-backups/ado-b2b}"
IDENTITY_FILE="${ADO_BACKUP_IDENTITY_FILE:-$HOME/.ssh/id_ed25519}"
LOCAL_RETENTION_COUNT="${ADO_BACKUP_LOCAL_RETENTION_COUNT:-30}"
SSH_OPTIONS=(-i "$IDENTITY_FILE" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)

[[ -f "$IDENTITY_FILE" ]] || { echo "Missing SSH identity: $IDENTITY_FILE" >&2; exit 1; }
install -d -m 700 "$LOCAL_DIR"

remote_file="$(ssh "${SSH_OPTIONS[@]}" "$REMOTE" "find '$REMOTE_DIR' -maxdepth 1 -type f -name 'ado-b2b-*.dump.enc' -printf '%T@ %p\\n' | sort -rn | head -n1 | cut -d' ' -f2-")"
[[ "$remote_file" =~ ^${REMOTE_DIR}/ado-b2b-[0-9T]+Z\.dump\.enc$ ]] || { echo "No valid encrypted remote backup found" >&2; exit 1; }

filename="${remote_file##*/}"
temporary="$LOCAL_DIR/.${filename}.part"
trap 'rm -f "${temporary:-}"' EXIT
scp "${SSH_OPTIONS[@]}" "$REMOTE:$remote_file" "$temporary"

remote_sha="$(ssh "${SSH_OPTIONS[@]}" "$REMOTE" "sha256sum '$remote_file'" | awk '{print $1}')"
local_sha="$(sha256sum "$temporary" | awk '{print $1}')"
[[ "$remote_sha" == "$local_sha" ]] || { echo "Backup checksum mismatch" >&2; exit 1; }

chmod 600 "$temporary"
mv -f "$temporary" "$LOCAL_DIR/$filename"
trap - EXIT
find "$LOCAL_DIR" -maxdepth 1 -type f -name 'ado-b2b-*.dump.enc' -printf '%T@ %p\n' \
  | sort -rn \
  | awk -v keep="$LOCAL_RETENTION_COUNT" 'NR > keep { sub(/^[^ ]+ /, ""); print }' \
  | xargs -r rm -f

echo "$LOCAL_DIR/$filename"
