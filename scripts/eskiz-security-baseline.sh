#!/usr/bin/env bash
set -euo pipefail

if [[ "${APPLY_ESKIZ_SECURITY_BASELINE:-0}" != "1" ]]; then
  echo "Dry run only. Re-run with APPLY_ESKIZ_SECURITY_BASELINE=1 on the new VPS."
  echo "Will install ufw/fail2ban, allow only 22/80/443 inbound, protect SSH/app login, and rotate logs."
  exit 0
fi

apt-get update
packages=(ufw fail2ban logrotate openssl)
command -v pg_dump >/dev/null 2>&1 || packages+=(postgresql-client-16)
apt-get install -y "${packages[@]}"

ufw default deny incoming
ufw default allow outgoing
ufw --force delete allow 8081/tcp >/dev/null 2>&1 || true
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

cat >/etc/fail2ban/filter.d/ado-b2b-login.conf <<'FILTER'
[Definition]
failregex = ^<HOST> .* "POST /api/auth/login(?:\?[^ ]*)? HTTP/[^\"]+" (?:401|429)\s
ignoreregex =
FILTER

cat >/etc/fail2ban/jail.d/ado-b2b.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h

[nginx-http-auth]
enabled = true

[ado-b2b-login]
enabled = true
port = http,https
filter = ado-b2b-login
logpath = /var/log/nginx/access.log
maxretry = 8
findtime = 10m
bantime = 1h
JAIL

fail2ban-client -t
systemctl enable --now fail2ban
systemctl restart fail2ban

cat >/etc/logrotate.d/ado-b2b-pm2 <<'ROTATE'
/root/.pm2/logs/*.log {
  daily
  rotate 3
  compress
  missingok
  notifempty
  copytruncate
}
ROTATE

echo "Baseline applied. Disable SSH password login only after key login is verified."
