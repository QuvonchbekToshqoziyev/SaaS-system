#!/usr/bin/env bash
# =============================================================================
# ADO B2B — Production Deploy Script
# Domain : b2b.booking.ado-finance.com
# Server : 206.189.130.168  (root)
#
# Usage:
#   ./deploy.sh --dev-verified      # full deploy (backend + frontend) from exact audited dev source
#   ./deploy.sh --backend-only       # only backend (PM2)
#   ./deploy.sh --frontend-only      # only frontend (Nginx static)
#   ./deploy.sh --schema             # also run prisma db push
#   ./deploy.sh --dev-verified       # require and reuse the exact audited dev source
#   ./deploy.sh --skip-dev-sync      # emergency only: do not sync dev first
#
# Auth (pick one):
#   1. File   → create server-pass.md or server_credentials.md at repo root (git-ignored):
#                  - IP: 206.189.130.168
#                  - Username: root
#                  - Password: <your_password>
#   2. Env    → export SSHPASS=<password>
#   3. SSH key → set USE_SSH_KEY=1 (no password needed)
# =============================================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
DOMAIN="b2b.booking.ado-finance.com"
REMOTE_SERVER_IP="206.189.130.168"
REMOTE_USER="root"
REMOTE_BACKEND_DIR="/root/apps/ado-b2b/airline-b2b/server"
REMOTE_WEBROOT="/var/www/${DOMAIN}/html"
PM2_APP_NAME="airline-b2b-server"
NGINX_CONF_NAME="${DOMAIN}"
DEV_RELEASE_STATE_DIR="/root/apps/ado-b2b-dev/.release-state"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$REPO_ROOT/airline-b2b/server"
CLIENT_DIR="$REPO_ROOT/airline-b2b/client"
NGINX_CONF_SRC="$REPO_ROOT/nginx.conf.b2b.ado-finance.com"
SOURCE_FINGERPRINT_SCRIPT="$REPO_ROOT/scripts/source-fingerprint.mjs"

# ── Flags ────────────────────────────────────────────────────────────────────
BACKEND_ONLY=0; FRONTEND_ONLY=0; RUN_SCHEMA=0; DEV_VERIFIED=0; SKIP_DEV_SYNC="${SKIP_DEV_SYNC:-0}"; USE_SSH_KEY="${USE_SSH_KEY:-0}"
for arg in "$@"; do
  case $arg in
    --backend-only)  BACKEND_ONLY=1 ;;
    --frontend-only) FRONTEND_ONLY=1 ;;
    --schema)        RUN_SCHEMA=1 ;;
    --dev-verified)  DEV_VERIFIED=1 ;;
    --skip-dev-sync) SKIP_DEV_SYNC=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}══ $* ══${RESET}"; }

# ── Load credentials ─────────────────────────────────────────────────────────
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
  if [[ -z "${SSHPASS:-}" ]]; then
    SSHPASS=$(awk -F':[[:space:]]*' 'tolower($1) ~ /password|pass/ {print $2; exit}' "$CREDS_FILE" || true)
    export SSHPASS
  fi
fi

REMOTE_HOST="${REMOTE_USER}@${REMOTE_SERVER_IP}"

# ── SSH helper ───────────────────────────────────────────────────────────────
if [[ "$USE_SSH_KEY" == "1" ]]; then
  remote() { ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "$@"; }
  rsync_cmd() { rsync "$@"; }
else
  command -v sshpass &>/dev/null || { error "sshpass not found — install it or set USE_SSH_KEY=1"; exit 1; }
  [[ -z "${SSHPASS:-}" ]] && { error "No password: set SSHPASS env var or create server-pass.md"; exit 1; }
  SSH_OPTS="-o StrictHostKeyChecking=no -o PubkeyAuthentication=no -o PreferredAuthentications=password"
  remote() { sshpass -e ssh $SSH_OPTS "$REMOTE_HOST" "$@"; }
  rsync_cmd() { sshpass -e rsync -e "ssh $SSH_OPTS" "$@"; }
fi

# ── Pre-flight ────────────────────────────────────────────────────────────────
header "Pre-flight checks"
command -v rsync &>/dev/null || { error "rsync not found"; exit 1; }
command -v npm   &>/dev/null || { error "npm not found";   exit 1; }
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

