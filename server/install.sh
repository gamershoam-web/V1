#!/usr/bin/env bash
# Lumen server installer for a Linux VPS (Ubuntu / Debian / most others).
# Run from this folder:  sudo ./install.sh
# Optional presets:      DOMAIN=videos.example.com sudo -E ./install.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo ./install.sh" >&2
  exit 1
fi

# Answers come from the keyboard even when this script is piped in (curl … | bash).
TTY=/dev/tty
ask() { local prompt="$1" var; read -rp "$prompt" var < "$TTY"; printf '%s' "$var"; }
ask_secret() { local prompt="$1" var; read -rsp "$prompt" var < "$TTY"; echo > "$TTY"; printf '%s' "$var"; }

# --- Docker -------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Installing Docker…"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    # Ubuntu's own packages work on brand-new releases too; fall back to Docker's script.
    apt-get install -y docker.io docker-compose-v2 \
      || apt-get install -y docker.io docker-compose-plugin \
      || curl -fsSL https://get.docker.com | sh
  else
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is missing. Install the docker-compose plugin and run this again." >&2
  exit 1
fi

PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

# --- Domain -------------------------------------------------------------------
CURRENT_DOMAIN=$(grep -s '^DOMAIN=' .env | cut -d= -f2- || true)
DEFAULT_DOMAIN="${DOMAIN:-$CURRENT_DOMAIN}"
echo
echo "A domain (e.g. videos.example.com) whose DNS points to this server gives you automatic HTTPS."
echo "Leave it empty to use http://$PUBLIC_IP:8080 instead."
ANSWER=$(ask "Domain${DEFAULT_DOMAIN:+ [$DEFAULT_DOMAIN]}: ")
DOMAIN="${ANSWER:-$DEFAULT_DOMAIN}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
if [ "$DOMAIN" = "-" ]; then DOMAIN=""; fi

if [ -n "$DOMAIN" ]; then
  RESOLVED=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)
  if [ -z "$RESOLVED" ]; then
    echo "!! $DOMAIN doesn't resolve yet. Using http://$PUBLIC_IP:8080 for now; run this again once DNS is set."
    DOMAIN=""
  elif [ -n "$PUBLIC_IP" ] && [ "$RESOLVED" != "$PUBLIC_IP" ]; then
    echo "!! $DOMAIN points to $RESOLVED, but this server is $PUBLIC_IP."
    echo "   Using http://$PUBLIC_IP:8080 for now; fix the DNS record and run this again."
    DOMAIN=""
  fi
fi

# --- Password -----------------------------------------------------------------
CURRENT_PASS=$(grep -s '^V1_PASSWORD=' .env | cut -d= -f2- | sed "s/^'//; s/'\$//" || true)
GENERATED=0
while :; do
  if [ -n "$CURRENT_PASS" ]; then
    PASS=$(ask_secret "Website/app password (Enter keeps the current one): ")
    [ -z "$PASS" ] && { PASS="$CURRENT_PASS"; break; }
  else
    PASS=$(ask_secret "Choose a website/app password (Enter to generate one): ")
    if [ -z "$PASS" ]; then
      PASS=$(head -c 600 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-16)
      GENERATED=1
      break
    fi
  fi
  if [ "${#PASS}" -lt 8 ]; then echo "Use at least 8 characters."; continue; fi
  if [[ "$PASS" == *"'"* ]]; then echo "Please don't use the ' character."; continue; fi
  PASS2=$(ask_secret "Repeat the password: ")
  [ "$PASS" = "$PASS2" ] && break
  echo "Passwords didn't match."
done

# --- Config and start ---------------------------------------------------------
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

echo
echo "Building and starting Lumen (the first time takes a minute or two)…"
docker compose up -d --build --remove-orphans

printf "Waiting for the server"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:8080/api/health >/dev/null 2>&1; then OK=1; break; fi
  printf "."; sleep 2
done
echo

if [ "${OK:-0}" != 1 ]; then
  echo "The server didn't start. Logs:"
  docker compose logs --tail 40 v1player
  exit 1
fi

if [ -n "$DOMAIN" ]; then URL="https://$DOMAIN"; else URL="http://$PUBLIC_IP:8080"; fi
echo
echo "=============================================================="
echo " Lumen is running."
echo
echo "   Address : $URL"
if [ "$GENERATED" = 1 ]; then
echo "   Password: $PASS   (write this down)"
fi
echo
echo " Open the address in a browser, or in the Lumen app:"
echo " Server tab → Connect server → same address and password."
if [ -n "$DOMAIN" ]; then
echo " (The HTTPS certificate is issued on the first visit; give it a minute.)"
else
echo " Tip: without a domain the connection isn't encrypted."
fi
echo " Videos are stored in $(pwd)/data/videos"
echo "=============================================================="
