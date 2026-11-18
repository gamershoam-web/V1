#!/usr/bin/env bash
# Run as root on the VPS (Hostinger Web console). Safe to re-run to update the site.
set -e
REPO=https://github.com/gamershoam-web/V1.git
BRANCH=ccr-149e134a-e2c045
SITE=/var/www/orbit-hub
apt-get update -y && apt-get install -y nginx git
rm -rf /tmp/site-src && git clone --depth 1 -b "$BRANCH" "$REPO" /tmp/site-src
mkdir -p "$SITE"
rm -rf "${SITE:?}"/*
cp -r /tmp/site-src/site/. "$SITE"/
# Remove configs from earlier versions of the site.
rm -rf /var/www/gamershoam /var/www/nebula
rm -f /etc/nginx/sites-enabled/gamershoam /etc/nginx/sites-available/gamershoam /etc/nginx/sites-enabled/nebula /etc/nginx/sites-available/nebula
cp /tmp/site-src/deploy/nginx.conf /etc/nginx/sites-available/orbit-hub
ln -sf /etc/nginx/sites-available/orbit-hub /etc/nginx/sites-enabled/orbit-hub
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx
echo "Done: http://$(curl -4 -s ifconfig.me)"
