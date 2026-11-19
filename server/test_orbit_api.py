"""Tests for the account API. Run: python3 -m unittest server/test_orbit_api.py"""
import http.cookiejar
import json
import os
import sqlite3
import sys
import tempfile
import base64
import hashlib
import random
import socket
import time
import struct
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import orbit_api  # noqa: E402


class Client:
    def __init__(self, base, headers=None):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.headers = headers if headers is not None else {'X-Requested-With': 'orbit-hub'}

    def call(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        h = dict(self.headers)
        if data is not None:
            h['Content-Type'] = 'application/json'
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with self.opener.open(req) as r:
                return r.status, json.loads(r.read() or b'{}'), r.headers
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}'), e.headers


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db_path = os.path.join(cls.tmp.name, 'hub.db')
        orbit_api.Handler.db = orbit_api.Database(cls.db_path)
        orbit_api.Handler.static_dir = None
        orbit_api.Handler.trust_proxy = True
        orbit_api.Handler.log_message = lambda *a: None
        cls.server = orbit_api.ThreadingHTTPServer(('127.0.0.1', 0), orbit_api.Handler)
        cls.base = 'http://127.0.0.1:%d' % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def setUp(self):
        orbit_api.LIMITS.hits.clear()
        self.ip = '10.0.0.%d' % (id(self) % 250)

    def client(self):
        c = Client(self.base)
        c.headers['X-Real-IP'] = self.ip
        return c

    def test_register_login_logout_flow(self):
        c = self.client()
        s, b, h = c.call('POST', '/api/auth/register', {'username': 'Nova_1', 'password': 'correct horse', 'displayName': '  Nova  Star '})
        self.assertEqual(s, 201, b)
        self.assertEqual(b['user'], {'username': 'Nova_1', 'displayName': 'Nova Star', 'createdAt': b['user']['createdAt'],
                                     'email': None, 'emailVerified': False, 'google': False, 'hasPassword': True})
        cookie = h['Set-Cookie']
        self.assertIn('HttpOnly', cookie)
        self.assertIn('SameSite=Lax', cookie)
        self.assertNotIn('Secure', cookie)  # plain HTTP
        self.assertEqual(c.call('GET', '/api/auth/me')[1]['user']['username'], 'Nova_1')
        self.assertEqual(c.call('POST', '/api/auth/logout', {})[0], 200)
        self.assertIsNone(c.call('GET', '/api/auth/me')[1]['user'])
        # sign in again, case-insensitive username
        s, b, _ = c.call('POST', '/api/auth/login', {'username': 'nova_1', 'password': 'correct horse'})
        self.assertEqual(s, 200, b)
        self.assertEqual(b['user']['displayName'], 'Nova Star')

    def test_secure_cookie_over_https(self):
        c = self.client()
        s, b, h = c.call('POST', '/api/auth/register', {'username': 'secure_one', 'password': 'pa55word!'}, {'X-Forwarded-Proto': 'https'})
        self.assertEqual(s, 201, b)
        self.assertIn('Secure', h['Set-Cookie'])

    def test_passwords_are_hashed_and_tokens_not_stored(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'hashme', 'password': 'super secret 1'})
        con = sqlite3.connect(self.db_path)
        self.addCleanup(con.close)
        pw = con.execute("SELECT pass_hash FROM users WHERE username='hashme'").fetchone()[0]
        self.assertTrue(pw.startswith('scrypt$'))
        self.assertNotIn('super secret 1', pw)
        token = [ck.value for ck in c.jar if ck.name == 'orbit_session'][0]
        stored = [r[0] for r in con.execute('SELECT token_hash FROM sessions')]
        self.assertNotIn(token, stored)
        self.assertIn(orbit_api.token_hash(token), stored)

    def test_validation(self):
        c = self.client()
        self.assertEqual(c.call('POST', '/api/auth/register', {'username': 'ab', 'password': 'longenough'})[0], 400)
        self.assertEqual(c.call('POST', '/api/auth/register', {'username': 'bad name!', 'password': 'longenough'})[0], 400)
        self.assertEqual(c.call('POST', '/api/auth/register', {'username': 'shortpw', 'password': 'short'})[0], 400)
        self.assertEqual(c.call('POST', '/api/auth/register', {'username': 'samesame', 'password': 'SameSame'})[0], 400)
        self.assertEqual(c.call('POST', '/api/auth/register', {'username': 'dupe_user', 'password': 'longenough'})[0], 201)
        s, b, _ = self.client().call('POST', '/api/auth/register', {'username': 'DUPE_user', 'password': 'longenough'})
        self.assertEqual(s, 409)
        self.assertEqual(b['field'], 'username')

    def test_wrong_password_and_unknown_user_same_message(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'pilot7', 'password': 'right password'})
        a = c.call('POST', '/api/auth/login', {'username': 'pilot7', 'password': 'wrong password'})
        b = c.call('POST', '/api/auth/login', {'username': 'nobody_here', 'password': 'wrong password'})
        self.assertEqual(a[0], 401)
        self.assertEqual(b[0], 401)
        self.assertEqual(a[1]['error'], b[1]['error'])

    def test_account_lockout_after_failures(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'locky', 'password': 'right password'})
        for i in range(8):
            # spread over several IPs so the per-IP limit is not what stops us
            c.headers['X-Real-IP'] = '10.9.9.%d' % i
            self.assertEqual(c.call('POST', '/api/auth/login', {'username': 'locky', 'password': 'nope nope'})[0], 401)
        c.headers['X-Real-IP'] = '10.9.9.200'
        self.assertEqual(c.call('POST', '/api/auth/login', {'username': 'locky', 'password': 'right password'})[0], 429)

    def test_ip_rate_limit(self):
        c = self.client()
        codes = [c.call('POST', '/api/auth/login', {'username': 'x%d' % i, 'password': 'whatever1'})[0] for i in range(22)]
        self.assertIn(429, codes)

    def test_csrf_guards(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'csrf_user', 'password': 'longenough'})
        bare = Client(self.base, headers={'X-Real-IP': self.ip})
        bare.jar = c.jar
        bare.opener = c.opener
        self.assertEqual(bare.call('PUT', '/api/save', {'data': {}})[0], 403)  # no X-Requested-With
        s, _, _ = c.call('PUT', '/api/save', {'data': {}}, {'Origin': 'http://evil.example'})
        self.assertEqual(s, 403)
        s, _, _ = c.call('PUT', '/api/save', {'data': {}}, {'Origin': self.base})
        self.assertEqual(s, 200)

    def test_same_host(self):
        f = orbit_api.same_host
        self.assertTrue(f('http://1.2.3.4', '1.2.3.4'))
        self.assertTrue(f('http://127.0.0.1:8088', '127.0.0.1:8088'))
        self.assertTrue(f('http://127.0.0.1:8088', '127.0.0.1'))      # nginx $host drops the port
        self.assertTrue(f('https://Hub.Example.net', 'hub.example.net'))
        self.assertFalse(f('http://127.0.0.1:9999', '127.0.0.1:8088'))
        self.assertFalse(f('http://evil.example', 'hub.example.net'))
        self.assertFalse(f('http://hub.example.net.evil.io', 'hub.example.net'))
        self.assertFalse(f('null', 'hub.example.net'))

    def test_save_roundtrip_and_conflict(self):
        a = self.client()
        a.call('POST', '/api/auth/register', {'username': 'saver', 'password': 'longenough'})
        self.assertEqual(a.call('GET', '/api/save')[1], {'data': None, 'rev': 0, 'updatedAt': 0})
        s, b, _ = a.call('PUT', '/api/save', {'data': {'profile': {'xp': 10}}, 'baseRev': 0})
        self.assertEqual((s, b['rev']), (200, 1))
        # second device signs in and saves on top of rev 1
        d = self.client()
        d.call('POST', '/api/auth/login', {'username': 'saver', 'password': 'longenough'})
        self.assertEqual(d.call('GET', '/api/save')[1]['data'], {'profile': {'xp': 10}})
        self.assertEqual(d.call('PUT', '/api/save', {'data': {'profile': {'xp': 20}}, 'baseRev': 1})[1]['rev'], 2)
        # first device is now behind: conflict returns the newer save
        s, b, _ = a.call('PUT', '/api/save', {'data': {'profile': {'xp': 15}}, 'baseRev': 1})
        self.assertEqual(s, 409)
        self.assertEqual((b['rev'], b['data']), (2, {'profile': {'xp': 20}}))
        self.assertEqual(a.call('GET', '/api/save')[1]['rev'], 2)

    def test_save_requires_login_and_limits_size(self):
        c = self.client()
        self.assertEqual(c.call('GET', '/api/save')[0], 401)
        c.call('POST', '/api/auth/register', {'username': 'bigsave', 'password': 'longenough'})
        self.assertEqual(c.call('PUT', '/api/save', {'data': 'nope'})[0], 400)
        self.assertEqual(c.call('PUT', '/api/save', {'data': {'blob': 'x' * (450 * 1024)}})[0], 413)

    def test_users_cannot_read_each_other(self):
        a = self.client()
        a.call('POST', '/api/auth/register', {'username': 'alice_s', 'password': 'longenough'})
        a.call('PUT', '/api/save', {'data': {'secret': 1}})
        b = self.client()
        b.call('POST', '/api/auth/register', {'username': 'bob_s', 'password': 'longenough'})
        self.assertIsNone(b.call('GET', '/api/save')[1]['data'])

    def test_rename_and_delete_account(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'leaver', 'password': 'longenough'})
        self.assertEqual(c.call('PATCH', '/api/account', {'displayName': 'Captain <b>Leaver</b>\u0007'})[1]['user']['displayName'], 'Captain <b>Leaver</b>')
        c.call('PUT', '/api/save', {'data': {'x': 1}})
        self.assertEqual(c.call('POST', '/api/account/delete', {'password': 'wrong one!'})[0], 401)
        self.assertEqual(c.call('POST', '/api/account/delete', {'password': 'longenough'})[0], 200)
        self.assertIsNone(c.call('GET', '/api/auth/me')[1]['user'])
        self.assertEqual(self.client().call('POST', '/api/auth/login', {'username': 'leaver', 'password': 'longenough'})[0], 401)
        con = sqlite3.connect(self.db_path)
        self.addCleanup(con.close)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM saves s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL').fetchone()[0], 0)

    def test_unknown_routes_and_bad_json(self):
        c = self.client()
        self.assertEqual(c.call('GET', '/api/nope')[0], 404)
        self.assertEqual(c.call('DELETE', '/api/save')[0], 405)
        s, _, _ = c.call('POST', '/api/auth/login', None, {'Content-Type': 'application/json'})
        self.assertIn(s, (400, 401))


