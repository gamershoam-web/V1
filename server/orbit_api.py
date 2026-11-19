#!/usr/bin/env python3
"""Orbit Network Hub account API: sign up, sign in, cloud saves.

Standard library only (Python 3.8+). In production it listens on 127.0.0.1 behind nginx, which
forwards /api/ to it (see deploy/nginx.conf and deploy/orbit-hub-api.service).

Security notes
- Passwords are hashed with scrypt and a per-user random salt; plain passwords are never stored or logged.
- Sessions are random 256-bit tokens in an HttpOnly, SameSite=Lax cookie (Secure when served over HTTPS);
  only a SHA-256 of each token is stored, so a copy of the database can't be used to sign in.
- State-changing requests must be same-origin JSON with an X-Requested-With header (blocks CSRF).
- Sign-in and sign-up attempts are rate limited per IP address and per account.

Local development (serves the site and the API on one origin):
    python3 server/orbit_api.py --db /tmp/hub.db --port 8080 --static site
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import socket
import ssl
import sqlite3
import struct
import sys
import threading
import time
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from email.message import EmailMessage
from urllib.parse import urlsplit
from urllib.request import urlopen

COOKIE = 'orbit_session'
SESSION_TTL = 30 * 24 * 3600          # stay signed in for 30 days (extended while in use)
SESSION_RENEW = 20 * 24 * 3600        # extend once less than this is left
MAX_BODY = 512 * 1024                 # largest accepted request body (bytes)
MAX_SAVE = 400 * 1024                 # largest stored save (bytes of JSON)
USERNAME_RE = re.compile(r'^[A-Za-z0-9_.-]{3,20}$')
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1
EMAIL_RE = re.compile(r'^[^@\s"<>,;]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$')
NO_PASSWORD = '!'                     # pass_hash of accounts made with Google that never set a password
RESET_TTL = 30 * 60                   # password reset links work for 30 minutes

# Optional sign-in features, configured on the server (deploy/setup-login.sh writes /etc/orbit-hub/login.env):
#   ORBIT_GOOGLE_CLIENT_ID   "Sign in with Google" (OAuth client ID from Google Cloud Console)
#   ORBIT_SMTP_HOST/PORT/USER/PASS, ORBIT_MAIL_FROM   mailbox used to send password reset links
#   ORBIT_SITE_URL           public address used in those links, e.g. https://orbitnetwork.cloud
SETTINGS = {}


def load_settings(env=None):
    env = os.environ if env is None else env
    SETTINGS.clear()
    SETTINGS.update(
        google_client_id=env.get('ORBIT_GOOGLE_CLIENT_ID', '').strip(),
        smtp_host=env.get('ORBIT_SMTP_HOST', '').strip(),
        smtp_port=int(env.get('ORBIT_SMTP_PORT', '465') or 465),
        smtp_user=env.get('ORBIT_SMTP_USER', '').strip(),
        smtp_pass=env.get('ORBIT_SMTP_PASS', ''),
        mail_from=(env.get('ORBIT_MAIL_FROM', '') or env.get('ORBIT_SMTP_USER', '')).strip(),
        site_url=env.get('ORBIT_SITE_URL', '').strip().rstrip('/'),
    )


def email_enabled():
    return bool(SETTINGS.get('smtp_host') and SETTINGS.get('smtp_user') and SETTINGS.get('smtp_pass') and SETTINGS.get('site_url'))


def features():
    return {'google': SETTINGS.get('google_client_id') or None, 'emailReset': email_enabled()}


load_settings()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
"""


# ---------------------------------------------------------------- passwords
def _b64(b):
    return base64.b64encode(b).decode('ascii')


def hash_password(password):
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, maxmem=64 * 1024 * 1024, dklen=32)
    return 'scrypt$%d$%d$%d$%s$%s' % (SCRYPT_N, SCRYPT_R, SCRYPT_P, _b64(salt), _b64(dk))


