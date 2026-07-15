#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/root/apps/ado-b2b/airline-b2b/server/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ado-b2b/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL is missing" >&2; exit 1; }
PG_DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

install -d -m 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/ado-b2b-$stamp.dump"
umask 077
pg_dump --format=custom --compress=6 --no-owner --no-acl --dbname="$PG_DATABASE_URL" --file="$target"
pg_restore --list "$target" >/dev/null
find "$BACKUP_DIR" -type f -name 'ado-b2b-*.dump' -mtime "+$RETENTION_DAYS" -delete

if [[ -n "${BACKUP_COPY_CMD:-}" ]]; then
  BACKUP_FILE="$target" bash -lc "$BACKUP_COPY_CMD"
fi

echo "$target"
