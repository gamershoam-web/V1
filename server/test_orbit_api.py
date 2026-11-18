"""Tests for the account API. Run: python3 -m unittest server/test_orbit_api.py"""
import http.cookiejar
import json
import os
import sqlite3
import sys
import tempfile
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
        self.assertEqual(b['user'], {'username': 'Nova_1', 'displayName': 'Nova Star', 'createdAt': b['user']['createdAt']})
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


if __name__ == '__main__':
    unittest.main()
