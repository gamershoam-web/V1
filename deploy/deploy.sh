#!/usr/bin/env bash
# Run as root on the VPS (Hostinger Web console). Usage: bash deploy.sh
set -e
REPO=https://github.com/gamershoam-web/V1.git
apt-get update -y && apt-get install -y nginx git
rm -rf /tmp/gs && git clone --depth 1 -b ccr-149e134a-e2c045 "$REPO" /tmp/gs
mkdir -p /var/www/gamershoam
cp -r /tmp/gs/site/. /var/www/gamershoam/
cp /tmp/gs/deploy/nginx.conf /etc/nginx/sites-available/gamershoam
ln -sf /etc/nginx/sites-available/gamershoam /etc/nginx/sites-enabled/gamershoam
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx
echo "Done: http://$(curl -s ifconfig.me)"
