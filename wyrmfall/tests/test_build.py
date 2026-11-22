#!/usr/bin/env python3
"""Offline tests for tools/build.py against a fake Modrinth API.

  python wyrmfall/tests/test_build.py
"""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import threading
import unittest
import urllib.parse
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import build  # noqa: E402


def project(pid, slug, client="required", server="required", ptype="mod"):
    return {"id": pid, "slug": slug, "title": slug.title(), "client_side": client, "server_side": server, "project_type": ptype}


def version(vid, pid, number, loaders=("forge",), gv=("1.20.1",), deps=(), vtype="release", date="2024-01-01"):
    blob = f"{pid}-{number}".encode()
    return {
        "id": vid, "project_id": pid, "version_number": number, "version_type": vtype, "date_published": date,
        "loaders": list(loaders), "game_versions": list(gv), "dependencies": list(deps),
        "files": [{
            "primary": True, "filename": f"{pid}-{number}.jar", "size": len(blob),
            "url": f"https://cdn.modrinth.com/data/{pid}/versions/{vid}/{pid}-{number}.jar",
            "hashes": {"sha1": hashlib.sha1(blob).hexdigest(), "sha512": hashlib.sha512(blob).hexdigest()},
        }],
    }


def dep(pid, kind="required"):
    return {"project_id": pid, "version_id": None, "dependency_type": kind}


PROJECTS = [
    project("P_LIB", "lib"),
    project("P_CORE", "core"),
    project("P_SHINY", "shiny", server="unsupported"),
    project("P_SHINYLIB", "shinylib"),
    project("P_NEW", "new-name"),
    project("P_FABONLY", "fabric-only"),
    project("P_SHADER", "cool-shader", server="unsupported", ptype="shader"),
    project("P_BAD", "bad"),
    project("P_HATER", "hater"),
]
VERSIONS = {
    "P_LIB": [version("V_LIB1", "P_LIB", "1.0", date="2023-01-01"), version("V_LIB2", "P_LIB", "2.0", date="2024-01-01"),
              version("V_LIB3", "P_LIB", "3.0-beta", vtype="beta", date="2025-01-01")],
    "P_CORE": [version("V_CORE", "P_CORE", "5.0", deps=[dep("P_LIB")])],
    "P_SHINY": [version("V_SHINY", "P_SHINY", "1.2", deps=[dep("P_SHINYLIB"), dep("P_LIB", "optional")])],
    "P_SHINYLIB": [version("V_SHINYLIB", "P_SHINYLIB", "0.9")],
    "P_NEW": [version("V_NEW", "P_NEW", "4.4")],
    "P_FABONLY": [version("V_FAB", "P_FABONLY", "1.0", loaders=("fabric",))],
    "P_SHADER": [version("V_SH", "P_SHADER", "r5", loaders=("iris", "optifine"))],
    "P_BAD": [version("V_BAD", "P_BAD", "1.0", deps=[dep("P_MISSING")])],
    "P_HATER": [version("V_HATER", "P_HATER", "1.0", deps=[dep("P_CORE", "incompatible")])],
}


