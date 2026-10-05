#!/usr/bin/env bash
# Build the Demo Store UI and install it into the system nginx on an Ubuntu host
# (22.04 / 24.04, e.g. an EC2 instance). Run as a normal user with sudo rights,
# from anywhere inside the uiserver/ directory:
#
#   APISERVER_ADDR=10.0.1.23:8000 MONITORING_CIDR=10.0.0.0/16 ./deploy/install.sh
#
# Re-running it rebuilds and redeploys. Environment:
#   APISERVER_ADDR    host:port of the apiserver (default apiserver:8000; must resolve)
#   MONITORING_CIDR   network allowed to read /nginx_status (default 127.0.0.1/32)
#   SKIP_BUILD=1      deploy an existing web/dist instead of building
set -euo pipefail

export APISERVER_ADDR="${APISERVER_ADDR:-apiserver:8000}"
export MONITORING_CIDR="${MONITORING_CIDR:-127.0.0.1/32}"
SKIP_BUILD="${SKIP_BUILD:-0}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT=/usr/share/nginx/html
NODE_MAJOR=22

log() { printf '\n==> %s\n' "$*"; }

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script supports Ubuntu only (found ${PRETTY_NAME:-unknown})." >&2
  exit 1
fi
if [[ $EUID -eq 0 ]]; then
  echo "Run this as a normal user; it uses sudo where it needs root." >&2
  exit 1
fi

log "Installing nginx"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx gettext-base ca-certificates curl

if [[ "$SKIP_BUILD" != "1" ]]; then
  # Vite needs Node >= 20.19; Ubuntu's own nodejs package is older.
  node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)'; }
  if ! node_ok; then
    log "Installing Node.js ${NODE_MAJOR} from NodeSource"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  fi
  log "Building the SPA with Node $(node --version)"
  (cd "$ROOT/web" && npm ci --no-audit --no-fund && npm run build)
fi

[[ -f "$ROOT/web/dist/index.html" ]] || { echo "No build found at $ROOT/web/dist" >&2; exit 1; }

log "Copying web/dist to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo find "$WEB_ROOT" -mindepth 1 -delete
sudo cp -r "$ROOT/web/dist/." "$WEB_ROOT/"
sudo chmod -R a+rX "$WEB_ROOT"

log "Installing nginx config (APISERVER_ADDR=$APISERVER_ADDR, MONITORING_CIDR=$MONITORING_CIDR)"
if [[ ! -f /etc/nginx/nginx.conf.orig ]]; then
  sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig
fi
# Ubuntu's nginx runs workers as www-data; the Docker image uses nginx.
sed 's/^user .*/user www-data;/' "$ROOT/nginx/nginx.conf" | sudo tee /etc/nginx/nginx.conf >/dev/null
# Substitute only our two variables; nginx's own $variables stay as they are.
envsubst '${APISERVER_ADDR} ${MONITORING_CIDR}' <"$ROOT/nginx/conf.d/store.conf" | sudo tee /etc/nginx/conf.d/store.conf >/dev/null
# Our nginx.conf includes only conf.d/*.conf, but remove the stock site anyway
# so a later switch back to the stock nginx.conf doesn't bring it back.
sudo rm -f /etc/nginx/sites-enabled/default

sudo touch /var/log/nginx/access.json
sudo chown www-data:adm /var/log/nginx/access.json

# Ubuntu's logrotate rule only matches *.log.
sudo tee /etc/logrotate.d/nginx-access-json >/dev/null <<'ROTATE'
/var/log/nginx/access.json {
	daily
	missingok
	rotate 14
	compress
	delaycompress
	notifempty
	create 0640 www-data adm
	sharedscripts
	postrotate
		invoke-rc.d nginx rotate >/dev/null 2>&1 || true
	endscript
}
ROTATE

log "Testing and reloading nginx"
if ! sudo nginx -t; then
  echo "nginx -t failed. If it says 'host not found in upstream', set APISERVER_ADDR to an address this host can resolve." >&2
  exit 1
fi
sudo systemctl enable --now nginx
sudo systemctl reload nginx

log "Done"
echo "Store:        http://$(hostname -I | awk '{print $1}')/"
echo "Access log:   /var/log/nginx/access.json"
echo "nginx status: curl http://127.0.0.1/nginx_status"
