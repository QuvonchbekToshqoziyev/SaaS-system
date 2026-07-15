#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
ENV_FILE="${2:-/root/apps/ado-b2b/airline-b2b/server/.env}"
[[ -f "$BACKUP_FILE" ]] || { echo "Usage: $0 BACKUP_FILE [ENV_FILE]" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[[ -n "${RESTORE_TEST_DATABASE_URL:-}" ]] || { echo "Set RESTORE_TEST_DATABASE_URL to a disposable database ending in _restore_test" >&2; exit 1; }
[[ "$RESTORE_TEST_DATABASE_URL" == *"_restore_test"* ]] || { echo "Refusing non-test restore target" >&2; exit 1; }

pg_restore --list "$BACKUP_FILE" >/dev/null
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_TEST_DATABASE_URL" "$BACKUP_FILE"
psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS restored_tables FROM pg_catalog.pg_tables WHERE schemaname = '\''public'\'';'
echo "Restore test passed: $BACKUP_FILE"
