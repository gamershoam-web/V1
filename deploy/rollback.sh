#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Restore a previous website from a backup made by install-on-server.sh
#
#  Usage:  sudo bash deploy/rollback.sh [WEB_ROOT] [BACKUP_FILE]
#          (BACKUP_FILE defaults to the most recent backup)
#  The site being replaced is itself backed up first, so a rollback can be undone.
# ---------------------------------------------------------------------------
set -euo pipefail
WEB_ROOT="${1:-${WEB_ROOT:-/var/www/html}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/website}"
TARGET="${2:-$BACKUP_DIR/latest.tar.gz}"

say()  { printf '\033[1;38;5;208m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Please run with sudo (or as root)."
TARGET="$(readlink -f "$TARGET" 2>/dev/null || echo "$TARGET")"
[ -f "$TARGET" ] || fail "Backup not found: $TARGET  (available: $(ls "$BACKUP_DIR"/site-*.tar.gz 2>/dev/null | tr '\n' ' '))"
tar -tzf "$TARGET" > /dev/null || fail "Backup archive is unreadable: $TARGET"

STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -n "$(ls -A "$WEB_ROOT" 2>/dev/null)" ]; then
  SAFETY="$BACKUP_DIR/pre-rollback-$STAMP.tar.gz"
  tar -czf "$SAFETY" -C "$WEB_ROOT" .
  say "Current site saved to $SAFETY"
fi
OWNER="$(stat -c '%U:%G' "$WEB_ROOT" 2>/dev/null || echo root:root)"
find "$WEB_ROOT" -mindepth 1 -delete
tar -xzf "$TARGET" -C "$WEB_ROOT"
chown -R "$OWNER" "$WEB_ROOT"
say "Restored $(basename "$TARGET") into $WEB_ROOT"
