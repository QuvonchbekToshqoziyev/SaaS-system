#!/usr/bin/env bash
set -euo pipefail

[[ "${EUID:-$(id -u)}" == "0" ]] || { echo "Run as root" >&2; exit 1; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$SCRIPT_DIR/backup-postgres.sh}"
ENV_FILE="${ENV_FILE:-/root/apps/ado-b2b/airline-b2b/server/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ado-b2b/postgres}"

[[ -x "$BACKUP_SCRIPT" ]] || { echo "Missing executable backup script: $BACKUP_SCRIPT" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing environment file: $ENV_FILE" >&2; exit 1; }

install -m 700 "$BACKUP_SCRIPT" /usr/local/sbin/ado-b2b-backup-postgres
install -d -m 700 "$BACKUP_DIR"

cat >/etc/systemd/system/ado-b2b-postgres-backup.service <<EOF
[Unit]
Description=ADO B2B encrypted PostgreSQL backup
After=network-online.target postgresql.service

[Service]
Type=oneshot
Environment=BACKUP_DIR=$BACKUP_DIR
Environment=RETENTION_COUNT=2
Environment=REQUIRE_BACKUP_ENCRYPTION=1
ExecStart=/usr/local/sbin/ado-b2b-backup-postgres $ENV_FILE
UMask=0077
Nice=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
EOF

cat >/etc/systemd/system/ado-b2b-postgres-backup.timer <<'EOF'
[Unit]
Description=Daily ADO B2B encrypted PostgreSQL backup

[Timer]
OnCalendar=*-*-* 00:30:00 UTC
RandomizedDelaySec=10m
Persistent=true
Unit=ado-b2b-postgres-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now ado-b2b-postgres-backup.timer
systemctl status ado-b2b-postgres-backup.timer --no-pager