class FakeModrinth(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, obj):
        if obj is None:
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        parts = [urllib.parse.unquote(p) for p in url.path.split("/") if p][1:]  # drop "v2"
        by_key = {p["id"]: p for p in PROJECTS} | {p["slug"]: p for p in PROJECTS}
        if parts[0] == "project" and len(parts) == 2:
            return self._send(by_key.get(parts[1]))
        if parts[0] == "project" and len(parts) == 3 and parts[2] == "version":
            proj = by_key.get(parts[1])
            if not proj:
                return self._send(None)
            q = urllib.parse.parse_qs(url.query)
            loaders = json.loads(q["loaders"][0])
            gvs = json.loads(q["game_versions"][0])
            vs = [v for v in VERSIONS.get(proj["id"], [])
                  if set(loaders) & set(v["loaders"]) and set(gvs) & set(v["game_versions"])]
            return self._send(sorted(vs, key=lambda v: v["date_published"], reverse=True))
        if parts[0] == "version":
            for vs in VERSIONS.values():
                for v in vs:
                    if v["id"] == parts[1]:
                        return self._send(v)
        return self._send(None)


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakeModrinth)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.api = f"http://127.0.0.1:{cls.httpd.server_port}/v2"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def run_build(self, mods):
        tmp = Path(tempfile.mkdtemp())
        (tmp / "pack.json").write_text(json.dumps({
            "name": "TEST", "version": "0.1", "summary": "s", "minecraft": "1.20.1",
            "loader": "forge", "loader_version": "47.9.9", "loader_fallback": "47.0.0"}))
        (tmp / "mods.json").write_text(json.dumps({"mods": mods}))
        ov = tmp / "overrides" / "kubejs"
        ov.mkdir(parents=True)
        (ov / "x.js").write_text("// hi")
        code = build.main(["--pack", str(tmp / "pack.json"), "--mods", str(tmp / "mods.json"),
                           "--overrides", str(tmp / "overrides"), "--out", str(tmp / "dist"), "--api", self.api])
        return code, tmp / "dist"

    def index(self, dist):
        with zipfile.ZipFile(dist / "TEST-0.1.mrpack") as z:
            names = z.namelist()
            return json.loads(z.read("modrinth.index.json")), names

    def test_full_pack(self):
        code, dist = self.run_build([
            {"slug": "core"},
            {"slug": "shiny", "side": "client"},
            {"slug": "old-name", "alts": ["new-name"]},
            {"slug": "fabric-only", "optional": True},
            {"slug": "cool-shader", "type": "shader", "side": "client"},
        ])
        self.assertEqual(code, 0)
        index, names = self.index(dist)
        self.assertIn("overrides/kubejs/x.js", names)
        self.assertEqual(index["dependencies"], {"minecraft": "1.20.1", "forge": "47.9.9"})
        files = {f["path"]: f for f in index["files"]}
        # Releases beat newer betas; dependency pulled in automatically.
        self.assertIn("mods/P_LIB-2.0.jar", files)
        self.assertEqual(files["mods/P_LIB-2.0.jar"]["env"], {"client": "required", "server": "required"})
        # Client-only mod and its library stay off the server.
        self.assertEqual(files["mods/P_SHINY-1.2.jar"]["env"]["server"], "unsupported")
        self.assertEqual(files["mods/P_SHINYLIB-0.9.jar"]["env"], {"client": "required", "server": "unsupported"})
        # Alternative slug used; shader goes to shaderpacks.
        self.assertIn("mods/P_NEW-4.4.jar", files)
        self.assertEqual(files["shaderpacks/P_SHADER-r5.jar"]["env"]["server"], "unsupported")
        self.assertEqual(len(files), 6)
        for f in files.values():
            self.assertEqual(len(f["hashes"]["sha512"]), 128)
            self.assertTrue(f["downloads"][0].startswith("https://cdn.modrinth.com/"))
        lock = json.loads((dist / "resolved.json").read_text())
        self.assertEqual(len(lock["missing_optional"]), 1)
        report = (dist / "report.md").read_text()
        self.assertIn("fabric-only", report)

    def test_extra_deps(self):
        code, dist = self.run_build([
            {"slug": "core", "extra_deps": [["nope", "shinylib"]]},
            {"slug": "new-name", "optional": True, "extra_deps": ["nope"]},
        ])
        self.assertEqual(code, 0)
        index, _ = self.index(dist)
        files = {f["path"]: f for f in index["files"]}
        self.assertEqual(sorted(files), ["mods/P_CORE-5.0.jar", "mods/P_LIB-2.0.jar", "mods/P_SHINYLIB-0.9.jar"])
        self.assertEqual(files["mods/P_SHINYLIB-0.9.jar"]["env"], {"client": "required", "server": "required"})
        self.assertIn("undeclared dependency nope", (dist / "report.md").read_text())

    def test_pin(self):
        code, dist = self.run_build([{"slug": "lib", "pin": "1.0"}, {"slug": "core"}])
        self.assertEqual(code, 0)
        index, _ = self.index(dist)
        self.assertEqual([f["path"] for f in index["files"]], ["mods/P_CORE-5.0.jar", "mods/P_LIB-1.0.jar"])

    def test_required_missing_fails(self):
        code, dist = self.run_build([{"slug": "core"}, {"slug": "fabric-only"}])
        self.assertEqual(code, 1)
        self.assertFalse((dist / "TEST-0.1.mrpack").exists())
        self.assertIn("REQUIRED mod unavailable", (dist / "report.md").read_text())

    def test_missing_dependency_fails(self):
        code, _ = self.run_build([{"slug": "bad"}])
        self.assertEqual(code, 1)

    def test_optional_with_missing_dependency_is_dropped(self):
        code, dist = self.run_build([{"slug": "core"}, {"slug": "bad", "optional": True}])
        self.assertEqual(code, 0)
        index, _ = self.index(dist)
        self.assertEqual(sorted(f["path"] for f in index["files"]), ["mods/P_CORE-5.0.jar", "mods/P_LIB-2.0.jar"])
        self.assertIn("P_MISSING", (dist / "report.md").read_text())

    def test_incompatible_fails(self):
        code, dist = self.run_build([{"slug": "core"}, {"slug": "hater"}])
        self.assertEqual(code, 1)
        self.assertIn("incompatible", (dist / "report.md").read_text())


class PackContentTests(unittest.TestCase):
    """Static checks on the real pack definition and overrides."""
    ROOT = Path(__file__).resolve().parent.parent

    def test_mods_json(self):
        mods = json.loads((self.ROOT / "mods.json").read_text())["mods"]
        slugs = [m["slug"] for m in mods]
        self.assertEqual(len(slugs), len(set(slugs)), "duplicate slugs")
        for m in mods:
            self.assertIn(m.get("side", "auto"), {"auto", "both", "client", "server"}, m["slug"])
            self.assertIn(m.get("type", "mod"), build.CONTENT_TYPES, m["slug"])

    def test_json_files_parse(self):
        for p in (self.ROOT / "overrides").rglob("*.json"):
            json.loads(p.read_text(encoding="utf-8"))

    def test_functions_reference_existing_functions(self):
        data = self.ROOT / "overrides/kubejs/data"
        funcs = {f"{p.relative_to(data).parts[0]}:{'/'.join(p.relative_to(data).parts[2:])[:-len('.mcfunction')]}"
                 for p in data.rglob("*.mcfunction")}
        import re
        refs = set()
        for p in list(data.rglob("*.mcfunction")) + list(data.rglob("*.json")) + list((self.ROOT / "overrides/kubejs").rglob("*.js")):
            refs |= set(re.findall(r"(?:function|\"function\":)\s*\"?(wyrmfall:[a-z_/]+)", p.read_text(encoding="utf-8")))
        refs |= set(json.loads((data / "minecraft/tags/functions/load.json").read_text())["values"])
        self.assertTrue(refs)
        self.assertEqual(refs - funcs, set())

    def test_advancement_revokes_match(self):
        data = self.ROOT / "overrides/kubejs/data/wyrmfall"
        for adv in (data / "advancements").glob("*.json"):
            fn = json.loads(adv.read_text())["rewards"]["function"].split(":")[1]
            text = (data / "functions" / f"{fn}.mcfunction").read_text()
            self.assertIn(f"advancement revoke @s only wyrmfall:{adv.stem}", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
