#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║   MapVizit — Smart Deploy Script (aaPanel / Ubuntu / CentOS) ║
# ║   Repo: https://github.com/muhamadyorg/nomerchi              ║
# ╚══════════════════════════════════════════════════════════════╝
# Ishlatish: sudo bash deploy.sh

set -Eeo pipefail
trap 'err "Qator $LINENO da xato yuz berdi. Jarayon to'\''xtatildi."' ERR

REPO_URL="https://github.com/muhamadyorg/nomerchi.git"
NODE_MIN=20
API_DEFAULT_PORT=8080

# ── Ranglar ──────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m'
B='\033[0;34m' W='\033[1m' N='\033[0m'

ok()   { echo -e "${G}[✓]${N} $1"; }
warn() { echo -e "${Y}[!]${N} $1"; }
err()  { echo -e "${R}[✗]${N} $*"; exit 1; }
info() { echo -e "${B}[→]${N} $1"; }
sep()  { echo -e "${W}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"; }
ask()  { read -rp "$(echo -e "${W}  $1:${N} ")" "$2"; }

banner() {
  clear
  echo ""
  echo -e "${W}╔══════════════════════════════════════════════════════════════╗${N}"
  echo -e "${W}║   MapVizit — Smart Deploy (aaPanel)                          ║${N}"
  echo -e "${W}╚══════════════════════════════════════════════════════════════╝${N}"
  echo ""
}

# ════════════════════════════════════════════════════════════════
# 1. ROOT TEKSHIRISH
# ════════════════════════════════════════════════════════════════
banner
[ "$EUID" -ne 0 ] && err "Root sifatida ishga tushiring: sudo bash deploy.sh"
ok "Root huquqi mavjud"

# ════════════════════════════════════════════════════════════════
# 2. DOMAIN TANLASH
# ════════════════════════════════════════════════════════════════
sep
echo ""
if [ ! -d /www/wwwroot ]; then
  err "/www/wwwroot topilmadi. aaPanel o'rnatilganligini tekshiring."
fi

