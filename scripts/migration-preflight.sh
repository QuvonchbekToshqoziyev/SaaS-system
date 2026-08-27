#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OLD_SERVER_IP="${OLD_SERVER_IP:-206.189.130.168}"
NEW_SERVER_IP="${NEW_SERVER_IP:-}"
PROD_DOMAIN="${PROD_DOMAIN:-b2b.booking.ado-finance.com}"
DEV_DOMAIN="${DEV_DOMAIN:-dev.b2b.booking.ado-finance.com}"
PROD_BASE_URL="${PROD_BASE_URL:-https://${PROD_DOMAIN}}"

section() {
  printf '\n== %s ==\n' "$1"
}

resolve_ipv4() {
  local host="$1"
  getent ahostsv4 "$host" | awk '{print $1}' | sort -u | tr '\n' ' '
  printf '\n'
}

section "local tools"
for tool in curl getent sshpass ssh rsync node npm pg_dump; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'ok %s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf 'missing %s\n' "$tool"
  fi
done

section "release identity"
printf 'VERSION='
tr -d '\n' < "$REPO_ROOT/VERSION"
printf '\n'
node -e "console.log('client=' + require(process.argv[1]).version)" "$REPO_ROOT/airline-b2b/client/package.json"
node -e "console.log('server=' + require(process.argv[1]).version)" "$REPO_ROOT/airline-b2b/server/package.json"

section "dns"
printf '%s ' "$PROD_DOMAIN"
resolve_ipv4 "$PROD_DOMAIN"
printf '%s ' "$DEV_DOMAIN"
resolve_ipv4 "$DEV_DOMAIN"
printf 'expected_old_ip=%s\n' "$OLD_SERVER_IP"
if [ -n "$NEW_SERVER_IP" ]; then
  printf 'candidate_new_ip=%s\n' "$NEW_SERVER_IP"
fi

section "public production smoke"
BASE_URL="$PROD_BASE_URL" "$REPO_ROOT/scripts/prod-smoke.sh"

if [ -n "$NEW_SERVER_IP" ]; then
  section "new server direct-ip host-header probe"
  for path in / /login/ /api/auth/me; do
    code=$(curl -m 15 -sS -o /dev/null -w '%{http_code}' "http://${NEW_SERVER_IP}${path}" -H "Host: ${PROD_DOMAIN}" || true)
    printf '%s -> HTTP %s\n' "$path" "$code"
  done
fi

section "old server read-only inventory"
CREDS_FILE="${SERVER_CREDENTIALS_FILE:-}"
if [ -z "$CREDS_FILE" ]; then
  for candidate in "$REPO_ROOT/server-pass.md" "$REPO_ROOT/server_credentials.md" "$REPO_ROOT/server_credetials.md"; do
    if [ -f "$candidate" ]; then
      CREDS_FILE="$candidate"
      break
    fi
  done
fi

if [ -z "$CREDS_FILE" ] || [ ! -f "$CREDS_FILE" ]; then
  echo "skipped: no server credentials file found"
  exit 0
fi

if ! command -v sshpass >/dev/null 2>&1; then
  echo "skipped: sshpass missing"
  exit 0
fi

REMOTE_USER=$(awk -F':[[:space:]]*' 'tolower($1) ~ /username|user/ {print $2; exit}' "$CREDS_FILE" || true)
REMOTE_IP=$(awk -F':[[:space:]]*' 'tolower($1) ~ /(^|- )[[:space:]]*ip$|server/ {print $2; exit}' "$CREDS_FILE" || true)
if [ -z "${REMOTE_USER:-}" ]; then REMOTE_USER=root; fi
if [ -z "${REMOTE_IP:-}" ]; then REMOTE_IP="$OLD_SERVER_IP"; fi
if [ -z "${SSHPASS:-}" ]; then
  SSHPASS=$(awk -F':[[:space:]]*' 'tolower($1) ~ /password|pass/ {print $2; exit}' "$CREDS_FILE" || true)
  export SSHPASS
fi

if [ -z "${SSHPASS:-}" ]; then
  echo "skipped: no SSHPASS and no password in credentials file"
  exit 0
fi

sshpass -e ssh \
  -o StrictHostKeyChecking=no \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  "${REMOTE_USER}@${REMOTE_IP}" 'bash -s' <<'REMOTE'
set -euo pipefail
echo "host=$(hostname)"
uptime
df -h / /var /root 2>/dev/null || df -h
free -h
echo "-- pm2 --"
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{for (const p of JSON.parse(s||"[]")) console.log([p.name,p.pm2_env?.status,p.pm2_env?.pm_cwd].join(" | "))})' || pm2 status
echo "-- nginx --"
nginx -t 2>&1
echo "-- certs --"
for d in b2b.booking.ado-finance.com dev.b2b.booking.ado-finance.com; do
  cert="/etc/letsencrypt/live/$d/fullchain.pem"
  if [ -f "$cert" ]; then
    echo "$d $(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2-)"
  else
    echo "$d missing"
  fi
done
echo "-- env keys only --"
for f in /root/apps/ado-b2b/airline-b2b/server/.env /root/apps/ado-b2b-dev/airline-b2b/server/.env; do
  echo "$f"
  if [ -f "$f" ]; then
    sed -n 's/^\([A-Za-z0-9_]*\)=.*/\1=SET/p' "$f" | sort
  else
    echo missing
  fi
done
REMOTE
