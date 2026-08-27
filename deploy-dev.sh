#!/usr/bin/env bash
# =============================================================================
# ADO B2B - Dev/Staging Deploy Script
# Domain : dev.b2b.booking.ado-finance.com
# Server : 206.189.130.168  (root)
#
# This deploys a second copy beside production:
#   - backend port: 5001
#   - PM2 app: airline-b2b-dev-server
#   - backend dir: /root/apps/ado-b2b-dev/airline-b2b/server
#   - webroot: /var/www/dev.b2b.booking.ado-finance.com/html
#
# Usage:
#   ./deploy-dev.sh                      # full dev deploy
#   ./deploy-dev.sh --backend-only       # only dev backend
#   ./deploy-dev.sh --frontend-only      # only dev frontend
#   ./deploy-dev.sh --schema             # also run prisma db push on dev DB
# =============================================================================
set -euo pipefail

DOMAIN="dev.b2b.booking.ado-finance.com"
REMOTE_SERVER_IP="${REMOTE_SERVER_IP:-206.189.130.168}"
REMOTE_USER="${REMOTE_USER:-root}"
BACKEND_PORT="5001"
REMOTE_BACKEND_DIR="${DEV_REMOTE_BACKEND_DIR:-/root/apps/ado-b2b-dev/airline-b2b/server}"
REMOTE_WEBROOT="/var/www/${DOMAIN}/html"
PM2_APP_NAME="${DEV_PM2_APP_NAME:-airline-b2b-dev-server}"
NGINX_CONF_NAME="${DOMAIN}"
DEV_RELEASE_STATE_DIR="/root/apps/ado-b2b-dev/.release-state"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$REPO_ROOT/airline-b2b/server"
CLIENT_DIR="$REPO_ROOT/airline-b2b/client"
NGINX_CONF_SRC="$REPO_ROOT/nginx.conf.dev.b2b.ado-finance.com"
SOURCE_FINGERPRINT_SCRIPT="$REPO_ROOT/scripts/source-fingerprint.mjs"

BACKEND_ONLY=0
FRONTEND_ONLY=0
RUN_SCHEMA=0
USE_SSH_KEY="${USE_SSH_KEY:-1}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-$HOME/.ssh/id_ed25519}"

for arg in "$@"; do
  case $arg in
    --backend-only) BACKEND_ONLY=1 ;;
    --frontend-only) FRONTEND_ONLY=1 ;;
    --schema) RUN_SCHEMA=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'
info() { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
header() { echo -e "\n${BOLD}== $* ==${RESET}"; }

CREDS_FILE="$REPO_ROOT/server-pass.md"
if [[ ! -f "$CREDS_FILE" ]]; then
  for candidate in "$REPO_ROOT/server_credentials.md" "$REPO_ROOT/server_credetials.md"; do
    if [[ -f "$candidate" ]]; then
      CREDS_FILE="$candidate"
      break
    fi
  done
fi
if [[ -f "$CREDS_FILE" ]]; then
  file_user=$(awk -F':[[:space:]]*' 'tolower($1) ~ /username|user/ {print $2; exit}' "$CREDS_FILE" || true)
  file_ip=$(awk -F':[[:space:]]*' 'tolower($1) ~ /(^|- )[[:space:]]*ip$|server/ {print $2; exit}' "$CREDS_FILE" || true)
  [[ -n "${file_user:-}" ]] && REMOTE_USER="$file_user"
  [[ -n "${file_ip:-}" ]] && REMOTE_SERVER_IP="$file_ip"
  if [[ "$USE_SSH_KEY" != "1" && -z "${SSHPASS:-}" ]]; then
    SSHPASS=$(awk -F':[[:space:]]*' 'tolower($1) ~ /password|pass/ {print $2; exit}' "$CREDS_FILE" || true)
    export SSHPASS
  fi
fi

REMOTE_HOST="${REMOTE_USER}@${REMOTE_SERVER_IP}"

if [[ "$USE_SSH_KEY" == "1" ]]; then
  [[ -f "$SSH_IDENTITY_FILE" ]] || { error "SSH key not found: $SSH_IDENTITY_FILE"; exit 1; }
  SSH_KEY_OPTS=(-i "$SSH_IDENTITY_FILE" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
  remote() { ssh "${SSH_KEY_OPTS[@]}" "$REMOTE_HOST" "$@"; }
  rsync_cmd() { rsync -e "ssh -i $SSH_IDENTITY_FILE -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" "$@"; }
else
  command -v sshpass >/dev/null 2>&1 || { error "sshpass not found. Install it or set USE_SSH_KEY=1."; exit 1; }
  [[ -z "${SSHPASS:-}" ]] && { error "No password: set SSHPASS env var or create server-pass.md"; exit 1; }
  SSH_OPTS="-o StrictHostKeyChecking=no -o PubkeyAuthentication=no -o PreferredAuthentications=password"
  remote() { sshpass -e ssh $SSH_OPTS "$REMOTE_HOST" "$@"; }
  rsync_cmd() { sshpass -e rsync -e "ssh $SSH_OPTS" "$@"; }
fi

header "Pre-flight checks"
command -v rsync >/dev/null 2>&1 || { error "rsync not found"; exit 1; }
command -v npm >/dev/null 2>&1 || { error "npm not found"; exit 1; }
[[ -f "$NGINX_CONF_SRC" ]] || { error "Missing nginx config: $NGINX_CONF_SRC"; exit 1; }
[[ -f "$SOURCE_FINGERPRINT_SCRIPT" ]] || { error "Missing source fingerprint script: $SOURCE_FINGERPRINT_SCRIPT"; exit 1; }

info "Target: ${REMOTE_HOST}  domain: ${DOMAIN}"
remote "echo 'SSH OK'" && success "SSH connection OK"

install_remote_dependencies() {
  local package_dir="$1" fingerprint
  fingerprint=$(node "$SOURCE_FINGERPRINT_SCRIPT" dependencies "$package_dir/package-lock.json")
  remote "cd '$REMOTE_BACKEND_DIR' && expected='$fingerprint'; current=\$(cat node_modules/.ado-dependencies.sha256 2>/dev/null || true); if [ -d node_modules ] && [ \"\$current\" = \"\$expected\" ]; then echo 'Dependencies unchanged - npm ci skipped'; else timeout 180s npm ci --prefer-offline --no-audit --no-fund; printf '%s\n' \"\$expected\" > node_modules/.ado-dependencies.sha256; fi"
}

install_local_dependencies() {
  local package_dir="$1" fingerprint stamp current
  fingerprint=$(node "$SOURCE_FINGERPRINT_SCRIPT" dependencies "$package_dir/package-lock.json")
  stamp="$package_dir/node_modules/.ado-dependencies.sha256"
  current=$(cat "$stamp" 2>/dev/null || true)
  if [[ -d "$package_dir/node_modules" && "$current" == "$fingerprint" ]]; then
    info "Client dependencies unchanged - npm ci skipped"
    return
  fi
  timeout 180s npm --prefix "$package_dir" ci --prefer-offline --no-audit --no-fund
  printf '%s\n' "$fingerprint" > "$stamp"
}

deploy_backend() {
  header "Dev backend - sync source"
  remote "mkdir -p '$REMOTE_BACKEND_DIR'"

  rsync_cmd -av --delete \
    --exclude ".env" \
    --exclude "node_modules" \
    --exclude "dist" \
    --exclude ".next" \
    --exclude "error-registry*.json" \
    "$SERVER_DIR/" \
    "$REMOTE_HOST:$REMOTE_BACKEND_DIR/"
  success "Source synced"

  header "Dev backend - write .env"
  remote "bash -s" <<REMOTE_ENV
set -euo pipefail
ENV_FILE="${REMOTE_BACKEND_DIR}/.env"
touch "\$ENV_FILE"
chmod 600 "\$ENV_FILE"

write_var() {
  local key="\$1" val="\$2"
  if grep -q "^\${key}=" "\$ENV_FILE" 2>/dev/null; then
    sed -i "s|^\${key}=.*|\${key}=\${val}|" "\$ENV_FILE"
  else
    echo "\${key}=\${val}" >> "\$ENV_FILE"
  fi
}

if ! grep -q '^DATABASE_URL=' "\$ENV_FILE" 2>/dev/null; then
  echo "ERROR: DATABASE_URL is not set in \$ENV_FILE." >&2
  echo "Create a separate dev database, then add DATABASE_URL to this file before deploying:" >&2
  echo "  ${REMOTE_BACKEND_DIR}/.env" >&2
  exit 1
fi

if ! grep -q '^JWT_SECRET=' "\$ENV_FILE"; then
  secret=\$(openssl rand -hex 48)
  echo "JWT_SECRET=\$secret" >> "\$ENV_FILE"
  echo "JWT_SECRET created"
else
  echo "JWT_SECRET present"
fi

if ! grep -q '^CHAT_ENCRYPTION_KEY=' "\$ENV_FILE"; then
  secret=\$(openssl rand -hex 32)
  echo "CHAT_ENCRYPTION_KEY=\$secret" >> "\$ENV_FILE"
  echo "CHAT_ENCRYPTION_KEY created"
else
  echo "CHAT_ENCRYPTION_KEY present"
fi

write_var "NODE_ENV" "production"
write_var "PORT" "${BACKEND_PORT}"
write_var "PUBLIC_WEB_ORIGIN" "https://${DOMAIN}"
write_var "CORS_ORIGINS" "https://${DOMAIN}"
echo ".env updated"
REMOTE_ENV
  success "Remote dev .env updated"

  header "Dev backend - install deps & build"
  install_remote_dependencies "$SERVER_DIR"
  remote "cd '$REMOTE_BACKEND_DIR' && npx prisma generate"

  if [[ "$RUN_SCHEMA" == "1" ]]; then
    info "Running prisma db push on dev database..."
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db push --accept-data-loss"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260715_ticket_allocation_changes/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260715_rt_ow_ticket_legs/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260715_unique_allocation_payable/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260717_remove_inventory_transactions/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260721_tour_sale_discount/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260721_transaction_history_fields/migration.sql --schema prisma/schema.prisma"
    success "Dev schema pushed"
  fi

  remote "cd '$REMOTE_BACKEND_DIR' && npm run build"
  remote "cd '$REMOTE_BACKEND_DIR' && npm run backfill:expense-categories"
  remote "cd '$REMOTE_BACKEND_DIR' && ALLOW_DEV_QA_SEED=1 npm run seed:dev-qa"
  remote "cd '$REMOTE_BACKEND_DIR' && npm run audit:business-invariants"
  success "Build, release seed, and invariant audit complete"

  header "Dev backend - restart PM2"
  remote "pm2 describe '$PM2_APP_NAME' >/dev/null 2>&1 \
    && pm2 restart '$PM2_APP_NAME' --update-env \
    || pm2 start bash \
         --name '$PM2_APP_NAME' \
         --cwd '$REMOTE_BACKEND_DIR' \
         -- -lc 'set -a; . ./.env; set +a; exec node dist/index.js'"
  remote "pm2 save"
  success "PM2 restarted - $PM2_APP_NAME"

  header "Dev backend - health check"
  for _ in $(seq 1 15); do
    status=$(remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${BACKEND_PORT}/flights || true")
    if echo "$status" | grep -qE "^(200|401)$"; then
      success "Dev backend healthy (HTTP $status)"
      return 0
    fi
    sleep 2
  done
  error "Dev backend health check failed. Check PM2 logs: pm2 logs $PM2_APP_NAME"
  return 1
}

deploy_frontend() {
  header "Dev frontend - build static export"

  info "Building Next.js static export..."
  install_local_dependencies "$CLIENT_DIR"
  NEXT_PUBLIC_API_URL=/api npm --prefix "$CLIENT_DIR" run build
  success "Static export complete"

  header "Dev frontend - sync to server webroot"
  remote "mkdir -p '$REMOTE_WEBROOT'"
  rsync_cmd -av --delete \
    "$CLIENT_DIR/out/" \
    "$REMOTE_HOST:$REMOTE_WEBROOT/"
  success "Static files synced to $REMOTE_WEBROOT"

  header "Dev frontend - install & configure Nginx"
  NGINX_DEST="/etc/nginx/sites-available/${NGINX_CONF_NAME}"
  NGINX_LINK="/etc/nginx/sites-enabled/${NGINX_CONF_NAME}"

  remote "bash -s" <<NGINX_BOOTSTRAP
set -euo pipefail
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cat > "$NGINX_DEST" <<'HTTPONLY'
server {
    listen 80;
    server_name __DOMAIN__;

    root __REMOTE_WEBROOT__;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:__BACKEND_PORT__/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        try_files \$uri \$uri/ \$uri/index.html =404;
    }
}
HTTPONLY
  sed -i \
    -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__REMOTE_WEBROOT__|${REMOTE_WEBROOT}|g" \
    -e "s|__BACKEND_PORT__|${BACKEND_PORT}|g" \
    "$NGINX_DEST"
  ln -sf "$NGINX_DEST" "$NGINX_LINK"
  nginx -t
  systemctl reload nginx
  echo "HTTP bootstrap config enabled"

  echo "SSL cert missing - attempting certbot..."
  apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true
  certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos \
    --register-unsafely-without-email 2>&1 || {
      echo "WARN: certbot failed. HTTP-only mode may remain active until DNS/certbot is fixed."
      exit 0
    }
else
  echo "SSL cert exists"
fi
NGINX_BOOTSTRAP

  cert_ready=$(remote "test -f '/etc/letsencrypt/live/${DOMAIN}/fullchain.pem' && echo 1 || echo 0")
  if [[ "$cert_ready" != "1" ]]; then
    warn "SSL cert is not ready. Leaving HTTP bootstrap config active for ${DOMAIN}."
    warn "Fix DNS/certbot, then rerun ./deploy-dev.sh --frontend-only."
    return 0
  fi

  rsync_cmd -av "$NGINX_CONF_SRC" "$REMOTE_HOST:${NGINX_DEST}"
  success "HTTPS Nginx config uploaded"

  remote "bash -s" <<NGINX_SETUP
set -euo pipefail
ln -sf "$NGINX_DEST" "$NGINX_LINK"

nginx -t
systemctl reload nginx
echo "Nginx reloaded"
NGINX_SETUP
  success "Nginx configured and reloaded"

  header "Dev frontend - response check"
  for _ in $(seq 1 10); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://${REMOTE_SERVER_IP}" \
      -H "Host: ${DOMAIN}" 2>/dev/null || true)
    if echo "$code" | grep -qE "^(200|301|302)$"; then
      success "Dev frontend responding (HTTP $code)"
      return 0
    fi
    sleep 2
  done
  warn "Frontend check inconclusive. DNS may not point at ${REMOTE_SERVER_IP} yet."
}

if [[ "$FRONTEND_ONLY" == "0" ]]; then
  backend_source=$(node "$SOURCE_FINGERPRINT_SCRIPT" backend)
  deploy_backend
  remote "mkdir -p '$DEV_RELEASE_STATE_DIR' && printf '%s\n' '$backend_source' > '$DEV_RELEASE_STATE_DIR/backend.sha256'"
  if [[ "$RUN_SCHEMA" == "1" ]]; then
    remote "printf '%s\n' '$backend_source' > '$DEV_RELEASE_STATE_DIR/schema.sha256'"
  fi
fi
if [[ "$BACKEND_ONLY" == "0" ]]; then
  frontend_source=$(node "$SOURCE_FINGERPRINT_SCRIPT" frontend)
  deploy_frontend
  remote "mkdir -p '$DEV_RELEASE_STATE_DIR' && printf '%s\n' '$frontend_source' > '$DEV_RELEASE_STATE_DIR/frontend.sha256'"
fi

echo ""
echo -e "${BOLD}ADO B2B - Dev Deploy Complete${RESET}"
echo -e "${BOLD}URL     : https://${DOMAIN}${RESET}"
echo -e "${BOLD}Backend : PM2 ${PM2_APP_NAME} (port ${BACKEND_PORT})${RESET}"
echo -e "${BOLD}Webroot : ${REMOTE_WEBROOT}${RESET}"
echo -e "${BOLD}Deploy  : ./deploy-dev.sh${RESET}"