echo -e "${W}  Mavjud domenlar:${N}"
echo ""
DOMAINS=()
idx=1
for dir in /www/wwwroot/*/; do
  [ -d "$dir" ] || continue
  dname=$(basename "$dir")
  [[ "$dname" == "default" ]] && continue
  DOMAINS+=("$dname")
  if [ -f "$dir/.env" ] || [ -d "$dir/artifacts" ]; then
    printf "  ${B}%2d${N}. %s ${Y}[allaqachon o'rnatilgan]${N}\n" "$idx" "$dname"
  else
    printf "  ${B}%2d${N}. %s\n" "$idx" "$dname"
  fi
  ((idx++)) || true
done

[ ${#DOMAINS[@]} -eq 0 ] && err "aaPanel da hech qanday domen topilmadi. Avval aaPanel panelida domen qo'shing."

echo ""
ask "Domen raqamini tanlang (1–${#DOMAINS[@]})" DOMAIN_NUM
[[ "$DOMAIN_NUM" =~ ^[0-9]+$ ]] && [ "$DOMAIN_NUM" -ge 1 ] && [ "$DOMAIN_NUM" -le "${#DOMAINS[@]}" ] \
  || err "Noto'g'ri raqam: $DOMAIN_NUM"

DOMAIN="${DOMAINS[$((DOMAIN_NUM-1))]}"
APP_DIR="/www/wwwroot/$DOMAIN"
FRONTEND_DIST="$APP_DIR/artifacts/mapvizit/dist/public"

echo ""
ok "Tanlangan: ${W}$DOMAIN${N} ($APP_DIR)"

# ════════════════════════════════════════════════════════════════
# 3. REJIM: YANGI yoki YANGILASH
# ════════════════════════════════════════════════════════════════
MODE="fresh"
if [ -f "$APP_DIR/.env" ] && [ -d "$APP_DIR/artifacts" ]; then
  sep
  echo ""
  warn "Bu domen allaqachon deploy qilingan!"
  echo ""
  echo -e "  ${B}1${N}. Kodni yangilash (pull + build + restart)"
  echo -e "  ${B}2${N}. Nginx konfiguratsiyasini tuzatish"
  echo -e "  ${B}3${N}. To'liq qayta o'rnatish (hamma narsa o'chiriladi)"
  echo -e "  ${B}4${N}. Chiqish"
  echo ""
  ask "Tanlov" MODE_NUM
  case "$MODE_NUM" in
    1) MODE="update" ;;
    2) MODE="nginx_only" ;;
    3) MODE="fresh" ;;
    4) echo "Chiqildi."; exit 0 ;;
    *) err "Noto'g'ri tanlov" ;;
  esac
fi

# ════════════════════════════════════════════════════════════════
# 4. TOOLS: Node.js, pnpm, PM2
# ════════════════════════════════════════════════════════════════
if [ "$MODE" != "nginx_only" ]; then
  sep
  info "Zarur dasturlar tekshirilmoqda..."

  # Node.js
  NODE_OK=false
  if command -v node &>/dev/null; then
    NVER=$(node -e "console.log(parseInt(process.version.slice(1)))" 2>/dev/null || echo 0)
    [ "$NVER" -ge "$NODE_MIN" ] && NODE_OK=true
  fi
  if [ "$NODE_OK" = false ]; then
    info "Node.js $NODE_MIN.x o'rnatilmoqda..."
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
      apt-get install -y nodejs >/dev/null 2>&1
    elif command -v yum &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
      yum install -y nodejs >/dev/null 2>&1
    else
      err "Paket menejeri topilmadi (apt/yum). Node.js ni qo'lda o'rnating."
    fi
  fi
  ok "Node.js $(node --version)"

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    info "pnpm o'rnatilmoqda..."; npm install -g pnpm@10 >/dev/null 2>&1
  fi
  ok "pnpm $(pnpm --version)"

  # PM2
  if ! command -v pm2 &>/dev/null; then
    info "PM2 o'rnatilmoqda..."; npm install -g pm2 >/dev/null 2>&1
  fi
  ok "PM2 $(pm2 --version 2>/dev/null | head -1)"
fi

# ════════════════════════════════════════════════════════════════
# 5. KOD: CLONE yoki PULL
# ════════════════════════════════════════════════════════════════
if [ "$MODE" = "fresh" ]; then
  sep
  echo ""
  warn "DIQQAT: $APP_DIR ichidagi barcha fayllar o'chiriladi!"
  ask "Davom etasizmi? (ha / yo'q)" CONFIRM
  [ "$CONFIRM" = "ha" ] || { echo "Bekor qilindi."; exit 0; }

  info "Eski fayllar o'chirilmoqda..."
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  info "GitHub'dan clone qilinmoqda..."
  git clone "$REPO_URL" "$APP_DIR" --depth 1 2>&1 | grep -E "Cloning|done\." || true
  mkdir -p "$APP_DIR/logs"
  ok "Kod clone qilindi"

elif [ "$MODE" = "update" ]; then
  sep
  info "Yangi kod yuklanmoqda (git pull)..."
  cd "$APP_DIR"
  git fetch origin main 2>&1 | tail -3
  git reset --hard origin/main 2>&1 | tail -2
  ok "Kod yangilandi"
fi

# ════════════════════════════════════════════════════════════════
# 6. .ENV FAYL
# ════════════════════════════════════════════════════════════════
if [ "$MODE" = "fresh" ] || [ ! -f "$APP_DIR/.env" ]; then
  sep
  echo ""
  echo -e "${W}  Muhit sozlamalari (Enter — bo'sh qoldirish mumkin)${N}"
  echo ""

  # API port
  ask "API server port [8080]" API_PORT
  API_PORT="${API_PORT:-8080}"

  # PostgreSQL
  echo ""
  info "PostgreSQL sozlanmoqda..."
  
  # Avtomat DB yaratish
  DB_USER="mapvizit"
  DB_NAME="mapvizit"
  DB_PASS=""
  DB_URL=""
  
  # pg_isready bilan postgresql tekshirish
  if command -v psql &>/dev/null; then
    # PostgreSQL mavjud — avtomat sozlash
    PG_SUPERUSER=""
    for u in postgres www root; do
      if su - "$u" -c "psql -c '\\q'" 2>/dev/null; then
        PG_SUPERUSER="$u"; break
      fi
    done

    if [ -n "$PG_SUPERUSER" ]; then
      info "PostgreSQL topildi (superuser: $PG_SUPERUSER)"
      DB_PASS=$(openssl rand -hex 16 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)

      # User mavjudmi tekshirish
      USER_EXISTS=$(su - "$PG_SUPERUSER" -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" 2>/dev/null || echo "")
      if [ "$USER_EXISTS" != "1" ]; then
        su - "$PG_SUPERUSER" -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\"" >/dev/null 2>&1
        ok "PostgreSQL user yaratildi: $DB_USER"
      else
        su - "$PG_SUPERUSER" -c "psql -c \"ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';\"" >/dev/null 2>&1
        ok "PostgreSQL user mavjud: $DB_USER (parol yangilandi)"
      fi

      # DB mavjudmi tekshirish
      DB_EXISTS=$(su - "$PG_SUPERUSER" -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" 2>/dev/null || echo "")
      if [ "$DB_EXISTS" != "1" ]; then
        su - "$PG_SUPERUSER" -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" >/dev/null 2>&1
        ok "PostgreSQL database yaratildi: $DB_NAME"
      else
        su - "$PG_SUPERUSER" -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;\"" >/dev/null 2>&1
        ok "PostgreSQL database mavjud: $DB_NAME"
      fi

      DB_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
      ok "Database URL: postgresql://$DB_USER:***@localhost:5432/$DB_NAME"
    else
      warn "PostgreSQL superuser topilmadi. DB URL ni qo'lda kiriting."
      ask "PostgreSQL URL (postgresql://user:pass@localhost:5432/db)" DB_URL
    fi
  else
    warn "PostgreSQL o'rnatilmagan yoki psql topilmadi."
    ask "PostgreSQL URL (postgresql://user:pass@localhost:5432/db)" DB_URL
    [ -z "$DB_URL" ] && err "Database URL kerak!"
  fi

  # Session Secret
  SESSION_SEC=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)

  # Domain — tepada tanlangan domenni avtomatik ishlatamiz
  APP_DOMAIN_INPUT="$DOMAIN"
  ok "Domen: $APP_DOMAIN_INPUT (yuqorida tanlanganidan)"

  # Google Drive (ixtiyoriy)
  echo ""
  echo -e "  ${Y}Google Drive (ixtiyoriy — Enter bilan o'tkazib yuborishingiz mumkin):${N}"
  ask "Google Client ID" GOOGLE_CID
  ask "Google Client Secret" GOOGLE_CSC

  # .env yozish
  cat > "$APP_DIR/.env" << ENVEOF
NODE_ENV=production
PORT=$API_PORT
DATABASE_URL=$DB_URL
SESSION_SECRET=$SESSION_SEC
APP_DOMAIN=$APP_DOMAIN_INPUT
ENVEOF
  [ -n "$GOOGLE_CID" ] && echo "GOOGLE_CLIENT_ID=$GOOGLE_CID"   >> "$APP_DIR/.env"
  [ -n "$GOOGLE_CSC" ] && echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CSC" >> "$APP_DIR/.env"

  chmod 600 "$APP_DIR/.env"
  ok ".env fayl yaratildi va himoyalandi"

else
  # .env mavjud — portni o'qib olamiz
  source "$APP_DIR/.env" 2>/dev/null || true
  API_PORT="${PORT:-8080}"
  DB_URL="${DATABASE_URL:-}"
  ok ".env fayl topildi va o'qildi (port: $API_PORT)"
fi

cd "$APP_DIR"

# ════════════════════════════════════════════════════════════════
# 7. KUTUBXONALAR O'RNATISH
# ════════════════════════════════════════════════════════════════
if [ "$MODE" != "nginx_only" ]; then
  sep
  info "Kutubxonalar o'rnatilmoqda..."
  pnpm install --no-frozen-lockfile 2>&1 | tail -3
  ok "Kutubxonalar tayyor"
fi

# ════════════════════════════════════════════════════════════════
# 8. DATABASE SCHEMA
# ════════════════════════════════════════════════════════════════
if [ "$MODE" != "nginx_only" ] && [ -n "${DB_URL:-}" ]; then
  sep
  info "Database sxemasi sinxronlashtirilmoqda..."
  export DATABASE_URL="$DB_URL"
  pnpm --filter @workspace/db run push 2>&1 | tail -5 || \
    warn "DB push da muammo bo'lishi mumkin. Keyinroq tekshiring: pnpm --filter @workspace/db run push"
  ok "Database sxemasi tayyor"

  # Sudo foydalanuvchi yaratish
  info "Sudo foydalanuvchi tekshirilmoqda..."
  DATABASE_URL="$DB_URL" node "$APP_DIR/scripts/src/seed.mjs" 2>&1 | sed 's/^/  /'
fi

# ════════════════════════════════════════════════════════════════
# 9. BUILD
# ════════════════════════════════════════════════════════════════
if [ "$MODE" != "nginx_only" ]; then
  sep
  source "$APP_DIR/.env" 2>/dev/null || true
  API_PORT="${PORT:-8080}"

  info "API server build qilinmoqda..."
  (cd "$APP_DIR" && PORT="$API_PORT" pnpm --filter @workspace/api-server run build 2>&1 | tail -4)
  ok "API server build → artifacts/api-server/dist/"

  info "Frontend build qilinmoqda..."
  (cd "$APP_DIR" && PORT="$API_PORT" BASE_PATH="/" NODE_ENV=production pnpm --filter @workspace/mapvizit run build 2>&1 | tail -4)
  ok "Frontend build → $FRONTEND_DIST"
fi

# ════════════════════════════════════════════════════════════════
# 10. FAYL HUQUQLARI
# ════════════════════════════════════════════════════════════════
sep
info "Fayl huquqlari to'g'irlanmoqda..."

# nginx foydalanuvchisini aniqlash
NGINX_USER="www-data"
for u in nginx www-data nobody http; do
  id "$u" &>/dev/null && { NGINX_USER="$u"; break; }
done

# Frontend dist
if [ -d "$FRONTEND_DIST" ]; then
  find "$FRONTEND_DIST" -type d -exec chmod 755 {} \;
  find "$FRONTEND_DIST" -type f -exec chmod 644 {} \;
  chown -R "$NGINX_USER:$NGINX_USER" "$FRONTEND_DIST" 2>/dev/null || chown -R root:root "$FRONTEND_DIST"
  ok "Frontend fayl huquqlari: $NGINX_USER (755/644)"
fi

# Uploads papkasi
mkdir -p "$APP_DIR/artifacts/api-server/uploads"
chmod 755 "$APP_DIR/artifacts/api-server/uploads"
chown -R root:root "$APP_DIR/artifacts/api-server/uploads"

# logs papkasi
mkdir -p "$APP_DIR/logs"
chmod 755 "$APP_DIR/logs"

ok "Huquqlar to'g'irlandi"

# ════════════════════════════════════════════════════════════════
# 11. PM2
# ════════════════════════════════════════════════════════════════
if [ "$MODE" != "nginx_only" ]; then
  sep
  source "$APP_DIR/.env" 2>/dev/null || true
  API_PORT="${PORT:-8080}"

  info "PM2 bilan API server ishga tushirilmoqda (port $API_PORT)..."
  pm2 delete mapvizit-api 2>/dev/null || true

  # env varlarni to'g'ridan-to'g'ri berish
  set -a; source "$APP_DIR/.env"; set +a
  pm2 start "$APP_DIR/artifacts/api-server/dist/index.mjs" \
    --name "mapvizit-api" \
    --cwd "$APP_DIR" \
    2>&1 | tail -4

  pm2 save >/dev/null 2>&1
  ok "PM2 ishlamoqda: mapvizit-api (port $API_PORT)"

  # PM2 versiyasini yangilaymiz (in-memory mismatch)
  pm2 update >/dev/null 2>&1 || true

  # Tizim yuklanganda avtomatik ishga tushirish
  STARTUP_CMD=$(pm2 startup 2>/dev/null | grep "sudo env\|sudo systemctl" | head -1 || true)
  if [ -n "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD" >/dev/null 2>&1 && ok "PM2 autostart yoqildi" || true
  else
    ok "PM2 autostart (allaqachon yoqilgan yoki qo'lda sozlash kerak)"
  fi
fi

# ════════════════════════════════════════════════════════════════
# 12. NGINX KONFIGURATSIYA
# ════════════════════════════════════════════════════════════════
sep
source "$APP_DIR/.env" 2>/dev/null || true
API_PORT="${PORT:-8080}"

# ── PM2 jarayoni ishlamatyaptimi? Nginx_only va update modlarida ham tekshiramiz
if [ "$MODE" != "fresh" ] && command -v pm2 &>/dev/null; then
  PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
    try {
      const list = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const p = list.find(x => x.name === 'mapvizit-api');
      console.log(p ? p.pm2_env?.status : 'not_found');
    } catch { console.log('error'); }
  " 2>/dev/null || echo "error")

  if [ "$PM2_STATUS" != "online" ]; then
    info "mapvizit-api PM2 da topilmadi yoki o'chgan — ishga tushirilmoqda..."
    set -a; source "$APP_DIR/.env"; set +a
    pm2 delete mapvizit-api 2>/dev/null || true
    if [ -f "$APP_DIR/artifacts/api-server/dist/index.mjs" ]; then
      pm2 start "$APP_DIR/artifacts/api-server/dist/index.mjs" \
        --name "mapvizit-api" --cwd "$APP_DIR" 2>&1 | tail -3
      pm2 save >/dev/null 2>&1
      ok "mapvizit-api qayta ishga tushirildi (port $API_PORT)"
    else
      warn "Build topilmadi. Avval 'To'liq qayta o'rnatish' ni tanlang."
    fi
  else
    ok "mapvizit-api PM2 da online (port $API_PORT)"
  fi
fi

info "Nginx konfiguratsiyasi topilmoqda..."

# Nginx config joylari (aaPanel + standart)
NGINX_CONF=""
POSSIBLE_PATHS=(
  "/www/server/nginx/conf/vhost/$DOMAIN.conf"
  "/www/server/panel/vhost/nginx/$DOMAIN.conf"
  "/www/server/panel/vhost/nginx/${DOMAIN}.conf"
  "/etc/nginx/sites-available/$DOMAIN"
  "/etc/nginx/sites-available/$DOMAIN.conf"
  "/etc/nginx/conf.d/$DOMAIN.conf"
  "/etc/nginx/conf.d/${DOMAIN}.conf"
)
for p in "${POSSIBLE_PATHS[@]}"; do
  [ -f "$p" ] && { NGINX_CONF="$p"; break; }
done

# Topilmasa — find bilan qidirish
if [ -z "$NGINX_CONF" ]; then
  NGINX_CONF=$(find /www/server /etc/nginx -name "${DOMAIN}.conf" 2>/dev/null | head -1 || true)
fi

if [ -z "$NGINX_CONF" ]; then
  warn "Nginx vhost config topilmadi. Quyidagi nginx config ni qo'lda qo'shing:"
  show_manual=true
else
  info "Nginx config: $NGINX_CONF"
  # Backup
  cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  ok "Backup saqlandi: ${NGINX_CONF}.bak.*"

  # Python3 bilan xavfsiz o'zgartirish
  if command -v python3 &>/dev/null; then
    python3 << PYEOF
import re, sys

conf_path = "$NGINX_CONF"
frontend  = "$FRONTEND_DIST"
api_port  = "$API_PORT"

with open(conf_path, 'r') as f:
    content = f.read()

# 1. Eski MapVizit bloklarini olib tashlaymiz
content = re.sub(r'[ \t]*# MapVizit Begin.*?# MapVizit End\n?', '', content, flags=re.DOTALL)

# 2. root ni o'zgartiramiz (SSL ga tegmaymiz)
content = re.sub(r'root\s+[^;]+;', f'root {frontend};', content, count=1)

# 3. index ni to'g'irlaymiz
content = re.sub(r'index\s+[^;]+;', 'index index.html;', content, count=1)

# 4. FAQAT bizning bloklarimizni olib tashlaymiz
# location /api — hammasini (bizniki)
content = re.sub(r'[ \t]*location\s+/api\b[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)?\}[ \t]*\n?', '', content, flags=re.DOTALL)
# location / — FAQAT try_files bo'lganlari (SSL redirect ni saqlab qo'yamiz!)
content = re.sub(r'[ \t]*location\s+/\s*\{[^}]*try_files[^}]*\}[ \t]*\n?', '', content, flags=re.DOTALL)

# 5. Yangi location bloklarini oxirgi } dan oldin qo'shamiz
mapvizit_block = f"""
    # MapVizit Begin
    location /api {{
        proxy_pass         http://127.0.0.1:{api_port};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 20M;
    }}

    location / {{
        try_files \$uri \$uri/ /index.html;
    }}
    # MapVizit End
"""

# Oxirgi } ni topib, undan oldin qo'shamiz
last_brace = content.rfind('}')
if last_brace != -1:
    content = content[:last_brace] + mapvizit_block + '\n}'
else:
    content += mapvizit_block

with open(conf_path, 'w') as f:
    f.write(content)

print("Nginx config muvaffaqiyatli yangilandi")
PYEOF
    ok "Nginx config yangilandi"
  else
    warn "python3 topilmadi. Nginx config ni qo'lda o'zgartiring."
    show_manual=true
  fi

  # aaPanel nginx binary joyi (standart nginx + aaPanel)
  NGINX_BIN="nginx"
  for nb in nginx /www/server/nginx/sbin/nginx /usr/sbin/nginx /usr/local/nginx/sbin/nginx; do
    if command -v "$nb" &>/dev/null || [ -x "$nb" ]; then
      NGINX_BIN="$nb"; break
    fi
  done

  # Nginx test va reload
  if "$NGINX_BIN" -t 2>/dev/null; then
    "$NGINX_BIN" -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
    ok "Nginx qayta ishga tushirildi"
  else
    warn "Nginx config xatoligi bor! Backup tiklayapman..."
    cp "${NGINX_CONF}.bak."* "$NGINX_CONF" 2>/dev/null || true
    "$NGINX_BIN" -s reload 2>/dev/null || true
    warn "Backup tiklandi. Nginx config ni qo'lda to'g'irlang."
    show_manual=true
  fi
fi

# Qo'lda konfiguratsiya ko'rsatish (zarur bo'lsa)
if [ "${show_manual:-false}" = "true" ]; then
  echo ""
  echo -e "${Y}  Nginx vhost config ga quyidagilrni qo'shing:${N}"
  echo ""
  cat << NGINXEOF
    root $FRONTEND_DIST;
    index index.html;

    # MapVizit Begin
    location /api {
        proxy_pass         http://127.0.0.1:$API_PORT;
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

    location / {
        try_files \$uri \$uri/ /index.html;
    }
    # MapVizit End
NGINXEOF
fi

# ════════════════════════════════════════════════════════════════
# 13. TEST
# ════════════════════════════════════════════════════════════════
sep
info "API server tekshirilmoqda..."
sleep 3
API_OK=false
for i in 1 2 3 4 5; do
  if curl -sf "http://127.0.0.1:$API_PORT/api/healthz" >/dev/null 2>&1; then
    API_OK=true; break
  fi
  sleep 2
done

[ -f "$FRONTEND_DIST/index.html" ] && ok "Frontend: index.html mavjud" \
  || warn "Frontend: index.html topilmadi ($FRONTEND_DIST)"

if [ "$API_OK" = true ]; then
  ok "API server: http://127.0.0.1:$API_PORT/api/healthz ✓"
else
  warn "API server javob bermayapti. Logni tekshiring:"
  echo "    pm2 logs mapvizit-api --lines 20"
fi

# ════════════════════════════════════════════════════════════════
# 14. YAKUNIY HISOBOT
# ════════════════════════════════════════════════════════════════
sep
echo ""
if [ "$MODE" = "update" ]; then
  echo -e "${G}${W}  ✅ Yangilash muvaffaqiyatli tugadi!${N}"
elif [ "$MODE" = "nginx_only" ]; then
  echo -e "${G}${W}  ✅ Nginx tuzatildi!${N}"
else
  echo -e "${G}${W}  ✅ Deploy muvaffaqiyatli tugadi!${N}"
fi
echo ""
echo -e "  ${W}Domen      :${N} https://$DOMAIN"
echo -e "  ${W}Frontend   :${N} $FRONTEND_DIST"
echo -e "  ${W}API port   :${N} $API_PORT"
echo -e "  ${W}Nginx user :${N} $NGINX_USER"
echo ""
echo -e "  ${W}Foydali buyruqlar:${N}"
echo "    pm2 status                  — jarayonlar holati"
echo "    pm2 logs mapvizit-api       — server loglar"
echo "    pm2 restart mapvizit-api    — restart"
echo "    nginx -t && nginx -s reload — nginx qayta yuklash"
echo ""
echo -e "  ${W}Keyingi yangilash uchun:${N}"
echo "    sudo bash /www/wwwroot/$DOMAIN/deploy.sh"
echo "    → '1. Kodni yangilash' ni tanlang"
echo ""
sep
echo ""