def verify_password(password, stored):
    try:
        algo, n, r, p, salt, expected = stored.split('$')
        if algo != 'scrypt':
            return False
        dk = hashlib.scrypt(password.encode('utf-8'), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                            maxmem=64 * 1024 * 1024, dklen=len(base64.b64decode(expected)))
        return hmac.compare_digest(dk, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


# Used to spend the same time on unknown usernames as on wrong passwords.
DUMMY_HASH = hash_password(secrets.token_hex(16))


def token_hash(token):
    return hashlib.sha256(token.encode('ascii', 'ignore')).hexdigest()


# ---------------------------------------------------------------- rate limiting
class Limiter:
    """Sliding-window counters kept in memory (reset when the service restarts)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.hits = {}
        self.last_sweep = time.monotonic()

    def allow(self, key, limit, window):
        now = time.monotonic()
        with self.lock:
            if now - self.last_sweep > 300:
                self.hits = {k: [t for t in v if now - t < 3600] for k, v in self.hits.items()}
                self.hits = {k: v for k, v in self.hits.items() if v}
                self.last_sweep = now
            recent = [t for t in self.hits.get(key, []) if now - t < window]
            if len(recent) >= limit:
                self.hits[key] = recent
                return False
            recent.append(now)
            self.hits[key] = recent
            return True

    def count(self, key, window):
        now = time.monotonic()
        with self.lock:
            return len([t for t in self.hits.get(key, []) if now - t < window])

    def clear(self, key):
        with self.lock:
            self.hits.pop(key, None)


LIMITS = Limiter()


# ---------------------------------------------------------------- database
class Database:
    def __init__(self, path):
        self.path = path
        folder = os.path.dirname(os.path.abspath(path))
        os.makedirs(folder, exist_ok=True)
        con = self.connect()
        try:
            con.execute('PRAGMA journal_mode=WAL')
            con.executescript(SCHEMA)
            # Columns added after the first release (email + Google sign-in)
            cols = {r['name'] for r in con.execute('PRAGMA table_info(users)')}
            for name, decl in (('email', 'TEXT'), ('email_verified', 'INTEGER NOT NULL DEFAULT 0'), ('google_sub', 'TEXT')):
                if name not in cols:
                    con.execute('ALTER TABLE users ADD COLUMN %s %s' % (name, decl))
            con.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL')
            con.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub) WHERE google_sub IS NOT NULL')
        finally:
            con.close()

    def connect(self):
        con = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA foreign_keys=ON')
        con.execute('PRAGMA busy_timeout=10000')
        return con


class ApiError(Exception):
    def __init__(self, status, message, extra=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.extra = extra or {}


def clean_display_name(value, fallback):
    if not isinstance(value, str):
        return fallback
    value = ''.join(ch for ch in value if ch.isprintable())
    value = ' '.join(value.split())[:24]
    return value or fallback


def _host_port(netloc):
    u = urlsplit('//' + netloc)
    try:
        port = u.port
    except ValueError:
        port = -1
    return (u.hostname or '').lower(), port


def same_host(origin, host_header):
    """True when an Origin header names the host the request was sent to (ports must match when both are given)."""
    if not origin or origin == 'null':
        return False
    o_host, o_port = _host_port(urlsplit(origin).netloc)
    h_host, h_port = _host_port(host_header)
    if not o_host or o_host != h_host or -1 in (o_port, h_port):
        return False
    return o_port is None or h_port is None or o_port == h_port


def user_json(row):
    return {'username': row['username'], 'displayName': row['display_name'], 'createdAt': row['created_at'] * 1000,
            'email': row['email'], 'emailVerified': bool(row['email_verified']), 'google': bool(row['google_sub']),
            'hasPassword': row['pass_hash'] != NO_PASSWORD}


def clean_email(value):
    """'' for no email, the trimmed address if it looks valid, else None."""
    if not isinstance(value, str):
        return ''
    value = value.strip()
    if not value:
        return ''
    return value if len(value) <= 254 and EMAIL_RE.match(value) else None


# ---------------------------------------------------------------- Google sign-in
# The browser gets a signed ID token from Google; we check its RS256 signature against Google's published keys
# (RSA verification done with Python integers, no extra packages) and its issuer, audience and expiry.
GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
GOOGLE_ISSUERS = ('accounts.google.com', 'https://accounts.google.com')
_google_keys = {'at': 0.0, 'ttl': 0, 'keys': {}}
_google_lock = threading.Lock()
SHA256_PREFIX = bytes.fromhex('3031300d060960864801650304020105000420')


def _b64url(text):
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def _google_key(kid):
    with _google_lock:
        fresh = time.time() - _google_keys['at'] < _google_keys['ttl']
        if kid not in _google_keys['keys'] or not fresh:
            if time.time() - _google_keys['at'] > 30 or kid not in _google_keys['keys']:
                with urlopen(GOOGLE_CERTS_URL, timeout=6) as r:
                    data = json.loads(r.read().decode('utf-8'))
                    m = re.search(r'max-age=(\d+)', r.headers.get('Cache-Control', ''))
                keys = {}
                for k in data.get('keys', []):
                    if k.get('kty') == 'RSA' and k.get('kid'):
                        keys[k['kid']] = (int.from_bytes(_b64url(k['n']), 'big'), int.from_bytes(_b64url(k['e']), 'big'))
                _google_keys.update(at=time.time(), ttl=min(int(m.group(1)) if m else 3600, 86400), keys=keys)
        return _google_keys['keys'].get(kid)


def rsa_sha256_verify(n, e, message, signature):
    k = (n.bit_length() + 7) // 8
    if len(signature) != k:
        return False
    em = pow(int.from_bytes(signature, 'big'), e, n).to_bytes(k, 'big')
    digest = SHA256_PREFIX + hashlib.sha256(message).digest()
    expected = b'\x00\x01' + b'\xff' * (k - 3 - len(digest)) + b'\x00' + digest
    return hmac.compare_digest(em, expected)


def verify_google_token(token, client_id, key_lookup=None, now=None):
    """Returns the token's claims, or raises ValueError."""
    if not client_id or not isinstance(token, str) or token.count('.') != 2 or len(token) > 8192:
        raise ValueError('malformed')
    head_b, body_b, sig_b = token.split('.')
    header = json.loads(_b64url(head_b))
    if header.get('alg') != 'RS256':
        raise ValueError('alg')
    key = (key_lookup or _google_key)(header.get('kid'))
    if not key or not rsa_sha256_verify(key[0], key[1], (head_b + '.' + body_b).encode('ascii'), _b64url(sig_b)):
        raise ValueError('signature')
    claims = json.loads(_b64url(body_b))
    now = time.time() if now is None else now
    if claims.get('iss') not in GOOGLE_ISSUERS or claims.get('aud') != client_id:
        raise ValueError('audience')
    if not isinstance(claims.get('exp'), (int, float)) or claims['exp'] < now - 60:
        raise ValueError('expired')
    if not claims.get('sub') or claims.get('email_verified') not in (True, 'true') or not clean_email(claims.get('email')):
        raise ValueError('email')
    return claims


# ---------------------------------------------------------------- email
def send_mail(to, subject, text):
    msg = EmailMessage()
    msg['From'] = 'Orbit Network <%s>' % SETTINGS['mail_from']
    msg['To'] = to
    msg['Subject'] = subject
    msg.set_content(text)
    host, port = SETTINGS['smtp_host'], SETTINGS['smtp_port']
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as smtp:
            smtp.login(SETTINGS['smtp_user'], SETTINGS['smtp_pass'])
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls(context=ctx)
            smtp.login(SETTINGS['smtp_user'], SETTINGS['smtp_pass'])
            smtp.send_message(msg)


MAILER = {'send': send_mail}  # tests replace this


def send_in_background(to, subject, text):
    def run():
        try:
            MAILER['send'](to, subject, text)
        except Exception as e:  # never log the message (it holds the reset link)
            sys.stderr.write('mail error: %s\n' % type(e).__name__)
    threading.Thread(target=run, daemon=True).start()


# ---------------------------------------------------------------- Minecraft status
# The hub shows the live player count of the Minecraft server running on this machine. The server answers the
# standard "server list ping" (what the multiplayer menu uses); only the fixed host/port below is ever contacted.
MC = {'host': '127.0.0.1', 'port': 25565}
_mc_cache = {'at': 0.0, 'data': {'online': False}}
_mc_lock = threading.Lock()
MC_CACHE_OK, MC_CACHE_DOWN, MC_MAX_PACKET = 8, 4, 120_000


def _varint(n):
    out = b''
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def _recv_exact(sock, n):
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError('closed')
        buf += chunk
    return buf


def _read_varint(read_byte):
    n = 0
    for i in range(5):
        b = read_byte()[0]
        n |= (b & 0x7F) << (7 * i)
        if not b & 0x80:
            return n
    raise ValueError('bad varint')


def _motd_text(node):
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return ''.join(_motd_text(x) for x in node)
    if isinstance(node, dict):
        return _motd_text(node.get('text', '')) + _motd_text(node.get('extra', []))
    return ''


def mc_ping(host, port, timeout=3):
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        hb = host.encode()
        hello = b'\x00' + _varint(765) + _varint(len(hb)) + hb + struct.pack('>H', port) + b'\x01'
        sock.sendall(_varint(len(hello)) + hello + b'\x01\x00')
        read1 = lambda: _recv_exact(sock, 1)  # noqa: E731
        length = _read_varint(read1)
        if not 3 <= length <= MC_MAX_PACKET:
            raise ValueError('bad length')
        body = _recv_exact(sock, length)
    pos = 0

    def take_varint():
        nonlocal pos
        n = 0
        for i in range(5):
            b = body[pos]
            pos += 1
            n |= (b & 0x7F) << (7 * i)
            if not b & 0x80:
                return n
        raise ValueError('bad varint')

    if take_varint() != 0:
        raise ValueError('unexpected packet')
    size = take_varint()
    info = json.loads(body[pos:pos + size].decode('utf-8', 'replace'))
    players = info.get('players') or {}
    motd = re.sub('\u00a7.', '', _motd_text(info.get('description', '')))
    lines = [l.strip() for l in motd.split('\n') if l.strip()][:3]
    icon = info.get('favicon')
    return {
        'online': True,
        'players': {'online': int(players.get('online') or 0), 'max': int(players.get('max') or 0)},
        'version': re.sub('\u00a7.', '', str((info.get('version') or {}).get('name', '')))[:40],
        'motd': {'clean': lines},
        'icon': icon if isinstance(icon, str) and icon.startswith('data:image/png;base64,') and len(icon) < 60_000 else None,
    }


def mc_status():
    now = time.time()
    with _mc_lock:  # one ping at a time; visitors share the cached answer
        age = now - _mc_cache['at']
        ttl = MC_CACHE_OK if _mc_cache['data'].get('online') else MC_CACHE_DOWN
        if age < ttl:
            return _mc_cache['data']
        try:
            data = mc_ping(MC['host'], MC['port'])
        except Exception:  # server down, restarting, or an unexpected reply
            data = {'online': False}
        _mc_cache.update(at=time.time(), data=data)
        return data


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    server_version = 'OrbitHub'
    sys_version = ''
    db = None
    static_dir = None
    trust_proxy = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=self.static_dir or os.getcwd(), **kwargs)

    # Quieter logs: method, path (no query string) and status; never bodies.
    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % args))

    def log_request(self, code='-', size='-'):
        path = urlsplit(self.path).path
        self.log_message('%s %s %s', self.command, path, getattr(code, 'value', code))

    # --- routing
    def do_GET(self):
        if self.is_api():
            return self.api('GET')
        if self.static_dir:
            return super().do_GET()
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_HEAD(self):
        if self.static_dir and not self.is_api():
            return super().do_HEAD()
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        self.api('POST')

    def do_PUT(self):
        self.api('PUT')

    def do_PATCH(self):
        self.api('PATCH')

    def do_DELETE(self):
        self.api('DELETE')

    def is_api(self):
        return urlsplit(self.path).path.startswith('/api/')

    def api(self, method):
        path = urlsplit(self.path).path.rstrip('/')
        routes = {
            ('GET', '/api/health'): self.health,
            ('GET', '/api/auth/me'): self.me,
            ('GET', '/api/mc/status'): self.mc,
            ('POST', '/api/auth/register'): self.register,
            ('POST', '/api/auth/login'): self.login,
            ('POST', '/api/auth/logout'): self.logout,
            ('POST', '/api/auth/google'): self.google,
            ('POST', '/api/auth/forgot'): self.forgot,
            ('POST', '/api/auth/reset'): self.reset,
            ('PATCH', '/api/account'): self.update_account,
            ('POST', '/api/account/delete'): self.delete_account,
            ('GET', '/api/save'): self.get_save,
            ('PUT', '/api/save'): self.put_save,
        }
        handler = routes.get((method, path))
        self.extra_headers = []
        con = None
        try:
            if not handler:
                known = any(p == path for (_, p) in routes)
                raise ApiError(HTTPStatus.METHOD_NOT_ALLOWED if known else HTTPStatus.NOT_FOUND, 'Not found.')
            if method != 'GET':
                self.check_same_origin()
            con = self.db.connect()
            status, body = handler(con)
            self.send_json(status, body)
        except ApiError as e:
            self.send_json(e.status, dict({'error': e.message}, **e.extra))
        except Exception as e:  # never leak internals to the client
            sys.stderr.write('error: %r\n' % (e,))
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {'error': 'Something went wrong. Please try again.'})
        finally:
            if con is not None:
                con.close()

    # --- helpers
    def client_ip(self):
        if self.trust_proxy:
            ip = self.headers.get('X-Real-IP')
            if ip:
                return ip.strip()
        return self.client_address[0]

    def is_https(self):
        return self.trust_proxy and self.headers.get('X-Forwarded-Proto', '').lower() == 'https'

    def check_same_origin(self):
        if self.headers.get('X-Requested-With') != 'orbit-hub':
            raise ApiError(HTTPStatus.FORBIDDEN, 'Request blocked.')
        origin = self.headers.get('Origin')
        if origin and not same_host(origin, self.headers.get('Host') or ''):
            raise ApiError(HTTPStatus.FORBIDDEN, 'Request blocked.')

    def read_json(self):
        if 'application/json' not in (self.headers.get('Content-Type') or ''):
            raise ApiError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, 'Expected JSON.')
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Bad request.')
        if length > MAX_BODY:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, 'That is too much data.')
        raw = self.rfile.read(length) if length else b''
        try:
            body = json.loads(raw.decode('utf-8') or '{}')
        except (ValueError, UnicodeDecodeError):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Bad request.')
        if not isinstance(body, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Bad request.')
        return body

    def send_json(self, status, body):
        data = json.dumps(body, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for name, value in self.extra_headers:
            self.send_header(name, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def set_cookie(self, token, max_age):
        parts = ['%s=%s' % (COOKIE, token), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=%d' % max_age]
        if self.is_https():
            parts.append('Secure')
        self.extra_headers.append(('Set-Cookie', '; '.join(parts)))

    def session_token(self):
        raw = self.headers.get('Cookie')
        if not raw:
            return None
        try:
            jar = SimpleCookie()
            jar.load(raw)
        except CookieError:
            return None
        morsel = jar.get(COOKIE)
        return morsel.value if morsel and morsel.value else None

    def current_user(self, con, required=True):
        token = self.session_token()
        row = None
        if token:
            now = int(time.time())
            row = con.execute(
                'SELECT u.*, s.expires_at, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id '
                'WHERE s.token_hash = ? AND s.expires_at > ?', (token_hash(token), now)).fetchone()
            if row and row['expires_at'] - now < SESSION_RENEW:
                con.execute('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', (now + SESSION_TTL, row['token_hash']))
                self.set_cookie(token, SESSION_TTL)
        if row is None and required:
            raise ApiError(HTTPStatus.UNAUTHORIZED, 'Please sign in.')
        return row

    def start_session(self, con, user_id):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        con.execute('DELETE FROM sessions WHERE expires_at <= ?', (now,))
        con.execute('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
                    (token_hash(token), user_id, now, now + SESSION_TTL))
        con.execute('UPDATE users SET last_login = ? WHERE id = ?', (now, user_id))
        self.set_cookie(token, SESSION_TTL)

    def throttle(self, key, limit, window, message='Too many attempts. Please wait a few minutes and try again.'):
        if not LIMITS.allow(key, limit, window):
            raise ApiError(HTTPStatus.TOO_MANY_REQUESTS, message)

    # --- endpoints
    def health(self, con):
        return HTTPStatus.OK, {'ok': True}

    def mc(self, con):
        return HTTPStatus.OK, mc_status()

    def me(self, con):
        row = self.current_user(con, required=False)
        return HTTPStatus.OK, {'user': user_json(row) if row else None, 'features': features()}

    def register(self, con):
        ip = self.client_ip()
        self.throttle('auth:' + ip, 20, 600)
        body = self.read_json()
        username = (body.get('username') or '').strip() if isinstance(body.get('username'), str) else ''
        password = body.get('password') if isinstance(body.get('password'), str) else ''
        if not USERNAME_RE.match(username):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.', {'field': 'username'})
        if len(password) < 8 or len(password) > 128:
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Passwords need at least 8 characters.', {'field': 'password'})
        if password.lower() == username.lower():
            raise ApiError(HTTPStatus.BAD_REQUEST, "Your password can't be your username.", {'field': 'password'})
        email = clean_email(body.get('email'))
        if email is None:
            raise ApiError(HTTPStatus.BAD_REQUEST, "That email address doesn't look right.", {'field': 'email'})
        self.throttle('register:' + ip, 6, 3600, 'Too many new accounts from this network. Please try again later.')
        display = clean_display_name(body.get('displayName'), username)
        pw_hash = hash_password(password)
        if con.execute('SELECT 1 FROM users WHERE username = ?', (username,)).fetchone():
            raise ApiError(HTTPStatus.CONFLICT, 'That username is taken. Try another one.', {'field': 'username'})
        try:
            cur = con.execute('INSERT INTO users (username, display_name, pass_hash, created_at, email) VALUES (?, ?, ?, ?, ?)',
                              (username, display, pw_hash, int(time.time()), email or None))
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, 'That email is already used by another account. Sign in or reset your password instead.', {'field': 'email'})
        self.start_session(con, cur.lastrowid)
        row = con.execute('SELECT * FROM users WHERE id = ?', (cur.lastrowid,)).fetchone()
        return HTTPStatus.CREATED, {'user': user_json(row), 'created': True}

    def login(self, con):
        ip = self.client_ip()
        self.throttle('auth:' + ip, 20, 600)
        body = self.read_json()
        username = body.get('username').strip() if isinstance(body.get('username'), str) else ''
        password = body.get('password') if isinstance(body.get('password'), str) else ''
        account_key = 'fail:' + username.lower()
        if LIMITS.count(account_key, 900) >= 8:
            raise ApiError(HTTPStatus.TOO_MANY_REQUESTS, 'Too many wrong passwords for this account. Please wait 15 minutes.')
        row = self.find_user(con, username) if username else None
        ok = verify_password(password[:128], row['pass_hash'] if row else DUMMY_HASH)
        if not row or not ok:
            LIMITS.allow(account_key, 1000, 900)  # record the failure
            if row and row['pass_hash'] == NO_PASSWORD:
                raise ApiError(HTTPStatus.UNAUTHORIZED, 'This account uses Google sign-in. Use the Google button, or reset your password to add one.')
            raise ApiError(HTTPStatus.UNAUTHORIZED, 'Wrong username or password.')
        LIMITS.clear(account_key)
        self.start_session(con, row['id'])
        return HTTPStatus.OK, {'user': user_json(row)}

    def logout(self, con):
        token = self.session_token()
        if token:
            con.execute('DELETE FROM sessions WHERE token_hash = ?', (token_hash(token),))
        self.set_cookie('', 0)
        return HTTPStatus.OK, {'ok': True}

    def update_account(self, con):
        user = self.current_user(con)
        body = self.read_json()
        if 'displayName' in body:
            display = clean_display_name(body.get('displayName'), user['display_name'])
            con.execute('UPDATE users SET display_name = ? WHERE id = ?', (display, user['id']))
        if 'email' in body or 'newPassword' in body:
            # Changing how the account is recovered needs the current password (if it has one)
            self.throttle('auth:' + self.client_ip(), 20, 600)
            current = body.get('password') if isinstance(body.get('password'), str) else ''
            if user['pass_hash'] != NO_PASSWORD and not verify_password(current[:128], user['pass_hash']):
                raise ApiError(HTTPStatus.UNAUTHORIZED, 'Your current password is wrong.', {'field': 'password'})
        if 'email' in body:
            email = clean_email(body.get('email'))
            if email is None:
                raise ApiError(HTTPStatus.BAD_REQUEST, "That email address doesn't look right.", {'field': 'email'})
            if (email or '').lower() != (user['email'] or '').lower():
                try:
                    con.execute('UPDATE users SET email = ?, email_verified = 0 WHERE id = ?', (email or None, user['id']))
                except sqlite3.IntegrityError:
                    raise ApiError(HTTPStatus.CONFLICT, 'That email is already used by another account.', {'field': 'email'})
        if 'newPassword' in body:
            new = body.get('newPassword') if isinstance(body.get('newPassword'), str) else ''
            if len(new) < 8 or len(new) > 128:
                raise ApiError(HTTPStatus.BAD_REQUEST, 'Passwords need at least 8 characters.', {'field': 'newPassword'})
            if new.lower() == user['username'].lower():
                raise ApiError(HTTPStatus.BAD_REQUEST, "Your password can't be your username.", {'field': 'newPassword'})
            con.execute('UPDATE users SET pass_hash = ? WHERE id = ?', (hash_password(new), user['id']))
            # Sign out every other device
            con.execute('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', (user['id'], user['token_hash']))
        row = con.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()
        return HTTPStatus.OK, {'user': user_json(row)}

    def delete_account(self, con):
        user = self.current_user(con)
        self.throttle('auth:' + self.client_ip(), 20, 600)
        body = self.read_json()
        password = body.get('password') if isinstance(body.get('password'), str) else ''
        if user['pass_hash'] == NO_PASSWORD:
            if (body.get('confirm') or '') != user['username']:
                raise ApiError(HTTPStatus.BAD_REQUEST, 'Type your username to confirm.', {'field': 'confirm'})
        elif not verify_password(password[:128], user['pass_hash']):
            raise ApiError(HTTPStatus.UNAUTHORIZED, 'Wrong password.', {'field': 'password'})
        con.execute('DELETE FROM users WHERE id = ?', (user['id'],))
        self.set_cookie('', 0)
        return HTTPStatus.OK, {'ok': True}

    def find_user(self, con, login):
        if '@' in login:
            return con.execute('SELECT * FROM users WHERE email = ? COLLATE NOCASE', (login,)).fetchone()
        return con.execute('SELECT * FROM users WHERE username = ?', (login,)).fetchone()

    def google(self, con):
        ip = self.client_ip()
        self.throttle('auth:' + ip, 20, 600)
        client_id = SETTINGS.get('google_client_id')
        if not client_id:
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "Google sign-in isn't set up on this server yet.")
        body = self.read_json()
        try:
            claims = verify_google_token(body.get('credential'), client_id)
        except Exception:
            raise ApiError(HTTPStatus.UNAUTHORIZED, "Google sign-in didn't work. Please try again.")
        sub, email = str(claims['sub']), claims['email'].strip()
        current = self.current_user(con, required=False)
        row = con.execute('SELECT * FROM users WHERE google_sub = ?', (sub,)).fetchone()
        created = False
        if current is not None and row is None:
            # Signed in already: connect this Google account to it
            if current['google_sub']:
                raise ApiError(HTTPStatus.CONFLICT, 'Your account is already connected to a different Google account.')
            con.execute('UPDATE users SET google_sub = ? WHERE id = ?', (sub, current['id']))
            if not current['email']:
                self.claim_email(con, current['id'], email)
            row = con.execute('SELECT * FROM users WHERE id = ?', (current['id'],)).fetchone()
            return HTTPStatus.OK, {'user': user_json(row), 'linked': True}
        if row is None:
            # An account whose email is confirmed (it was used for a password reset) is the same person
            row = con.execute('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND email_verified = 1', (email,)).fetchone()
            if row is not None:
                if row['google_sub']:
                    raise ApiError(HTTPStatus.CONFLICT, 'That email belongs to an account connected to another Google account.')
                con.execute('UPDATE users SET google_sub = ? WHERE id = ?', (sub, row['id']))
        if row is None:
            self.throttle('register:' + ip, 6, 3600, 'Too many new accounts from this network. Please try again later.')
            base = re.sub(r'[^A-Za-z0-9_.-]', '', email.split('@')[0])[:16]
            base = base if len(base) >= 3 else 'pilot' + base
            username, n = base, 1
            while con.execute('SELECT 1 FROM users WHERE username = ?', (username,)).fetchone():
                n += 1
                username = '%s%d' % (base[:20 - len(str(n))], n)
            display = clean_display_name(claims.get('given_name') or claims.get('name'), username)
            cur = con.execute('INSERT INTO users (username, display_name, pass_hash, created_at, google_sub) VALUES (?, ?, ?, ?, ?)',
                              (username, display, NO_PASSWORD, int(time.time()), sub))
            self.claim_email(con, cur.lastrowid, email)
            row = con.execute('SELECT * FROM users WHERE id = ?', (cur.lastrowid,)).fetchone()
            created = True
        if current is not None and current['id'] != row['id']:
            con.execute('DELETE FROM sessions WHERE token_hash = ?', (current['token_hash'],))
        self.start_session(con, row['id'])
        row = con.execute('SELECT * FROM users WHERE id = ?', (row['id'],)).fetchone()
        return (HTTPStatus.CREATED if created else HTTPStatus.OK), {'user': user_json(row), 'created': created}

    def claim_email(self, con, user_id, email):
        """Give a Google-verified email to an account. An unconfirmed copy of it on another account is dropped
        (nobody proved owning it); a confirmed one is left alone."""
        other = con.execute('SELECT id, email_verified FROM users WHERE email = ? COLLATE NOCASE AND id != ?', (email, user_id)).fetchone()
        if other is not None:
            if other['email_verified']:
                return
            con.execute('UPDATE users SET email = NULL WHERE id = ?', (other['id'],))
        con.execute('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?', (email, user_id))

    def forgot(self, con):
        ip = self.client_ip()
        if not email_enabled():
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "Password reset by email isn't set up on this server yet.")
        self.throttle('forgot:' + ip, 5, 3600, 'Too many reset requests. Please try again later.')
        body = self.read_json()
        login = body.get('login').strip() if isinstance(body.get('login'), str) else ''
        if not login or len(login) > 254:
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Enter your username or email.', {'field': 'login'})
        row = self.find_user(con, login)
        # Same answer whether or not the account exists
        if row is not None and row['email'] and LIMITS.allow('forgot-user:%d' % row['id'], 3, 3600):
            token = secrets.token_urlsafe(32)
            now = int(time.time())
            con.execute('DELETE FROM resets WHERE user_id = ? OR expires_at <= ?', (row['id'], now))
            con.execute('INSERT INTO resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
                        (token_hash(token), row['id'], now, now + RESET_TTL))
            link = '%s/#reset=%s' % (SETTINGS['site_url'], token)
            send_in_background(row['email'], 'Reset your Orbit Network password', (
                'Hi %s,\n\nSomeone (hopefully you) asked to reset the password for your Orbit Network Hub account "%s".\n\n'
                'Choose a new password here (the link works for 30 minutes, once):\n%s\n\n'
                "If you didn't ask for this, ignore this email. Your password stays the same.\n\n- Orbit Network\n")
                % (row['display_name'], row['username'], link))
        return HTTPStatus.OK, {'ok': True}

    def reset(self, con):
        ip = self.client_ip()
        self.throttle('auth:' + ip, 20, 600)
        body = self.read_json()
        token = body.get('token') if isinstance(body.get('token'), str) else ''
        password = body.get('password') if isinstance(body.get('password'), str) else ''
        now = int(time.time())
        row = con.execute('SELECT u.* FROM resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.expires_at > ?',
                          (token_hash(token[:200]), now)).fetchone() if token else None
        if row is None:
            raise ApiError(HTTPStatus.BAD_REQUEST, 'This reset link has expired or was already used. Ask for a new one.', {'field': 'token'})
        if len(password) < 8 or len(password) > 128:
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Passwords need at least 8 characters.', {'field': 'password'})
        if password.lower() == row['username'].lower():
            raise ApiError(HTTPStatus.BAD_REQUEST, "Your password can't be your username.", {'field': 'password'})
        con.execute('UPDATE users SET pass_hash = ?, email_verified = 1 WHERE id = ?', (hash_password(password), row['id']))
        con.execute('DELETE FROM resets WHERE user_id = ?', (row['id'],))
        con.execute('DELETE FROM sessions WHERE user_id = ?', (row['id'],))  # sign out everywhere else
        LIMITS.clear('fail:' + row['username'].lower())
        self.start_session(con, row['id'])
        row = con.execute('SELECT * FROM users WHERE id = ?', (row['id'],)).fetchone()
        return HTTPStatus.OK, {'user': user_json(row)}

    def get_save(self, con):
        user = self.current_user(con)
        row = con.execute('SELECT data, rev, updated_at FROM saves WHERE user_id = ?', (user['id'],)).fetchone()
        if not row:
            return HTTPStatus.OK, {'data': None, 'rev': 0, 'updatedAt': 0}
        return HTTPStatus.OK, {'data': json.loads(row['data']), 'rev': row['rev'], 'updatedAt': row['updated_at'] * 1000}

    def put_save(self, con):
        user = self.current_user(con)
        self.throttle('save:%d' % user['id'], 60, 60, 'Saving too often. Please slow down.')
        body = self.read_json()
        data = body.get('data')
        if not isinstance(data, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Bad save data.')
        text = json.dumps(data, separators=(',', ':'))
        if len(text.encode('utf-8')) > MAX_SAVE:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, 'This save is too large.')
        base = body.get('baseRev')
        now = int(time.time())
        con.execute('BEGIN IMMEDIATE')
        try:
            row = con.execute('SELECT data, rev, updated_at FROM saves WHERE user_id = ?', (user['id'],)).fetchone()
            current = row['rev'] if row else 0
            if isinstance(base, int) and base != current:
                con.execute('ROLLBACK')
                raise ApiError(HTTPStatus.CONFLICT, 'Your progress changed on another device.',
                               {'rev': current, 'data': json.loads(row['data']) if row else None,
                                'updatedAt': (row['updated_at'] * 1000) if row else 0})
            rev = current + 1
            con.execute('INSERT INTO saves (user_id, data, rev, updated_at) VALUES (?, ?, ?, ?) '
                        'ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at',
                        (user['id'], text, rev, now))
            con.execute('COMMIT')
        except ApiError:
            raise
        except Exception:
            con.execute('ROLLBACK')
            raise
        return HTTPStatus.OK, {'rev': rev, 'updatedAt': now * 1000}


def main(argv=None):
    ap = argparse.ArgumentParser(description='Orbit Network Hub account API')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--db', default=os.environ.get('ORBIT_DB', '/var/lib/orbit-hub/hub.db'))
    ap.add_argument('--static', default=None, help='also serve this folder (local development)')
    ap.add_argument('--no-proxy', action='store_true', help='not behind nginx: ignore X-Real-IP / X-Forwarded-Proto')
    ap.add_argument('--mc-host', default='127.0.0.1', help='Minecraft server to report on')
    ap.add_argument('--mc-port', type=int, default=25565)
    args = ap.parse_args(argv)
    MC.update(host=args.mc_host, port=args.mc_port)
    Handler.db = Database(args.db)
    Handler.static_dir = os.path.abspath(args.static) if args.static else None
    Handler.trust_proxy = not args.no_proxy
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    print('Orbit Hub API on http://%s:%d (db: %s)' % (args.host, args.port, args.db), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
