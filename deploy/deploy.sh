#!/usr/bin/env bash
# Run as root on the VPS (Hostinger Web console). Safe to re-run to update the site.
set -e
REPO=https://github.com/gamershoam-web/V1.git
BRANCH=ccr-149e134a-e2c045
apt-get update -y && apt-get install -y nginx git
rm -rf /tmp/site-src && git clone --depth 1 -b "$BRANCH" "$REPO" /tmp/site-src
mkdir -p /var/www/nebula
cp -r /tmp/site-src/site/. /var/www/nebula/
rm -rf /var/www/gamershoam /etc/nginx/sites-enabled/gamershoam /etc/nginx/sites-available/gamershoam
cp /tmp/site-src/deploy/nginx.conf /etc/nginx/sites-available/nebula
ln -sf /etc/nginx/sites-available/nebula /etc/nginx/sites-enabled/nebula
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx
echo "Done: http://$(curl -4 -s ifconfig.me)"
