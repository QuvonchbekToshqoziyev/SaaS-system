#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
ENV_FILE="${2:-/root/apps/ado-b2b/airline-b2b/server/.env}"
BACKUP_SECRET_FILE="${BACKUP_SECRET_FILE:-/etc/ado-b2b/backup.env}"
[[ -f "$BACKUP_FILE" ]] || { echo "Usage: $0 BACKUP_FILE [ENV_FILE]" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
if [[ -f "$BACKUP_SECRET_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$BACKUP_SECRET_FILE"
  set +a
fi
[[ -n "${RESTORE_TEST_DATABASE_URL:-}" ]] || { echo "Set RESTORE_TEST_DATABASE_URL to a disposable database ending in _restore_test" >&2; exit 1; }

archive="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.enc ]]; then
  [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]] || { echo "BACKUP_ENCRYPTION_PASSPHRASE is required" >&2; exit 1; }
  archive="$(mktemp --suffix=.dump)"
  trap 'rm -f "${archive:-}"' EXIT
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -out "$archive" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
fi

restore_database="$(psql "$RESTORE_TEST_DATABASE_URL" -Atqc 'SELECT current_database()')"
[[ "$restore_database" == *_restore_test ]] || { echo "Refusing non-test restore target: $restore_database" >&2; exit 1; }

pg_restore --list "$archive" >/dev/null
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_TEST_DATABASE_URL" "$archive"
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS restored_tables FROM pg_catalog.pg_tables WHERE schemaname = '\''public'\'';'
echo "Restore test passed: $BACKUP_FILE"
