#!/usr/bin/env bash
# Read-only look at this server: what is running, which ports are in use, and what the deploy would touch.
# It changes nothing and prints no passwords (long tokens in command lines are hidden).
#
#   curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-149e134a-e2c045/deploy/inspect.sh | bash
set +e
hide() { sed -E 's/[A-Za-z0-9_.+\/=-]{32,}/<hidden>/g' | cut -c1-220; }
h() { printf '\n== %s ==\n' "$1"; }

h "Server"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
echo "up: $(uptime -p 2>/dev/null)   load: $(cut -d' ' -f1-3 /proc/loadavg)"
free -h 2>/dev/null | awk 'NR==2{print "memory: "$3" used of "$2}'
df -h / 2>/dev/null | awk 'NR==2{print "disk: "$3" used of "$2" ("$5")"}'
echo "public ip: $(curl -4 -s -m 5 ifconfig.me 2>/dev/null)"

h "Listening ports (what is using them)"
ss -tulpn 2>/dev/null | awk 'NR==1 || /LISTEN|UNCONN/' | awk '{print $1, $5, $7}' | column -t 2>/dev/null | head -30

h "Java / Minecraft processes"
ps -eo pid,user,etime,pcpu,pmem,args 2>/dev/null | grep -i '[j]ava\|[m]inecraft\|[p]aper\|[s]pigot\|[b]ungee\|[v]elocity' | hide
[ -z "$(ps -eo args | grep -i '[j]ava')" ] && echo "(no java process running right now)"

h "Minecraft server folders"
for f in $(find / -maxdepth 5 -name server.properties -not -path '*/proc/*' 2>/dev/null | head -5); do
  echo "$(dirname "$f")"
  grep -E '^(server-port|online-mode|max-players|enable-rcon|enable-query|level-name)=' "$f" | tr '\n' ' '; echo
done

h "Services running"
systemctl list-units --type=service --state=running --no-legend 2>/dev/null | awk '{print $1}' | grep -v -E '^(systemd|dbus|getty|serial|user@|cron|rsyslog|ssh|polkit|networkd|unattended|multipathd|qemu|packagekit|snapd)' | head -25
command -v docker >/dev/null && { h "Docker containers"; docker ps --format '{{.Names}}  {{.Image}}  {{.Ports}}' 2>/dev/null | head; }
command -v screen >/dev/null && screen -ls 2>/dev/null | grep -i '\.' | head -5
command -v tmux >/dev/null && tmux ls 2>/dev/null | head -5

h "Web server"
for s in nginx apache2 caddy; do systemctl is-active --quiet $s 2>/dev/null && echo "$s is running"; done
ls /etc/nginx/sites-enabled 2>/dev/null | sed 's/^/nginx site: /'
grep -rhoE 'server_name [^;]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | sort -u | head

h "Firewall"
command -v ufw >/dev/null && ufw status 2>/dev/null | head -12 || echo "ufw not installed"
echo "(The Hostinger panel also has its own firewall: ports 80 and 443 must be allowed there for the website and HTTPS.)"

h "Orbit Hub site"
[ -d /var/www/orbit-hub ] && echo "site folder: present, build $(grep -o "version: '[0-9]*'" /var/www/orbit-hub/js/config.js 2>/dev/null | head -1)" || echo "site folder: not deployed yet"
systemctl is-active orbit-hub-api 2>/dev/null | sed 's/^/accounts api: /'
echo "domain: $(cat /etc/orbit-hub/domain 2>/dev/null || echo 'not set')"

h "DNS check"
for d in orbitnetwork.cloud www.orbitnetwork.cloud; do echo "$d -> $(getent ahostsv4 "$d" 2>/dev/null | awk 'NR==1{print $1}')"; done
echo
echo "Done. Nothing was changed."
