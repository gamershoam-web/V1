#!/usr/bin/env bash
# V1 Player server installer for a Linux VPS (Ubuntu / Debian / most others).
# Run from this folder:  sudo ./install.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo ./install.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is missing. Install it (apt install docker-compose-plugin) and run again." >&2
  exit 1
fi

echo
echo "If you have a domain (e.g. videos.example.com) whose DNS A record points to this"
echo "server, enter it to get automatic HTTPS. Leave empty to use http://<server-ip>:8080."
read -rp "Domain: " DOMAIN
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"

while :; do
  read -rsp "Choose a password (at least 8 characters): " PASS; echo
  if [ "${#PASS}" -lt 8 ]; then echo "Too short."; continue; fi
  if [[ "$PASS" == *"'"* ]]; then echo "Please don't use the ' character."; continue; fi
  read -rsp "Repeat the password: " PASS2; echo
  [ "$PASS" = "$PASS2" ] && break
  echo "Passwords didn't match."
done

umask 077
if [ -n "$DOMAIN" ]; then
  cat > .env <<ENV
V1_PASSWORD='$PASS'
DOMAIN=$DOMAIN
COMPOSE_PROFILES=https
BIND_ADDR=127.0.0.1
TRUST_PROXY=1
ENV
else
  cat > .env <<ENV
V1_PASSWORD='$PASS'
COMPOSE_PROFILES=
BIND_ADDR=0.0.0.0
TRUST_PROXY=0
ENV
fi
umask 022

mkdir -p data
chown -R 1000:1000 data   # the container runs as the unprivileged "node" user (uid 1000)

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  if [ -n "$DOMAIN" ]; then ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; else ufw allow 8080/tcp; fi
fi

docker compose up -d --build

IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "V1 Player server is running."
if [ -n "$DOMAIN" ]; then
  echo "  Website and app address: https://$DOMAIN"
  echo "  (The HTTPS certificate is issued on first visit; give it a minute.)"
else
  echo "  Website and app address: http://$IP:8080"
  echo "  Tip: without a domain the connection is not encrypted. Add a domain later by running this again."
fi
echo "  Videos are stored in: $(pwd)/data/videos  (you can also copy files there with scp/rsync)"
