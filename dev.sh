#!/usr/bin/env bash
# =============================================================================
# ADO B2B — Local Development Deploy Script
# Usage: ./dev.sh [--stop]
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$REPO_ROOT/airline-b2b/server"
CLIENT_DIR="$REPO_ROOT/airline-b2b/client"
LOG_DIR="$REPO_ROOT/.dev-logs"
PID_FILE="$REPO_ROOT/.dev-pids"

BACKEND_PORT=5000
FRONTEND_PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=airline_db
DB_USER=postgres
DB_PASS=change-me-strong-password

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Stop mode ────────────────────────────────────────────────────────────────
stop_servers() {
  header "Stopping ADO B2B servers..."
  if [[ -f "$PID_FILE" ]]; then
    while IFS= read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" && info "Stopped PID $pid"
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
    success "All servers stopped."
  else
    warn "No PID file found — nothing to stop."
  fi
  exit 0
}

[[ "${1:-}" == "--stop" ]] && stop_servers

# ── Helper: check command exists ─────────────────────────────────────────────
require() {
  command -v "$1" &>/dev/null || { error "Required tool not found: $1"; exit 1; }
}
require node
require npm
require psql

mkdir -p "$LOG_DIR"
> "$PID_FILE"   # reset PID file

# ─────────────────────────────────────────────────────────────────────────────
header "1 / 5  — Branch check"
# ─────────────────────────────────────────────────────────────────────────────
cd "$REPO_ROOT"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
NEEDED_COMMIT="37bf781"   # tip of origin/main that has the full schema

# If we're in detached HEAD pointing at origin/main already — that's fine.
# Otherwise warn; but don't fail: user may be on a custom branch intentionally.
if ! git merge-base --is-ancestor "$NEEDED_COMMIT" HEAD 2>/dev/null; then
  warn "Current commit does not include the full schema (origin/main)."
  warn "Run:  git checkout origin/main"
  warn "Continuing anyway — TypeScript errors may occur."
else
  success "Branch OK (${CURRENT_BRANCH})"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "2 / 5  — Database check"
# ─────────────────────────────────────────────────────────────────────────────
pg_isready -h "$DB_HOST" -p "$DB_PORT" -q || {
  error "PostgreSQL is not running on ${DB_HOST}:${DB_PORT}"
  exit 1
}
success "PostgreSQL is up on ${DB_HOST}:${DB_PORT}"

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" -tA 2>/dev/null | grep -q 1 || {
  info "Creating database '${DB_NAME}'..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE \"${DB_NAME}\";" 2>/dev/null
}
success "Database '${DB_NAME}' exists"

# ─────────────────────────────────────────────────────────────────────────────
header "3 / 5  — Writing environment files"
# ─────────────────────────────────────────────────────────────────────────────

# -- Server .env --------------------------------------------------------------
SERVER_ENV="$SERVER_DIR/.env"
info "Writing ${SERVER_ENV}"
cat > "$SERVER_ENV" <<ENV
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
JWT_SECRET="local-development-secret-key-12345"
PUBLIC_WEB_ORIGIN="http://localhost:${FRONTEND_PORT}"
CORS_ORIGINS="http://localhost:${FRONTEND_PORT}"
PORT=${BACKEND_PORT}
ENV
success "Server .env written"

# -- Client .env.local --------------------------------------------------------
CLIENT_ENV="$CLIENT_DIR/.env.local"
info "Writing ${CLIENT_ENV}"
cat > "$CLIENT_ENV" <<ENV
NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}
ENV
success "Client .env.local written"

# ─────────────────────────────────────────────────────────────────────────────
header "4 / 5  — Install dependencies & migrate DB"
# ─────────────────────────────────────────────────────────────────────────────

# Server deps
if [[ ! -d "$SERVER_DIR/node_modules" ]]; then
  info "Installing server dependencies..."
  npm install --prefix "$SERVER_DIR" --silent
else
  info "Server node_modules present — skipping install (run 'npm install' manually to refresh)"
fi

# Prisma generate & push
info "Generating Prisma client..."
cd "$SERVER_DIR"
npx prisma generate --schema=prisma/schema.prisma 2>&1 | tail -n 3

info "Pushing Prisma schema to database..."
npx prisma db push --schema=prisma/schema.prisma --accept-data-loss 2>&1 | tail -n 5
success "Database schema up-to-date"

# Client deps
cd "$REPO_ROOT"
if [[ ! -d "$CLIENT_DIR/node_modules" ]]; then
  info "Installing client dependencies..."
  npm install --prefix "$CLIENT_DIR" --silent
else
  info "Client node_modules present — skipping install"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "5 / 5  — Starting servers"
# ─────────────────────────────────────────────────────────────────────────────

# Kill anything already on these ports (gracefully)
for port in $BACKEND_PORT $FRONTEND_PORT; do
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    warn "Port ${port} in use by PID ${pid} — killing..."
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
done

# Start backend
info "Starting backend server on port ${BACKEND_PORT}..."
nohup npm run start:dev --prefix "$SERVER_DIR" \
  > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" >> "$PID_FILE"
success "Backend PID ${BACKEND_PID} → logs: ${LOG_DIR}/backend.log"

# Wait until backend is accepting connections (max 20s)
info "Waiting for backend to become ready..."
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BACKEND_PORT}/flights" 2>/dev/null | grep -qE "^(401|200)$"; then
    success "Backend is up!"
    break
  fi
  sleep 1
done

# Start frontend
info "Starting frontend on port ${FRONTEND_PORT}..."
nohup npm run dev --prefix "$CLIENT_DIR" \
  > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"
success "Frontend PID ${FRONTEND_PID} → logs: ${LOG_DIR}/frontend.log"

# Wait until frontend responds (max 20s)
info "Waiting for frontend to become ready..."
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT}" 2>/dev/null | grep -qE "^(200|307)$"; then
    success "Frontend is up!"
    break
  fi
  sleep 1
done

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       ADO B2B — Local Dev Running            ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  Frontend  →  http://localhost:${FRONTEND_PORT}          ║${RESET}"
echo -e "${BOLD}║  Backend   →  http://localhost:${BACKEND_PORT}          ║${RESET}"
echo -e "${BOLD}║  DB        →  ${DB_HOST}:${DB_PORT}/${DB_NAME}  ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  Admin     →  admin@airline.com              ║${RESET}"
echo -e "${BOLD}║  Password  →  superadmin123                  ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  Backend log:  .dev-logs/backend.log         ║${RESET}"
echo -e "${BOLD}║  Frontend log: .dev-logs/frontend.log        ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  To stop:  ./dev.sh --stop                   ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
