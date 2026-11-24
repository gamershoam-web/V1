#!/usr/bin/env bash
# One-line installer:
#   curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/<branch>/server/get.sh | bash
# Downloads (or updates) Lumen in /opt/lumen and runs the installer.
set -euo pipefail

BRANCH="${LUMEN_BRANCH:-ccr-bf2e92af-l5c6am}"
DIR="${LUMEN_DIR:-/opt/lumen}"
REPO="${LUMEN_REPO:-https://github.com/gamershoam-web/V1.git}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (type: sudo -i, then paste the command again)." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y git curl
fi

if [ -d "$DIR/.git" ]; then
  echo "Updating Lumen in $DIR…"
  git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$DIR" reset --hard FETCH_HEAD   # your videos and settings (data/, .env) are untouched
else
  echo "Downloading Lumen to $DIR…"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi

exec bash "$DIR/server/install.sh"
