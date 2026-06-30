#!/usr/bin/env bash
# =============================================================================
# ADO B2B — Production Deploy Script
# Domain : b2b.booking.ado-finance.com
# Server : 206.189.130.168  (root)
#
# Usage:
#   ./deploy.sh                      # full deploy (backend + frontend)
#   ./deploy.sh --backend-only       # only backend (PM2)
#   ./deploy.sh --frontend-only      # only frontend (Nginx static)
#   ./deploy.sh --schema             # also run prisma db push
#
# Auth (pick one):
#   1. File   → create server-pass.md at repo root (git-ignored):
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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$REPO_ROOT/airline-b2b/server"
CLIENT_DIR="$REPO_ROOT/airline-b2b/client"
NGINX_CONF_SRC="$REPO_ROOT/nginx.conf.b2b.ado-finance.com"

# ── Flags ────────────────────────────────────────────────────────────────────
BACKEND_ONLY=0; FRONTEND_ONLY=0; RUN_SCHEMA=0; USE_SSH_KEY="${USE_SSH_KEY:-0}"
for arg in "$@"; do
  case $arg in
    --backend-only)  BACKEND_ONLY=1 ;;
    --frontend-only) FRONTEND_ONLY=1 ;;
    --schema)        RUN_SCHEMA=1 ;;
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

info "Target: ${REMOTE_HOST}  domain: ${DOMAIN}"
remote "echo 'SSH OK'" && success "SSH connection OK"

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
  remote "cd '$REMOTE_BACKEND_DIR' && npm ci"
  remote "cd '$REMOTE_BACKEND_DIR' && npx prisma generate"

  if [[ "$RUN_SCHEMA" == "1" ]]; then
    info "Running prisma db push..."
    remote "cd '$REMOTE_BACKEND_DIR' && npx prisma db push --accept-data-loss"
    success "Schema pushed"
  fi

  remote "cd '$REMOTE_BACKEND_DIR' && npm run build"
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
  npm --prefix "$CLIENT_DIR" install --silent
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