class FakeMinecraft:
    """Answers the server list ping like a real server, for the status endpoint tests."""
    def __init__(self, info):
        self.info = info
        self.sock = socket.socket()
        self.sock.bind(('127.0.0.1', 0))
        self.sock.listen(4)
        self.port = self.sock.getsockname()[1]
        threading.Thread(target=self.run, daemon=True).start()

    def run(self):
        while True:
            try:
                c, _ = self.sock.accept()
            except OSError:
                return
            with c:
                c.settimeout(2)
                try:
                    c.recv(256)
                    js = json.dumps(self.info).encode()
                    inner = b'\x00' + orbit_api._varint(len(js)) + js
                    c.sendall(orbit_api._varint(len(inner)) + inner)
                except OSError:
                    pass

    def close(self):
        self.sock.close()


class MinecraftStatusTest(unittest.TestCase):
    def tearDown(self):
        orbit_api._mc_cache.update(at=0.0, data={'online': False})

    def test_ping_parses_a_server_reply(self):
        fake = FakeMinecraft({'version': {'name': 'Velocity 1.7.2'}, 'players': {'online': 7, 'max': 100},
                              'description': {'text': '\u00a7aOrbit ', 'extra': [{'text': 'Network'}, '\nJoin now']}})
        try:
            r = orbit_api.mc_ping('127.0.0.1', fake.port)
        finally:
            fake.close()
        self.assertEqual(r['players'], {'online': 7, 'max': 100})
        self.assertEqual(r['motd']['clean'], ['Orbit Network', 'Join now'])
        self.assertEqual(r['version'], 'Velocity 1.7.2')
        self.assertTrue(r['online'])

    def test_offline_when_nothing_listens(self):
        s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
        orbit_api.MC.update(host='127.0.0.1', port=port)
        self.assertEqual(orbit_api.mc_status(), {'online': False})


