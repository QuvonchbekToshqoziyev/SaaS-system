#!/bin/bash
# ============================================================
# SaaS Backend Deploy Script for Ubuntu Server
# Server IP: 206.189.130.168
# Domain: api.quvonchbek.me → backend API
#         quvonchbek.me     → frontend (GitHub Pages)
# ============================================================
set -e

echo "═══════════════════════════════════════════"
echo "  SaaS Backend - Ubuntu Server Setup"
echo "═══════════════════════════════════════════"

# 1. System update & dependencies
echo ""
echo "▸ [1/7] Installing system dependencies..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx

# Node.js 20
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "  Node.js: $(node -v)"

# PM2
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

# PostgreSQL
if ! command -v psql &> /dev/null; then
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
fi

# 2. PostgreSQL setup
echo ""
echo "▸ [2/7] Setting up PostgreSQL..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='aniq_hisob'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE aniq_hisob;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '1111';"
echo "  Database: aniq_hisob ✓"

# 3. Clone or pull the repo
echo ""
echo "▸ [3/7] Fetching code..."
APP_DIR="/home/saas"
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR" && git pull origin main
else
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    git clone https://github.com/QuvonchbekToshqoziyev/SaaS-system.git "$APP_DIR"
fi
cd "$APP_DIR"

# 4. Backend build
echo ""
echo "▸ [4/7] Building backend..."
cd backend

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "  Created .env from .env.example"
    echo "  ⚠  Edit /home/saas/backend/.env with your real secrets!"
fi

npm install --production=false
npm run build
echo "  Backend built ✓"

# 5. Seed database
echo ""
echo "▸ [5/7] Seeding database..."
npx ts-node src/seed.ts
cd ..

# 6. Start with PM2
echo ""
echo "▸ [6/7] Starting backend with PM2..."
pm2 delete saas-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Auto-start on reboot
pm2 startup systemd -u $USER --hp /home/$USER 2>/dev/null || true
echo "  PM2 running ✓"

# 7. Nginx setup
echo ""
echo "▸ [7/7] Configuring Nginx..."
sudo cp nginx.conf.example /etc/nginx/sites-available/saas-api
sudo ln -sf /etc/nginx/sites-available/saas-api /etc/nginx/sites-enabled/saas-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
echo "  Nginx configured ✓"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ Backend deployed!"
echo "═══════════════════════════════════════════"
echo ""
echo "  API:      http://206.189.130.168 (or http://api.quvonchbek.me once DNS is set)"
echo "  Frontend: https://quvonchbek.me (GitHub Pages)"
echo ""
echo "  Next steps:"
echo "  1. Add DNS A record: api.quvonchbek.me → 206.189.130.168"
echo "  2. Run: sudo certbot --nginx -d api.quvonchbek.me"
echo "  3. Edit /home/saas/backend/.env with real secrets"
echo "  4. pm2 restart saas-backend"
echo ""
