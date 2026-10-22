#!/usr/bin/env bash
# Instala gestion-comercial en una VM Ubuntu o Debian (pensado para la e2-micro gratis de Google Cloud).
# Uso: sudo bash instalar.sh <dominio>      por ejemplo: sudo bash instalar.sh 34-123-45-67.sslip.io
# Se puede volver a correr: no pisa la base ni las variables ya creadas.
set -euo pipefail

DOMINIO="${1:?Uso: sudo bash instalar.sh <dominio>}"
REPO=https://github.com/aaguirrepauldev/gestion-comercial.git
APP_DIR=/opt/gestion-comercial
DATA_DIR=/var/lib/gestion-comercial
ENV_FILE=/etc/gestion-comercial.env

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo." >&2; exit 1; }

echo "==> Swap de 2 GB (con 1 GB de RAM el build de la web se queda sin memoria)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Paquetes: git, Caddy (HTTPS) y Node 24"
apt-get update
apt-get install -y ca-certificates curl git caddy
if ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 24 ? 0 : 1)' 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

echo "==> Usuario y carpetas"
id gestion >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin gestion
mkdir -p "$DATA_DIR"
chown gestion:gestion "$DATA_DIR"
chmod 700 "$DATA_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
fi
chown -R gestion:gestion "$APP_DIR"

echo "==> Variables ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  while true; do
    read -rsp "Contraseña para el usuario admin (mínimo 8 caracteres): " ADMIN_PASSWORD; echo
    [ "${#ADMIN_PASSWORD}" -ge 8 ] && break
    echo "Es muy corta, probá de nuevo."
  done
  # Entre comillas dobles para systemd, escapando \ y ".
  ADMIN_PASSWORD=${ADMIN_PASSWORD//\\/\\\\}
  ADMIN_PASSWORD=${ADMIN_PASSWORD//\"/\\\"}
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  umask 027
  cat > "$ENV_FILE" <<VARS
NODE_ENV=production
PORT=4000
DB_PATH=$DATA_DIR/app.db
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD="$ADMIN_PASSWORD"
VARS
  umask 022
  chown root:gestion "$ENV_FILE"
fi

echo "==> Compilando (tarda unos minutos en la e2-micro)"
sudo -u gestion -H npm run build --prefix "$APP_DIR"

echo "==> Servicio"
cp "$APP_DIR/deploy/gce/gestion-comercial.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable gestion-comercial
systemctl restart gestion-comercial

echo "==> Caddy para https://$DOMINIO"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMINIO {
	reverse_proxy 127.0.0.1:4000
}
CADDY
systemctl enable caddy
systemctl reload-or-restart caddy

sleep 3
if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
  echo "Listo: abrí https://$DOMINIO y entrá con admin (el certificado HTTPS puede tardar un minuto)."
else
  echo "La API no respondió. Mirá los logs con: sudo journalctl -u gestion-comercial -n 50" >&2
  exit 1
fi
