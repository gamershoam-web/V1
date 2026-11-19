#!/usr/bin/env bash
# Turn on "Sign in with Google" and password reset emails for the Orbit Hub accounts.
# Run as root on the VPS (Hostinger Web console). It asks a few questions; press Enter to keep a current value.
#
#   curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-149e134a-e2c045/deploy/setup-login.sh -o /tmp/setup-login.sh && bash /tmp/setup-login.sh
#
# Settings are stored in /etc/orbit-hub/login.env (readable by root only) and never leave this server.
set -e
CONF=/etc/orbit-hub
FILE=$CONF/login.env
mkdir -p "$CONF"
[ -t 0 ] || { echo "Run it from a file so it can ask questions: bash /tmp/setup-login.sh"; exit 1; }

current() { [ -f "$FILE" ] && sed -n "s/^$1=\"\\(.*\\)\"$/\\1/p" "$FILE" | sed 's/\\\(.\)/\1/g' || true; }
ask() { # ask VAR "Question" default
  local cur; cur=$(current "$1"); [ -z "$cur" ] && cur=$3
  read -r -p "$2${cur:+ [$cur]}: " val
  printf -v "$1" '%s' "${val:-$cur}"
}

echo
echo "== Sign in with Google =="
echo "Needs an OAuth Client ID from https://console.cloud.google.com/apis/credentials"
echo "(type: Web application; Authorized JavaScript origins: https://$(cat $CONF/domain 2>/dev/null || echo your-domain) )"
ask ORBIT_GOOGLE_CLIENT_ID "Google Client ID (ends in .apps.googleusercontent.com, Enter to skip)" ""
if [ -n "$ORBIT_GOOGLE_CLIENT_ID" ] && ! printf '%s' "$ORBIT_GOOGLE_CLIENT_ID" | grep -Eq '^[0-9A-Za-z-]+\.apps\.googleusercontent\.com$'; then
  echo "That doesn't look like a Client ID (it should end in .apps.googleusercontent.com)."; exit 1
fi

echo
echo "== Password reset emails =="
echo "Needs an email mailbox, for example noreply@$(cat $CONF/domain 2>/dev/null || echo your-domain) created in Hostinger (Emails)."
ask ORBIT_SMTP_USER "Mailbox address (Enter to skip)" ""
ORBIT_SMTP_PASS=""
if [ -n "$ORBIT_SMTP_USER" ]; then
  case "$ORBIT_SMTP_USER" in
    *@gmail.com|*@googlemail.com) DEFAULT_HOST=smtp.gmail.com; echo "Gmail: use an App Password (https://myaccount.google.com/apppasswords), not your normal password." ;;
    *) DEFAULT_HOST=smtp.hostinger.com ;;
  esac
  ask ORBIT_SMTP_HOST "Outgoing mail server" "$DEFAULT_HOST"
  ask ORBIT_SMTP_PORT "Port" "465"
  OLD_PASS=$(current ORBIT_SMTP_PASS)
  read -r -s -p "Mailbox password${OLD_PASS:+ (Enter to keep the saved one)}: " ORBIT_SMTP_PASS; echo
  ORBIT_SMTP_PASS=${ORBIT_SMTP_PASS:-$OLD_PASS}
  echo "Checking the mailbox login..."
  if ! H="$ORBIT_SMTP_HOST" P="$ORBIT_SMTP_PORT" U="$ORBIT_SMTP_USER" W="$ORBIT_SMTP_PASS" python3 - <<'PY'
import os, smtplib, ssl, sys
h, p, u, w = os.environ['H'], int(os.environ['P']), os.environ['U'], os.environ['W']
try:
    ctx = ssl.create_default_context()
    s = smtplib.SMTP_SSL(h, p, context=ctx, timeout=20) if p == 465 else smtplib.SMTP(h, p, timeout=20)
    if p != 465:
        s.starttls(context=ctx)
    s.login(u, w)
    s.quit()
except Exception as e:
    print('Could not log in to the mailbox: %s' % type(e).__name__)
    sys.exit(1)
PY
  then echo "Nothing was saved. Check the address and password, then run this again."; exit 1; fi
  echo "Mailbox login works."
fi

umask 077
{
  echo "# Written by deploy/setup-login.sh"
  for k in ORBIT_GOOGLE_CLIENT_ID ORBIT_SMTP_HOST ORBIT_SMTP_PORT ORBIT_SMTP_USER ORBIT_SMTP_PASS; do
    v=${!k:-}
    [ -n "$v" ] || continue
    v=${v//\\/\\\\}; v=${v//\"/\\\"}
    printf '%s="%s"\n' "$k" "$v"
  done
} > "$FILE"
chmod 600 "$FILE"
systemctl restart orbit-hub-api
sleep 1
echo
curl -fsS http://127.0.0.1:8787/api/auth/me | python3 -c 'import json,sys; f=json.load(sys.stdin)["features"]; print("Google sign-in:", "on" if f["google"] else "off"); print("Password reset emails:", "on" if f["emailReset"] else "off")'
