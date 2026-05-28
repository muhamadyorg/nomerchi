#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║   MapVizit — VPS Deploy Script (aaPanel)                ║
# ║   Repo: https://github.com/muhamadyorg/nomerchi          ║
# ╚══════════════════════════════════════════════════════════╝
# Ishlatish: bash deploy.sh

set -euo pipefail

REPO_URL="https://github.com/muhamadyorg/nomerchi.git"

# ── Ranglar ──────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
sep()  { echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Banner ───────────────────────────────────────────────
clear
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   MapVizit — VPS Deploy Script                           ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Root tekshirish ───────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Root huquqi bilan ishga tushiring: sudo bash deploy.sh"
fi

# ── 2. /www/wwwroot tekshirish ───────────────────────────
if [ ! -d /www/wwwroot ]; then
  err "/www/wwwroot topilmadi. aaPanel o'rnatilganligini tekshiring."
fi

# ── 3. Domenlarni ko'rsatish ─────────────────────────────
sep
echo ""
echo -e "${BOLD}  Mavjud domenlar (/www/wwwroot/):${NC}"
echo ""

DOMAINS=()
idx=1
for dir in /www/wwwroot/*/; do
  [ -d "$dir" ] || continue
  dname=$(basename "$dir")
  [[ "$dname" == "default" ]] && continue
  DOMAINS+=("$dname")
  printf "  ${BLUE}%2d${NC}. %s\n" "$idx" "$dname"
  ((idx++)) || true
done

if [ ${#DOMAINS[@]} -eq 0 ]; then
  err "aaPanel da hech qanday domen topilmadi."
fi

echo ""
read -rp "$(echo -e ${BOLD}"Domen raqamini tanlang (1-${#DOMAINS[@]}): "${NC})" DOMAIN_NUM

if ! [[ "$DOMAIN_NUM" =~ ^[0-9]+$ ]] || \
   [ "$DOMAIN_NUM" -lt 1 ] || \
   [ "$DOMAIN_NUM" -gt "${#DOMAINS[@]}" ]; then
  err "Noto'g'ri raqam."
fi

DOMAIN="${DOMAINS[$((DOMAIN_NUM-1))]}"
APP_DIR="/www/wwwroot/$DOMAIN"

echo ""
sep
warn "Tanlangan domen : ${BOLD}$DOMAIN${NC}"
warn "Papka           : $APP_DIR"
echo ""
warn "DIQQAT: $APP_DIR ichidagi BARCHA mavjud fayllar o'chiriladi!"
echo ""
read -rp "$(echo -e ${BOLD}"Davom etasizmi? (ha / yo'q): "${NC})" CONFIRM
[ "$CONFIRM" = "ha" ] || { echo "Bekor qilindi."; exit 0; }
echo ""

# ── 4. Node.js ≥ 20 ──────────────────────────────────────
sep
info "Node.js tekshirilmoqda..."
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -e "console.log(parseInt(process.version.slice(1)))")
  [ "$NODE_VER" -ge 20 ] && NODE_OK=true
fi

if [ "$NODE_OK" = false ]; then
  info "Node.js 20.x LTS o'rnatilmoqda..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    yum install -y nodejs > /dev/null 2>&1
  else
    err "apt-get yoki yum topilmadi. Node.js ni qo'lda o'rnating."
  fi
fi
ok "Node.js $(node --version)"

# ── 5. pnpm ──────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  info "pnpm o'rnatilmoqda..."
  npm install -g pnpm@10 > /dev/null 2>&1
fi
ok "pnpm $(pnpm --version)"

# ── 6. PM2 ───────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "PM2 o'rnatilmoqda..."
  npm install -g pm2 > /dev/null 2>&1
fi
ok "PM2 $(pm2 --version | head -1)"

# ── 7. dotenv (ecosystem uchun) ──────────────────────────
if ! node -e "require('dotenv')" 2>/dev/null; then
  npm install -g dotenv > /dev/null 2>&1
fi

# ── 8. Clone ─────────────────────────────────────────────
sep
info "Eski fayllar o'chirilmoqda: $APP_DIR ..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

info "GitHub'dan clone qilinmoqda..."
git clone "$REPO_URL" "$APP_DIR" --depth 1 2>&1 | grep -E "Cloning|done\." || true
ok "Repo clone qilindi → $APP_DIR"

cd "$APP_DIR"
mkdir -p logs

# ── 9. Muhit o'zgaruvchilari ─────────────────────────────
sep
echo ""
echo -e "${BOLD}  Muhit o'zgaruvchilari (Enter — skip / bo'sh qoldirish)${NC}"
echo ""

prompt_val() {
  local label="$1" default="$2" result=""
  read -rp "$(echo -e "  ${BOLD}${label}${NC} ${BLUE}[${default}]${NC}: ")" result
  echo "${result:-$default}"
}

DB_URL=$(prompt_val "PostgreSQL URL" "postgresql://user:pass@localhost:5432/mapvizit")
SESSION_SEC=$(prompt_val "Session Secret (uzun tasodifiy satr)" "$(openssl rand -hex 32 2>/dev/null || echo 'change-this-secret')")
APP_PORT=$(prompt_val "API Server Port" "8080")
APP_DOMAIN=$(prompt_val "Domeningiz (SSL bilan, masalan: nomerchi.uz)" "")
GOOGLE_CID=$(prompt_val "Google Client ID (ixtiyoriy)" "")
GOOGLE_CSC=$(prompt_val "Google Client Secret (ixtiyoriy)" "")

echo ""
info ".env fayl yaratilmoqda..."

cat > "$APP_DIR/.env" << ENVEOF
# MapVizit — muhit o'zgaruvchilari
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DB_URL
SESSION_SECRET=$SESSION_SEC
APP_DOMAIN=$APP_DOMAIN
ENVEOF

[ -n "$GOOGLE_CID" ] && echo "GOOGLE_CLIENT_ID=$GOOGLE_CID" >> "$APP_DIR/.env"
[ -n "$GOOGLE_CSC" ] && echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CSC" >> "$APP_DIR/.env"

chmod 600 "$APP_DIR/.env"
ok ".env saqlandi (faqat root o'qiy oladi)"

# ── 10. Kutubxonalar ─────────────────────────────────────
sep
info "Kutubxonalar o'rnatilmoqda (biror daqiqa ketishi mumkin)..."
pnpm install --frozen-lockfile 2>&1 | tail -3
ok "Kutubxonalar o'rnatildi"

# ── 11. Database sxemasi ─────────────────────────────────
info "Database sxemasi sinxronlashtirilmoqda..."
export DATABASE_URL="$DB_URL"
if pnpm --filter @workspace/db run push 2>&1 | grep -E "All done|applied|No changes" | tail -3; then
  ok "Database sxemasi tayyor"
else
  warn "Database push da xato bo'lishi mumkin. Qo'lda tekshiring."
fi

# ── 12. Build ────────────────────────────────────────────
sep
info "API server build qilinmoqda..."
export PORT="$APP_PORT"
(cd "$APP_DIR" && pnpm --filter @workspace/api-server run build 2>&1 | tail -3)
ok "API server build → artifacts/api-server/dist/"

info "Frontend build qilinmoqda..."
export BASE_PATH="/"
export NODE_ENV="production"
(cd "$APP_DIR" && pnpm --filter @workspace/mapvizit run build 2>&1 | tail -3)
ok "Frontend build → artifacts/mapvizit/dist/public/"

# ── 13. PM2 bilan ishga tushirish ────────────────────────
sep
info "PM2 bilan API server ishga tushirilmoqda..."
pm2 delete mapvizit-api 2>/dev/null || true

(cd "$APP_DIR" && pm2 start ecosystem.config.cjs 2>&1 | tail -3)
pm2 save > /dev/null 2>&1

# Autostart
STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo env" | head -1)
[ -n "$STARTUP_CMD" ] && { info "Autostart uchun:"; echo "  $STARTUP_CMD"; }

ok "API server PM2 da ishlamoqda (port $APP_PORT)"

# ── 14. Nginx konfiguratsiyasi ───────────────────────────
sep
FRONTEND_DIST="$APP_DIR/artifacts/mapvizit/dist/public"
echo ""
echo -e "${BOLD}  Nginx konfiguratsiyasi (aaPanel → $DOMAIN → Konfiguratsiya)${NC}"
echo ""
echo -e "${YELLOW}  'Website Root Directory' ni o'zgartiring:${NC}"
echo -e "  $FRONTEND_DIST"
echo ""
echo -e "${YELLOW}  'Nginx Config' ning server{} blokiga qo'shing:${NC}"
echo ""
cat << NGINXEOF
    # API — Node.js ga proxy
    location /api {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 20M;
    }

    # Frontend — React SPA
    root $FRONTEND_DIST;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
NGINXEOF

# Agar APP_DOMAIN berilsa, nginx config faylini yaratish
if [ -n "$APP_DOMAIN" ]; then
  NGINX_CONF_PATH="/www/server/nginx/conf/vhost/$APP_DOMAIN.conf"
  if [ -f "$NGINX_CONF_PATH" ]; then
    info "aaPanel nginx config topildi: $NGINX_CONF_PATH"
    warn "Yuqoridagi bloklarni qo'lda qo'shing yoki 'sed' bilan"
  fi
fi

# ── 15. Yakuniy natija ───────────────────────────────────
sep
echo ""
echo -e "${GREEN}${BOLD}  ✅ Deploy muvaffaqiyatli tugadi!${NC}"
echo ""
echo -e "  ${BOLD}Domen          :${NC} ${APP_DOMAIN:-http://localhost}"
echo -e "  ${BOLD}Frontend dist  :${NC} $FRONTEND_DIST"
echo -e "  ${BOLD}API port       :${NC} $APP_PORT"
echo ""
echo -e "  ${BOLD}Foydali buyruqlar:${NC}"
echo "    pm2 status              — jarayonlar holati"
echo "    pm2 logs mapvizit-api   — server loglar"
echo "    pm2 restart mapvizit-api — restart"
echo ""
echo -e "  ${BOLD}Yangilash (update):${NC}"
echo "    cd $APP_DIR && git pull && pnpm install && \\"
echo "    pnpm --filter @workspace/api-server run build && \\"
echo "    BASE_PATH=/ pnpm --filter @workspace/mapvizit run build && \\"
echo "    pm2 restart mapvizit-api"
echo ""
sep
echo ""

# ── Test ─────────────────────────────────────────────────
sleep 2
if curl -sf "http://127.0.0.1:$APP_PORT/api/healthz" > /dev/null 2>&1; then
  ok "API server javob bermoqda: http://127.0.0.1:$APP_PORT/api/healthz"
else
  warn "API server hali javob bermayapti. Bir daqiqa kuting va tekshiring:"
  echo "    curl http://127.0.0.1:$APP_PORT/api/healthz"
  echo "    pm2 logs mapvizit-api"
fi
echo ""
