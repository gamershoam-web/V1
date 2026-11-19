#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Deploy from YOUR computer (macOS / Linux / Windows WSL or Git Bash) over SSH.
#
#  Usage:  bash deploy/deploy.sh user@your-server-ip [WEB_ROOT] [SSH_PORT]
#  Example: bash deploy/deploy.sh root@203.0.113.10 /var/www/html 22
#
#  It uploads the built site, then runs install-on-server.sh on the VPS, which
#  backs up the old website (to /var/backups/website) before replacing it.
# ---------------------------------------------------------------------------
set -euo pipefail
HOST="${1:?Usage: bash deploy/deploy.sh user@host [WEB_ROOT] [SSH_PORT]}"
WEB_ROOT="${2:-/var/www/html}"
PORT="${3:-22}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f dist/index.html ] || { echo "dist/ is missing — run: npm install && npm run build"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
PKG="nocturne-$STAMP.tar.gz"
tar -czf "/tmp/$PKG" dist deploy/install-on-server.sh deploy/rollback.sh
echo "▸ Uploading $PKG to $HOST…"
scp -P "$PORT" "/tmp/$PKG" "$HOST:/tmp/$PKG"
rm -f "/tmp/$PKG"
echo "▸ Installing on the server (you may be asked for your sudo password)…"
ssh -t -p "$PORT" "$HOST" "set -e
  D=/tmp/nocturne-$STAMP; mkdir -p \$D; tar -xzf /tmp/$PKG -C \$D
  SUDO=''; [ \"\$(id -u)\" -ne 0 ] && SUDO=sudo
  \$SUDO bash \$D/deploy/install-on-server.sh '$WEB_ROOT'
  \$SUDO mkdir -p /opt/nocturne-deploy && \$SUDO cp \$D/deploy/*.sh /opt/nocturne-deploy/
  rm -rf \$D /tmp/$PKG"
echo "▸ Finished. Rollback anytime on the server with: sudo bash /opt/nocturne-deploy/rollback.sh '$WEB_ROOT'"
