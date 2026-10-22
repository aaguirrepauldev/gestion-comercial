#!/usr/bin/env bash
# Baja lo último de main, recompila y reinicia la API. Uso: sudo bash /opt/gestion-comercial/deploy/gce/actualizar.sh
set -euo pipefail
APP_DIR=/opt/gestion-comercial

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo." >&2; exit 1; }

sudo -u gestion -H git -C "$APP_DIR" pull --ff-only
sudo -u gestion -H npm run build --prefix "$APP_DIR"
cp "$APP_DIR/deploy/gce/gestion-comercial.service" /etc/systemd/system/
systemctl daemon-reload
systemctl restart gestion-comercial

sleep 3
curl -fsS http://127.0.0.1:4000/api/health >/dev/null && echo "Actualizado." || {
  echo "La API no respondió. Mirá los logs con: sudo journalctl -u gestion-comercial -n 50" >&2
  exit 1
}