verified_dev_matches_source() {
  node "$SOURCE_FINGERPRINT_SCRIPT" verify-dev >/dev/null 2>&1 || return 1

  local expected actual
  if [[ "$FRONTEND_ONLY" == "0" ]]; then
    expected=$(node "$SOURCE_FINGERPRINT_SCRIPT" backend)
    actual=$(remote "cat '$DEV_RELEASE_STATE_DIR/backend.sha256' 2>/dev/null || true")
    [[ "$actual" == "$expected" ]] || return 1
    if [[ "$RUN_SCHEMA" == "1" ]]; then
      actual=$(remote "cat '$DEV_RELEASE_STATE_DIR/schema.sha256' 2>/dev/null || true")
      [[ "$actual" == "$expected" ]] || return 1
    fi
  fi
  if [[ "$BACKEND_ONLY" == "0" ]]; then
    expected=$(node "$SOURCE_FINGERPRINT_SCRIPT" frontend)
    actual=$(remote "cat '$DEV_RELEASE_STATE_DIR/frontend.sha256' 2>/dev/null || true")
    [[ "$actual" == "$expected" ]] || return 1
  fi
}

sync_dev_before_prod() {
  if [[ "$SKIP_DEV_SYNC" == "1" ]]; then
    warn "Skipping dev sync before production deploy. Use only for emergencies."
    return 0
  fi

  if verified_dev_matches_source; then
    success "Exact source already deployed and audited on dev - duplicate dev deploy skipped"
    return 0
  fi
  error "Production promotion requires an exact audited dev source. Run ./deploy-dev.sh, node scripts/release-audit.mjs --live-only, then ./deploy.sh --dev-verified."
  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# BACKEND
# ─────────────────────────────────────────────────────────────────────────────
deploy_backend() {
  header "Backend — sync source"

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

  header "Backend — write production .env"
  # Write env vars on the remote — never store secrets in git.
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

# DATABASE_URL — keep existing if already set; else fail loudly
if ! grep -q '^DATABASE_URL=' "\$ENV_FILE" 2>/dev/null; then
  echo "ERROR: DATABASE_URL not set in \$ENV_FILE — add it manually on the server:" >&2
  echo "  echo 'DATABASE_URL=postgresql://user:pass@localhost:5432/airline_db?schema=public' >> \$ENV_FILE" >&2
  exit 1
fi

# Generate JWT_SECRET if missing
if ! grep -q '^JWT_SECRET=' "\$ENV_FILE"; then
  secret=\$(openssl rand -hex 48)
  echo "JWT_SECRET=\$secret" >> "\$ENV_FILE"
  echo "JWT_SECRET created"
else
  echo "JWT_SECRET present"
fi

write_var "NODE_ENV"          "production"
write_var "PORT"              "5000"
write_var "PUBLIC_WEB_ORIGIN" "https://${DOMAIN}"
write_var "CORS_ORIGINS"      "https://${DOMAIN}"
echo ".env updated"
REMOTE_ENV
  success "Remote .env updated"

  header "Backend — install deps & build"
  install_remote_dependencies "$SERVER_DIR"
  remote "cd '$REMOTE_BACKEND_DIR' && npx prisma generate"

  if [[ "$RUN_SCHEMA" == "1" ]]; then
    header "Backend — production database backup"
    rsync_cmd -av "$REPO_ROOT/scripts/backup-postgres.sh" "$REMOTE_HOST:/tmp/ado-b2b-backup-postgres.sh"
    remote "chmod 700 /tmp/ado-b2b-backup-postgres.sh && BACKUP_DIR=/var/backups/ado-b2b/postgres /tmp/ado-b2b-backup-postgres.sh '$REMOTE_BACKEND_DIR/.env'"
    success "Verified production database backup created"

    info "Running non-destructive prisma db push..."
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db push"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260715_ticket_allocation_changes/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260715_rt_ow_ticket_legs/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260715_unique_allocation_payable/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260717_remove_inventory_transactions/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260721_tour_sale_discount/migration.sql --schema prisma/schema.prisma"
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db execute --file prisma/migrations/20260721_transaction_history_fields/migration.sql --schema prisma/schema.prisma"
    success "Schema pushed without accepting destructive changes"
  fi

  remote "cd '$REMOTE_BACKEND_DIR' && npm run build"
  remote "cd '$REMOTE_BACKEND_DIR' && npm run backfill:expense-categories"
  remote "cd '$REMOTE_BACKEND_DIR' && npm run audit:business-invariants"
  success "Build complete"

  header "Backend — restart PM2"
  remote "pm2 describe '$PM2_APP_NAME' >/dev/null 2>&1 \
    && pm2 restart '$PM2_APP_NAME' --update-env \
    || pm2 start '$REMOTE_BACKEND_DIR/dist/index.js' \
         --name '$PM2_APP_NAME' \
         --cwd '$REMOTE_BACKEND_DIR' \
         --env-file '$REMOTE_BACKEND_DIR/.env'"
  remote "pm2 save"
  success "PM2 restarted — $PM2_APP_NAME"

  header "Backend — health check"
  for i in $(seq 1 15); do
    status=$(remote "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/flights || true")
    if echo "$status" | grep -qE "^(200|401)$"; then
      success "Backend healthy (HTTP $status)"
      return 0
    fi
    sleep 2
  done
  error "Backend health check failed — check PM2 logs: pm2 logs $PM2_APP_NAME"
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# FRONTEND
# ─────────────────────────────────────────────────────────────────────────────
deploy_frontend() {
  header "Frontend — build static export"

  # Write client env pointing at the API via /api prefix through nginx
  cat > "$CLIENT_DIR/.env.production" <<CLIENTENV
NEXT_PUBLIC_API_URL=/api
CLIENTENV

  info "Building Next.js static export..."
  install_local_dependencies "$CLIENT_DIR"
  NEXT_PUBLIC_API_URL=/api npm --prefix "$CLIENT_DIR" run build
  success "Static export complete → airline-b2b/client/out/"

  header "Frontend — sync to server webroot"
  remote "mkdir -p '$REMOTE_WEBROOT'"
  rsync_cmd -av --delete \
    "$CLIENT_DIR/out/" \
    "$REMOTE_HOST:$REMOTE_WEBROOT/"
  success "Static files synced to $REMOTE_WEBROOT"

  header "Frontend — install & configure Nginx"
  NGINX_DEST="/etc/nginx/sites-available/${NGINX_CONF_NAME}"
  NGINX_LINK="/etc/nginx/sites-enabled/${NGINX_CONF_NAME}"

  # Upload nginx config
  rsync_cmd -av \
    "$NGINX_CONF_SRC" \
    "$REMOTE_HOST:${NGINX_DEST}"
  success "Nginx config uploaded"

  remote "bash -s" <<NGINX_SETUP
set -euo pipefail
# Enable site
ln -sf "$NGINX_DEST" "$NGINX_LINK"

# Install certbot + get cert if not already present (requires domain DNS to point here)
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "SSL cert missing — attempting certbot..."
  apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true
  certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos \
    --register-unsafely-without-email 2>&1 || {
      echo "WARN: certbot failed. HTTP-only mode active. Run certbot manually."
      # Fallback: enable HTTP-only config
      sed -i 's/return 301 https.*$/# SSL pending/;/listen 443/,/}/{ /ssl_/d }/' "$NGINX_DEST" || true
    }
else
  echo "SSL cert exists"
fi

nginx -t && systemctl reload nginx
echo "Nginx reloaded"
NGINX_SETUP
  success "Nginx configured and reloaded"

  header "Frontend — deep-link check"
  for i in $(seq 1 10); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://${REMOTE_SERVER_IP}" \
           -H "Host: ${DOMAIN}" 2>/dev/null || true)
    if echo "$code" | grep -qE "^(200|301|302)$"; then
      success "Frontend responding (HTTP $code)"
      return 0
    fi
    sleep 2
  done
  warn "Frontend check inconclusive — DNS may not propagate yet"
}

# ─────────────────────────────────────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────────────────────────────────────
sync_dev_before_prod

if [[ "$FRONTEND_ONLY" == "0" ]]; then deploy_backend; fi
if [[ "$BACKEND_ONLY"  == "0" ]]; then deploy_frontend; fi

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   ADO B2B — Production Deploy Complete            ║${RESET}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  URL        → https://${DOMAIN}   ║${RESET}"
echo -e "${BOLD}║  Backend    → PM2: ${PM2_APP_NAME} (port 5000)     ║${RESET}"
echo -e "${BOLD}║  Webroot    → ${REMOTE_WEBROOT}  ║${RESET}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  Re-deploy backend:  ./deploy.sh --backend-only   ║${RESET}"
echo -e "${BOLD}║  Re-deploy frontend: ./deploy.sh --frontend-only  ║${RESET}"
echo -e "${BOLD}║  Push schema:        ./deploy.sh --schema         ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${RESET}"
