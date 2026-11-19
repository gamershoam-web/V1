#!/usr/bin/env bash
# Run as root on the VPS (Hostinger Web console). Safe to re-run to update the site.
#
#   curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-149e134a-e2c045/deploy/deploy.sh | bash
#
# Optional HTTPS (recommended now that the site has sign-in): point a domain such as
# hub.orbitnetwork.net at this server (DNS "A" record -> the server's IP), then run once with
#   curl -fsSL .../deploy.sh | DOMAIN=hub.orbitnetwork.net bash
# The domain is remembered, so later updates can use the plain command.
set -e
REPO=https://github.com/gamershoam-web/V1.git
BRANCH=ccr-149e134a-e2c045
SITE=/var/www/orbit-hub
CONF=/etc/orbit-hub

apt-get update -y && apt-get install -y nginx git python3 curl
rm -rf /tmp/site-src && git clone --depth 1 -b "$BRANCH" "$REPO" /tmp/site-src
mkdir -p "$SITE"
rm -rf "${SITE:?}"/*
cp -r /tmp/site-src/site/. "$SITE"/
# Remove configs from earlier versions of the site.
rm -rf /var/www/gamershoam /var/www/nebula
rm -f /etc/nginx/sites-enabled/gamershoam /etc/nginx/sites-available/gamershoam /etc/nginx/sites-enabled/nebula /etc/nginx/sites-available/nebula

# ---- Account API (sign in + cloud saves): Python standard library only, accounts stored in /var/lib/orbit-hub
id -u orbit-hub >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin orbit-hub
install -d -m 755 /opt/orbit-hub
install -m 644 /tmp/site-src/server/orbit_api.py /opt/orbit-hub/orbit_api.py
install -m 644 /tmp/site-src/deploy/orbit-hub-api.service /etc/systemd/system/orbit-hub-api.service
systemctl daemon-reload
systemctl enable orbit-hub-api >/dev/null 2>&1
systemctl restart orbit-hub-api

# ---- Web server
mkdir -p "$CONF"
if [ -n "${DOMAIN:-}" ]; then
  if ! printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'; then
    echo "DOMAIN '$DOMAIN' doesn't look like a domain name (example: hub.orbitnetwork.net)"; exit 1
  fi
  echo "$DOMAIN" > "$CONF/domain"
fi
DOMAIN=$(cat "$CONF/domain" 2>/dev/null || true)
install -d /etc/nginx/snippets
install -m 644 /tmp/site-src/deploy/orbit-hub-locations.conf /etc/nginx/snippets/orbit-hub-locations.conf
install -m 644 /tmp/site-src/deploy/nginx.conf /etc/nginx/sites-available/orbit-hub
ln -sf /etc/nginx/sites-available/orbit-hub /etc/nginx/sites-enabled/orbit-hub
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

if [ -n "$DOMAIN" ]; then
  apt-get install -y certbot
  # The HTTPS port has to be reachable. If this server runs the ufw firewall, open the web ports (nothing else is changed).
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "^Status: active"; then
    ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "ufw: web ports 80 and 443 are open"
  fi
  # A bare domain (orbitnetwork.cloud) also answers on www, so try to put both on the certificate.
  NAMES="$DOMAIN"; WWW=""
  [ "$(printf '%s' "$DOMAIN" | tr -cd '.' | wc -c)" -eq 1 ] && WWW="www.$DOMAIN"
  # The certificate challenge is answered from the site folder over plain HTTP (works on the IP-wide default server).
  CERTBOT="certbot certonly --webroot -w $SITE --expand --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring --deploy-hook"
  if [ -n "$WWW" ] && $CERTBOT "systemctl reload nginx" -d "$DOMAIN" -d "$WWW"; then
    NAMES="$DOMAIN $WWW"
  elif ! $CERTBOT "systemctl reload nginx" -d "$DOMAIN"; then
    echo "Could not get a certificate for $DOMAIN yet. Check that its DNS A record points to this server (and that port 80 is open in the Hostinger firewall), then run the deploy again."
  fi
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    cat >> /etc/nginx/sites-available/orbit-hub <<EOF

# HTTPS for $DOMAIN (added by deploy.sh)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $NAMES;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root $SITE;
    index index.html;
    include snippets/orbit-hub-locations.conf;
}
# Send plain-HTTP visitors of $DOMAIN to HTTPS (certificate renewals still work over HTTP)
server {
    listen 80;
    listen [::]:80;
    server_name $NAMES;
    location ^~ /.well-known/acme-challenge/ { root $SITE; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
    nginx -t && systemctl reload nginx
  fi
fi

sleep 1
if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then
  echo "Accounts API: running"
else
  echo "Accounts API did not start. Last log lines:"; journalctl -u orbit-hub-api -n 20 --no-pager || true
fi
if [ -n "$DOMAIN" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "Done: https://$DOMAIN"
else
  echo "Done: http://$(curl -4 -s ifconfig.me)"
fi
