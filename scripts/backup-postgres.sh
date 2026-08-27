#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/root/apps/ado-b2b/airline-b2b/server/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ado-b2b/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
RETENTION_COUNT="${RETENTION_COUNT:-}"
REQUIRE_BACKUP_ENCRYPTION="${REQUIRE_BACKUP_ENCRYPTION:-0}"

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "RETENTION_DAYS must be a non-negative integer" >&2; exit 1; }
[[ -z "$RETENTION_COUNT" || "$RETENTION_COUNT" =~ ^[1-9][0-9]*$ ]] || { echo "RETENTION_COUNT must be a positive integer" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL is missing" >&2; exit 1; }
if [[ "$REQUIRE_BACKUP_ENCRYPTION" == "1" && -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  echo "BACKUP_ENCRYPTION_PASSPHRASE is required" >&2
  exit 1
fi
PG_DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

install -d -m 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/ado-b2b-$stamp.dump"
verification_file=""
encrypted_partial=""
backup_complete=0
cleanup() {
  rm -f "${verification_file:-}" "${encrypted_partial:-}"
  [[ "$backup_complete" == "1" ]] || rm -f "$target"
}
trap cleanup EXIT
umask 077
pg_dump --format=custom --compress=6 --no-owner --no-acl --dbname="$PG_DATABASE_URL" --file="$target"
pg_restore --list "$target" >/dev/null

if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  encrypted_target="${target}.enc"
  encrypted_partial="${encrypted_target}.partial"
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$target" -out "$encrypted_partial" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  verification_file="$(mktemp "$BACKUP_DIR/.verify-XXXXXX.dump")"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$encrypted_partial" -out "$verification_file" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  pg_restore --list "$verification_file" >/dev/null
  mv "$encrypted_partial" "$encrypted_target"
  encrypted_partial=""
  rm -f "$target"
  rm -f "$verification_file"
  verification_file=""
  target="$encrypted_target"
fi
backup_complete=1

find "$BACKUP_DIR" -type f \( -name 'ado-b2b-*.dump' -o -name 'ado-b2b-*.dump.enc' \) -mtime "+$RETENTION_DAYS" -delete
if [[ -n "$RETENTION_COUNT" ]]; then
  find "$BACKUP_DIR" -type f \( -name 'ado-b2b-*.dump' -o -name 'ado-b2b-*.dump.enc' \) -printf '%T@ %p\n' \
    | sort -rn \
    | awk -v keep="$RETENTION_COUNT" 'NR > keep { sub(/^[^ ]+ /, ""); print }' \
    | xargs -r rm -f
fi

if [[ -n "${BACKUP_COPY_CMD:-}" ]]; then
  BACKUP_FILE="$target" bash -lc "$BACKUP_COPY_CMD"
fi

echo "$target"
