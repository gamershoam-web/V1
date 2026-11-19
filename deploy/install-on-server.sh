#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Nocturne — install the new website on this server, after backing up the old one.
#
#  Usage (run ON the VPS, from inside the cloned repository):
#     sudo bash deploy/install-on-server.sh [WEB_ROOT]
#
#  WEB_ROOT   folder your web server serves (default: /var/www/html)
#  Backups    are written to $BACKUP_DIR (default: /var/backups/website)
#
#  Nothing in WEB_ROOT is touched until a backup has been written AND verified.
# ---------------------------------------------------------------------------
set -euo pipefail

WEB_ROOT="${1:-${WEB_ROOT:-/var/www/html}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/website}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/dist"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/site-$STAMP.tar.gz"

say()  { printf '\033[1;38;5;208m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Please run with sudo (or as root)."
[ -f "$SRC_DIR/index.html" ] || fail "Built site not found at $SRC_DIR (expected dist/index.html)."
case "$WEB_ROOT" in
  /|/bin*|/boot*|/dev*|/etc*|/lib*|/proc*|/root|/sbin*|/sys*|/usr|/usr/bin*) fail "Refusing to use '$WEB_ROOT' as a web root." ;;
esac

mkdir -p "$WEB_ROOT"
WEB_ROOT="$(cd "$WEB_ROOT" && pwd -P)"
case "$(cd "$SRC_DIR" && pwd -P)/" in
  "$WEB_ROOT"/*) fail "The repository is inside the web root. Clone it somewhere else (e.g. /opt/nocturne) and run again." ;;
esac
case "$BACKUP_DIR/" in
  "$WEB_ROOT"/*) fail "BACKUP_DIR must not be inside the web root." ;;
esac

say "Web root : $WEB_ROOT"
say "Backups  : $BACKUP_DIR"
mkdir -p "$BACKUP_DIR" "$WEB_ROOT"
chmod 700 "$BACKUP_DIR"

# 1) Back up the current website (everything inside WEB_ROOT, including dotfiles)
if [ -n "$(ls -A "$WEB_ROOT" 2>/dev/null)" ]; then
  say "Backing up current site → $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$WEB_ROOT" .
  tar -tzf "$BACKUP_FILE" > /dev/null || fail "Backup verification failed — nothing was changed."
  ( cd "$BACKUP_DIR" && sha256sum "$(basename "$BACKUP_FILE")" > "$(basename "$BACKUP_FILE").sha256" )
  ln -sfn "$BACKUP_FILE" "$BACKUP_DIR/latest.tar.gz"
  say "Backup OK ($(du -h "$BACKUP_FILE" | cut -f1)), checksum saved."
else
  say "Web root is empty — nothing to back up."
fi

# 2) Remember who owns the web root so the new files keep the same owner
OWNER="$(stat -c '%U:%G' "$WEB_ROOT" 2>/dev/null || echo root:root)"
if id www-data >/dev/null 2>&1 && [ "$OWNER" = "root:root" ]; then OWNER="www-data:www-data"; fi

# 3) Install the new site (old files are removed; they are safe in the backup).
#    .well-known/ is preserved so HTTPS certificate renewals keep working.
say "Installing new site…"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude '.well-known' "$SRC_DIR/" "$WEB_ROOT/"
else
  # keep .well-known (SSL certificate / domain verification files)
  find "$WEB_ROOT" -mindepth 1 -maxdepth 1 ! -name '.well-known' -exec rm -rf {} +
  cp -a "$SRC_DIR/." "$WEB_ROOT/"
fi
chown -R "$OWNER" "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} +
find "$WEB_ROOT" -type f -exec chmod 644 {} +

# 4) Make sure modern file types are served correctly (WebP / WOFF2)
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
    say "nginx configuration OK — reloaded."
  fi
elif command -v apache2ctl >/dev/null 2>&1; then
  a2enmod -q expires headers deflate >/dev/null 2>&1 || true
  apache2ctl -t >/dev/null 2>&1 && (systemctl reload apache2 2>/dev/null || apache2ctl graceful 2>/dev/null || true)
  say "Apache reloaded (an .htaccess with caching rules is included)."
fi

echo
say "Done! The new website is live in $WEB_ROOT"
[ -f "$BACKUP_FILE" ] && say "Old site saved at: $BACKUP_FILE"
say "To undo:  sudo bash $SCRIPT_DIR/rollback.sh $WEB_ROOT"