# ---------------------------------------------------------------- Google sign-in + password reset
def _is_prime(n, rnd):
    if n % 2 == 0:
        return n == 2
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(24):
        x = pow(rnd.randrange(2, n - 1), d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def make_rsa(bits=1024, seed=7):
    rnd = random.Random(seed)
    def prime():
        while True:
            c = rnd.getrandbits(bits // 2) | (1 << (bits // 2 - 1)) | 1
            if all(c % s for s in (3, 5, 7, 11, 13, 17, 19, 23)) and _is_prime(c, rnd):
                return c
    e = 65537
    while True:
        p_, q_ = prime(), prime()
        phi = (p_ - 1) * (q_ - 1)
        if p_ != q_ and phi % e:
            return p_ * q_, e, pow(e, -1, phi)


KEY = make_rsa()


def b64u(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def google_token(claims, kid='k1', key=KEY):
    n, e, d = key
    head = b64u(json.dumps({'alg': 'RS256', 'kid': kid}).encode())
    body = b64u(json.dumps(claims).encode())
    k = (n.bit_length() + 7) // 8
    digest = orbit_api.SHA256_PREFIX + hashlib.sha256((head + '.' + body).encode()).digest()
    em = b'\x00\x01' + b'\xff' * (k - 3 - len(digest)) + b'\x00' + digest
    sig = pow(int.from_bytes(em, 'big'), d, n).to_bytes(k, 'big')
    return head + '.' + body + '.' + b64u(sig)


CID = 'test-client.apps.googleusercontent.com'


def claims(sub='g-1', email='nova@example.com', **kw):
    c = {'iss': 'https://accounts.google.com', 'aud': CID, 'sub': sub, 'email': email, 'email_verified': True,
         'exp': int(time.time()) + 600, 'iat': int(time.time()), 'given_name': 'Nova'}
    c.update(kw)
    return c


class LoginFeaturesTest(ApiTest):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.sent = []
        orbit_api.MAILER['send'] = lambda to, subject, text: cls.sent.append((to, subject, text))
        orbit_api.load_settings({'ORBIT_GOOGLE_CLIENT_ID': CID, 'ORBIT_SMTP_HOST': 'smtp.example.com', 'ORBIT_SMTP_USER': 'noreply@example.com',
                                 'ORBIT_SMTP_PASS': 'x', 'ORBIT_SITE_URL': 'https://hub.example.com/'})
        orbit_api._google_keys.update(at=time.time(), ttl=3600, keys={'k1': (KEY[0], KEY[1])})

    @classmethod
    def tearDownClass(cls):
        orbit_api.load_settings({})
        orbit_api._google_keys.update(at=0.0, ttl=0, keys={})
        super().tearDownClass()

    def wait_mail(self, count):
        for _ in range(100):
            if len(self.sent) >= count:
                return self.sent[count - 1]
            time.sleep(0.02)
        self.fail('no email sent')

    def test_features_reported(self):
        s, b, _ = self.client().call('GET', '/api/auth/me')
        self.assertEqual(b['features'], {'google': CID, 'emailReset': True})

    def test_token_checks(self):
        ok = orbit_api.verify_google_token(google_token(claims()), CID)
        self.assertEqual(ok['sub'], 'g-1')
        bad = [google_token(claims(aud='someone-else')), google_token(claims(iss='evil.example')),
               google_token(claims(exp=int(time.time()) - 3600)), google_token(claims(email_verified=False)),
               google_token(claims(), kid='unknown-kid'), google_token(claims(), key=make_rsa(seed=99))]
        tampered = google_token(claims()).split('.')
        tampered[1] = b64u(json.dumps(claims(sub='admin')).encode())
        bad.append('.'.join(tampered))
        orbit_api._google_keys['at'] = time.time()  # no network refresh for the unknown kid
        for tok in bad:
            with self.assertRaises(Exception):
                orbit_api.verify_google_token(tok, CID, key_lookup=lambda kid: orbit_api._google_keys['keys'].get(kid))

    def test_google_creates_then_signs_in(self):
        c = self.client()
        s, b, _ = c.call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-new', email='star.pilot@example.com'))})
        self.assertEqual(s, 201, b)
        u = b['user']
        self.assertEqual((u['username'], u['displayName'], u['email'], u['google'], u['hasPassword']), ('star.pilot', 'Nova', 'star.pilot@example.com', True, False))
        c2 = self.client()
        s, b, _ = c2.call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-new', email='star.pilot@example.com'))})
        self.assertEqual((s, b['user']['username'], b['created']), (200, 'star.pilot', False))
        # no password sign-in for a Google-only account
        s, b, _ = self.client().call('POST', '/api/auth/login', {'username': 'star.pilot', 'password': '!'})
        self.assertEqual(s, 401)
        self.assertIn('Google', b['error'])
        # bad token
        s, _, _ = self.client().call('POST', '/api/auth/google', {'credential': 'a.b.c'})
        self.assertEqual(s, 401)

    def test_google_username_clash_and_unconfirmed_email(self):
        c = self.client()
        self.assertEqual(c.call('POST', '/api/auth/register', {'username': 'orion', 'password': 'password123', 'email': 'orion@example.com'})[0], 201)
        # Someone signs in with Google using that address: a new account (the email was never confirmed), which takes the email
        g = self.client()
        s, b, _ = g.call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-orion', email='orion@example.com'))})
        self.assertEqual(s, 201, b)
        self.assertEqual((b['user']['username'], b['user']['email']), ('orion2', 'orion@example.com'))
        self.assertIsNone(c.call('GET', '/api/auth/me')[1]['user']['email'])

    def test_connect_google_to_signed_in_account(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'vega_link', 'password': 'password123'})
        s, b, _ = c.call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-vega', email='vega@example.com'))})
        self.assertEqual((s, b.get('linked'), b['user']['username'], b['user']['email'], b['user']['google']), (200, True, 'vega_link', 'vega@example.com', True))
        s, b, _ = self.client().call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-vega', email='vega@example.com'))})
        self.assertEqual(b['user']['username'], 'vega_link')

    def test_forgot_and_reset_password(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'lyra', 'password': 'oldpassword1', 'email': 'Lyra@Example.com'})
        before = len(self.sent)
        s, b, _ = self.client().call('POST', '/api/auth/forgot', {'login': 'lyra@example.com'})
        self.assertEqual((s, b), (200, {'ok': True}))
        to, subject, text = self.wait_mail(before + 1)
        self.assertEqual(to, 'Lyra@Example.com')
        token = text.split('https://hub.example.com/#reset=')[1].split()[0]
        # unknown accounts get the same answer and no email
        self.assertEqual(self.client().call('POST', '/api/auth/forgot', {'login': 'nobody-here'})[:2], (200, {'ok': True}))
        time.sleep(0.1)
        self.assertEqual(len(self.sent), before + 1)
        r = self.client()
        self.assertEqual(r.call('POST', '/api/auth/reset', {'token': token, 'password': 'short'})[0], 400)
        s, b, _ = r.call('POST', '/api/auth/reset', {'token': token, 'password': 'newpassword1'})
        self.assertEqual((s, b['user']['username'], b['user']['emailVerified']), (200, 'lyra', True))
        self.assertEqual(r.call('POST', '/api/auth/reset', {'token': token, 'password': 'another-pass1'})[0], 400)  # single use
        self.assertIsNone(c.call('GET', '/api/auth/me')[1]['user'])  # old sessions signed out
        self.assertEqual(self.client().call('POST', '/api/auth/login', {'username': 'lyra', 'password': 'oldpassword1'})[0], 401)
        self.assertEqual(self.client().call('POST', '/api/auth/login', {'username': 'LYRA@example.com', 'password': 'newpassword1'})[0], 200)
        # a confirmed email now links to Google sign-in with the same address
        s, b, _ = self.client().call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-lyra', email='lyra@example.com'))})
        self.assertEqual((s, b['user']['username']), (200, 'lyra'))
        with sqlite3.connect(self.db_path) as con:
            self.assertEqual(con.execute('SELECT COUNT(*) FROM resets').fetchone()[0], 0)
        con.close()

    def test_change_email_and_password_need_current_password(self):
        c = self.client()
        c.call('POST', '/api/auth/register', {'username': 'mira', 'password': 'password123'})
        self.assertEqual(c.call('PATCH', '/api/account', {'email': 'mira@example.com', 'password': 'wrong-pass'})[0], 401)
        self.assertEqual(c.call('PATCH', '/api/account', {'email': 'not-an-email', 'password': 'password123'})[0], 400)
        s, b, _ = c.call('PATCH', '/api/account', {'email': 'mira@example.com', 'password': 'password123'})
        self.assertEqual((s, b['user']['email']), (200, 'mira@example.com'))
        other = self.client()
        s, b, _ = other.call('POST', '/api/auth/register', {'username': 'mira2', 'password': 'password123', 'email': 'MIRA@example.com'})
        self.assertEqual((s, b.get('field')), (409, 'email'))
        s, _, _ = c.call('PATCH', '/api/account', {'newPassword': 'brand-new-pass', 'password': 'password123'})
        self.assertEqual(s, 200)
        self.assertEqual(self.client().call('POST', '/api/auth/login', {'username': 'mira', 'password': 'brand-new-pass'})[0], 200)

    def test_delete_google_only_account(self):
        c = self.client()
        c.call('POST', '/api/auth/google', {'credential': google_token(claims(sub='g-del', email='gone@example.com'))})
        self.assertEqual(c.call('POST', '/api/account/delete', {'confirm': 'nope'})[0], 400)
        self.assertEqual(c.call('POST', '/api/account/delete', {'confirm': 'gone'})[0], 200)


class MigrationTest(unittest.TestCase):
    def test_old_database_gets_new_columns(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'old.db')
            con = sqlite3.connect(path)
            con.executescript("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,"
                              " pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER);"
                              " INSERT INTO users (username, display_name, pass_hash, created_at) VALUES ('old', 'Old', 'x', 1);")
            con.close()
            db = orbit_api.Database(path)
            con = db.connect()
            row = con.execute('SELECT * FROM users').fetchone()
            self.assertEqual((row['username'], row['email'], row['email_verified'], row['google_sub']), ('old', None, 0, None))
            con.close()


if __name__ == '__main__':
    unittest.main()
