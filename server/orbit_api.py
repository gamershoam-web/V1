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
import sqlite3
import sys
import threading
import time
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

COOKIE = 'orbit_session'
SESSION_TTL = 30 * 24 * 3600          # stay signed in for 30 days (extended while in use)
SESSION_RENEW = 20 * 24 * 3600        # extend once less than this is left
MAX_BODY = 512 * 1024                 # largest accepted request body (bytes)
MAX_SAVE = 400 * 1024                 # largest stored save (bytes of JSON)
USERNAME_RE = re.compile(r'^[A-Za-z0-9_.-]{3,20}$')
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1

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
    return {'username': row['username'], 'displayName': row['display_name'], 'createdAt': row['created_at'] * 1000}


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
            ('POST', '/api/auth/register'): self.register,
            ('POST', '/api/auth/login'): self.login,
            ('POST', '/api/auth/logout'): self.logout,
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

    def me(self, con):
        row = self.current_user(con, required=False)
        return HTTPStatus.OK, {'user': user_json(row) if row else None}

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
        self.throttle('register:' + ip, 6, 3600, 'Too many new accounts from this network. Please try again later.')
        display = clean_display_name(body.get('displayName'), username)
        pw_hash = hash_password(password)
        try:
            cur = con.execute('INSERT INTO users (username, display_name, pass_hash, created_at) VALUES (?, ?, ?, ?)',
                              (username, display, pw_hash, int(time.time())))
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, 'That username is taken. Try another one.', {'field': 'username'})
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
        row = con.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone() if username else None
        ok = verify_password(password[:128], row['pass_hash'] if row else DUMMY_HASH)
        if not row or not ok:
            LIMITS.allow(account_key, 1000, 900)  # record the failure
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
        display = clean_display_name(body.get('displayName'), user['display_name'])
        con.execute('UPDATE users SET display_name = ? WHERE id = ?', (display, user['id']))
        row = con.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()
        return HTTPStatus.OK, {'user': user_json(row)}

    def delete_account(self, con):
        user = self.current_user(con)
        self.throttle('auth:' + self.client_ip(), 20, 600)
        body = self.read_json()
        password = body.get('password') if isinstance(body.get('password'), str) else ''
        if not verify_password(password[:128], user['pass_hash']):
            raise ApiError(HTTPStatus.UNAUTHORIZED, 'Wrong password.', {'field': 'password'})
        con.execute('DELETE FROM users WHERE id = ?', (user['id'],))
        self.set_cookie('', 0)
        return HTTPStatus.OK, {'ok': True}

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
    args = ap.parse_args(argv)
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
