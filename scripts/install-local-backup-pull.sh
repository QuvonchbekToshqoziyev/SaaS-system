#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PULL_SCRIPT="$SCRIPT_DIR/pull-latest-backup.sh"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

[[ -x "$PULL_SCRIPT" ]] || { echo "Missing executable pull script: $PULL_SCRIPT" >&2; exit 1; }
install -d -m 700 "$UNIT_DIR"

cat >"$UNIT_DIR/ado-b2b-backup-pull.service" <<EOF
[Unit]
Description=Pull latest encrypted ADO B2B backup
After=network-online.target

[Service]
Type=oneshot
ExecStart=$PULL_SCRIPT
EOF

cat >"$UNIT_DIR/ado-b2b-backup-pull.timer" <<'EOF'
[Unit]
Description=Daily off-server ADO B2B backup pull

[Timer]
OnCalendar=*-*-* 01:15:00 Asia/Tashkent
RandomizedDelaySec=10m
Persistent=true
Unit=ado-b2b-backup-pull.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now ado-b2b-backup-pull.timer
systemctl --user status ado-b2b-backup-pull.timer --no-pager
