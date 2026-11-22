#!/usr/bin/env python3
"""Build the WYRMFALL .mrpack.

Reads pack.json and mods.json, resolves every entry on Modrinth for the pack's
Minecraft version and loader, follows required dependencies, decides which side
(client / server) each file belongs on, and writes:

  dist/<NAME>-<version>.mrpack   importable in Modrinth App, Prism, ATLauncher...
  dist/resolved.json             exact versions and hashes (a lock file)
  dist/report.md                 human-readable mod list, warnings, misses

Exit code is 1 if a non-optional mod, or a required dependency, cannot be
resolved, or if two resolved mods declare each other incompatible.

Only the Python standard library is used.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

PACK_DIR = Path(__file__).resolve().parent.parent
USER_AGENT = "wyrmfall-modpack-builder/1.0"
FORGE_PROMOS = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
# Hosts the .mrpack spec lets launchers download from.
ALLOWED_DOWNLOAD_HOSTS = {"cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "gitlab.com"}
TYPE_RANK = {"release": 0, "beta": 1, "alpha": 2}
CONTENT_TYPES = {
    # type: (folder in the instance, loader filter; None = the pack's loader)
    "mod": ("mods", None),
    "shader": ("shaderpacks", "iris"),
    "resourcepack": ("resourcepacks", "minecraft"),
}


def log(msg: str) -> None:
    print(msg, flush=True)


class Modrinth:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.cache: dict[str, object] = {}

    def get(self, path: str, params: dict | None = None):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode({k: json.dumps(v) for k, v in params.items()})
        if url in self.cache:
            return self.cache[url]
        delay = 1.0
        for attempt in range(6):
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.load(resp)
                self.cache[url] = data
                return data
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    self.cache[url] = None
                    return None
                if e.code == 429 or e.code >= 500:
                    reset = e.headers.get("X-Ratelimit-Reset")
                    wait = float(reset) + 1 if reset and reset.isdigit() else delay
                    log(f"  ... HTTP {e.code} on {path}, retrying in {wait:.0f}s")
                    time.sleep(wait)
                    delay *= 2
                    continue
                raise
            except (urllib.error.URLError, TimeoutError) as e:
                log(f"  ... network error on {path} ({e}), retrying in {delay:.0f}s")
                time.sleep(delay)
                delay *= 2
        raise RuntimeError(f"Modrinth did not answer: {url}")

    def project(self, id_or_slug: str):
        return self.get(f"/project/{urllib.parse.quote(id_or_slug)}")

    def versions(self, id_or_slug: str, loader: str, game_version: str):
        return self.get(
            f"/project/{urllib.parse.quote(id_or_slug)}/version",
            {"loaders": [loader], "game_versions": [game_version]},
        ) or []

    def version(self, version_id: str):
        return self.get(f"/version/{urllib.parse.quote(version_id)}")


def pick_version(versions: list[dict], pin: str | None = None) -> dict | None:
    if not versions:
        return None
    if pin:
        for v in versions:
            if pin in (v.get("version_number"), v.get("id")):
                return v
        return None
    best = min(TYPE_RANK.get(v.get("version_type"), 3) for v in versions)
    pool = [v for v in versions if TYPE_RANK.get(v.get("version_type"), 3) == best]
    return max(pool, key=lambda v: v.get("date_published", ""))


def primary_file(version: dict) -> dict:
    files = version.get("files") or []
    if not files:
        raise ValueError(f"version {version.get('id')} has no files")
    for f in files:
        if f.get("primary"):
            return f
    return files[0]


def supported_sides(project: dict) -> set[str]:
    sides = set()
    if project.get("client_side", "required") != "unsupported":
        sides.add("client")
    if project.get("server_side", "required") != "unsupported":
        sides.add("server")
    return sides


def resolve_forge(pack: dict, override: str | None) -> str:
    if override:
        return override
    if pack.get("loader_version", "auto") != "auto":
        return pack["loader_version"]
    url = os.environ.get("FORGE_PROMOS_URL", FORGE_PROMOS)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as resp:
            promos = json.load(resp)["promos"]
        mc = pack["minecraft"]
        found = promos.get(f"{mc}-recommended") or promos.get(f"{mc}-latest")
        if found:
            return found
    except Exception as e:  # noqa: BLE001 - any failure falls back
        log(f"  ! could not read Forge promotions ({e}); using fallback")
    return pack["loader_fallback"]


class Resolver:
    def __init__(self, api: Modrinth, loader: str, game_version: str):
        self.api = api
        self.loader = loader
        self.gv = game_version
        self.nodes: dict[str, dict] = {}  # project id -> node
        self.edges: list[tuple[str, str]] = []  # (parent id, dependency id)
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.missing_optional: list[dict] = []

    def _loader_for(self, ctype: str) -> str:
        return CONTENT_TYPES[ctype][1] or self.loader

    def add_explicit(self, entry: dict) -> None:
        ctype = entry.get("type", "mod")
        if ctype not in CONTENT_TYPES:
            self.errors.append(f"{entry['slug']}: unknown type {ctype!r}")
            return
        loader = self._loader_for(ctype)
        tried = []
        for slug in [entry["slug"], *entry.get("alts", [])]:
            project = self.api.project(slug)
            if project is None:
                tried.append(f"{slug} (not on Modrinth)")
                continue
            versions = self.api.versions(project["id"], loader, self.gv)
            version = pick_version(versions, entry.get("pin"))
            if version is None:
                what = f"pin {entry['pin']} not found" if entry.get("pin") and versions else f"no {loader} {self.gv} build"
                tried.append(f"{slug} ({what})")
                continue
            if slug != entry["slug"]:
                self.warnings.append(f"{entry['slug']}: resolved through alternative slug '{slug}'")
            support = supported_sides(project)
            side = entry.get("side", "auto")
            wanted = {"client": {"client"}, "server": {"server"}}.get(side, {"client", "server"})
            sides = wanted & support
            if not sides:
                self.warnings.append(f"{project['slug']}: wanted side {side} but project supports {sorted(support) or 'none'}; skipped")
                return
            before_nodes, before_edges, before_errors = set(self.nodes), len(self.edges), len(self.errors)
            self._add_node(project, version, ctype, sides, entry=entry)
            for extra in entry.get("extra_deps", []):
                self._add_extra_dependency(project["id"], extra if isinstance(extra, list) else [extra])
            if entry.get("optional") and len(self.errors) > before_errors:
                # An optional mod whose dependencies cannot be met is dropped
                # as a whole instead of failing the build.
                problems = self.errors[before_errors:]
                del self.errors[before_errors:]
                del self.edges[before_edges:]
                added = set(self.nodes) - before_nodes
                for pid in added:
                    del self.nodes[pid]
                for node in self.nodes.values():
                    node["required_by"] -= added
                self.missing_optional.append({"entry": entry, "reason": f"{entry['slug']}: " + "; ".join(problems)})
            return
        msg = f"{entry['slug']}: " + "; ".join(tried)
        if entry.get("optional"):
            self.missing_optional.append({"entry": entry, "reason": msg})
        else:
            self.errors.append("REQUIRED mod unavailable: " + msg)

    def _add_extra_dependency(self, parent_pid: str, slugs: list[str]) -> None:
        """A dependency the mod needs at runtime but does not declare on Modrinth."""
        for slug in slugs:
            project = self.api.project(slug)
            if project is None:
                continue
            version = pick_version(self.api.versions(project["id"], self.loader, self.gv))
            if version is None:
                continue
            self.edges.append((parent_pid, project["id"]))
            self._add_node(project, version, "mod", set(), parent=parent_pid)
            return
        self.errors.append(
            f"{self.nodes[parent_pid]['project']['slug']}: undeclared dependency {' / '.join(slugs)} has no {self.loader} {self.gv} build"
        )

    def _add_node(self, project, version, ctype, sides, entry=None, parent=None):
        pid = project["id"]
        node = self.nodes.get(pid)
        if node is None:
            node = {
                "project": project,
                "version": version,
                "type": ctype,
                "sides": set(sides),
                "entry": entry,
                "required_by": set(),
            }
            self.nodes[pid] = node
            self._follow_dependencies(pid)
        else:
            node["sides"] |= set(sides)
            if entry is not None and node["entry"] is None:
                # Listed explicitly after being pulled in as a dependency:
                # the explicit choice (and pin) wins.
                node["entry"] = entry
                if entry.get("pin") and node["version"]["id"] != version["id"]:
                    node["version"] = version
                    self._follow_dependencies(pid)
        if parent:
            node["required_by"].add(parent)
        return node

    def _follow_dependencies(self, pid: str) -> None:
        node = self.nodes[pid]
        for dep in node["version"].get("dependencies") or []:
            if dep.get("dependency_type") != "required":
                continue
            dep_pid = dep.get("project_id")
            if not dep_pid and dep.get("version_id"):
                v = self.api.version(dep["version_id"])
                dep_pid = v and v.get("project_id")
            if not dep_pid:
                self.warnings.append(f"{node['project']['slug']}: dependency without project id ({dep.get('file_name')}); ignored")
                continue
            self.edges.append((pid, dep_pid))
            if dep_pid in self.nodes:
                self.nodes[dep_pid]["required_by"].add(pid)
                continue
            dep_project = self.api.project(dep_pid)
            if dep_project is None:
                self.errors.append(f"{node['project']['slug']}: required dependency {dep_pid} is not on Modrinth")
                continue
            versions = self.api.versions(dep_pid, self.loader, self.gv)
            dep_version = pick_version(versions)
            if dep_version is None and dep.get("version_id"):
                v = self.api.version(dep["version_id"])
                if v and self.loader in v.get("loaders", []) and self.gv in v.get("game_versions", []):
                    dep_version = v
            if dep_version is None:
                self.errors.append(
                    f"{node['project']['slug']}: required dependency {dep_project['slug']} has no {self.loader} {self.gv} build"
                )
                continue
            self._add_node(dep_project, dep_version, "mod", set(), parent=pid)

    def finalize(self) -> list[dict]:
        # Propagate sides down the dependency graph: a library is needed on
        # every side that one of its dependents runs on (if it supports it).
        changed = True
        while changed:
            changed = False
            for parent, dep in self.edges:
                if parent not in self.nodes or dep not in self.nodes:
                    continue
                add = self.nodes[parent]["sides"] & supported_sides(self.nodes[dep]["project"])
                if not add <= self.nodes[dep]["sides"]:
                    self.nodes[dep]["sides"] |= add
                    changed = True
        result = []
        for pid, node in self.nodes.items():
            if not node["sides"]:
                self.warnings.append(f"{node['project']['slug']}: not needed on any side; left out")
                continue
            result.append(node)
        # Incompatibilities between resolved projects.
        for node in result:
            for dep in node["version"].get("dependencies") or []:
                if dep.get("dependency_type") == "incompatible" and dep.get("project_id") in self.nodes:
                    other = self.nodes[dep["project_id"]]["project"]["slug"]
                    self.errors.append(f"{node['project']['slug']} declares itself incompatible with {other}")
        return sorted(result, key=lambda n: n["project"]["slug"])


def file_entry(node: dict) -> dict:
    f = primary_file(node["version"])
    url = f["url"]
    host = urllib.parse.urlparse(url).hostname
    if host not in ALLOWED_DOWNLOAD_HOSTS:
        raise ValueError(f"{node['project']['slug']}: download host {host} is not allowed in .mrpack")
    folder = CONTENT_TYPES[node["type"]][0]
    optional = bool(node["entry"] and node["entry"].get("optional_install"))
    present = "optional" if optional else "required"
    return {
        "path": f"{folder}/{f['filename']}",
        "hashes": {"sha1": f["hashes"]["sha1"], "sha512": f["hashes"]["sha512"]},
        "env": {
            "client": present if "client" in node["sides"] else "unsupported",
            "server": present if "server" in node["sides"] else "unsupported",
        },
        "downloads": [url],
        "fileSize": f["size"],
    }


def write_mrpack(out: Path, index: dict, overrides: Path) -> None:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("modrinth.index.json", json.dumps(index, indent=2))
        if overrides.is_dir():
            for path in sorted(overrides.rglob("*")):
                if path.is_file():
                    z.write(path, "overrides/" + path.relative_to(overrides).as_posix())


def side_label(sides: set[str]) -> str:
    return "both" if sides == {"client", "server"} else next(iter(sides))


def write_report(path: Path, pack: dict, forge: str, nodes: list[dict], r: Resolver) -> str:
    explicit = [n for n in nodes if n["entry"]]
    libs = [n for n in nodes if not n["entry"]]
    lines = [
        f"# {pack['name']} {pack['version']}",
        "",
        f"Minecraft **{pack['minecraft']}**, Forge **{forge}**. "
        f"**{len(explicit)}** chosen mods + **{len(libs)}** libraries = **{len(nodes)}** files.",
        "",
    ]
    if r.errors:
        lines += ["## Errors", ""] + [f"- {e}" for e in r.errors] + [""]
    by_cat: dict[str, list[dict]] = {}
    for n in explicit:
        by_cat.setdefault(n["entry"].get("category", "Other"), []).append(n)
    for cat, items in by_cat.items():
        lines += [f"## {cat}", "", "| Mod | Version | Side | Why |", "|---|---|---|---|"]
        for n in items:
            p = n["project"]
            lines.append(
                f"| [{p['title']}](https://modrinth.com/project/{p['slug']}) | {n['version']['version_number']} "
                f"| {side_label(n['sides'])} | {n['entry'].get('why', '')} |"
            )
        lines.append("")
    if libs:
        lines += ["## Libraries pulled in as dependencies", ""]
        for n in libs:
            by = sorted(r.nodes[x]["project"]["slug"] for x in n["required_by"] if x in r.nodes)
            lines.append(f"- {n['project']['title']} {n['version']['version_number']} ({side_label(n['sides'])}), needed by {', '.join(by)}")
        lines.append("")
    if r.missing_optional:
        lines += ["## Optional mods skipped (no compatible build on Modrinth)", ""]
        lines += [f"- {m['reason']}" for m in r.missing_optional] + [""]
    if r.warnings:
        lines += ["## Warnings", ""] + [f"- {w}" for w in r.warnings] + [""]
    text = "\n".join(lines)
    path.write_text(text, encoding="utf-8")
    return text


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pack", type=Path, default=PACK_DIR / "pack.json")
    ap.add_argument("--mods", type=Path, default=PACK_DIR / "mods.json")
    ap.add_argument("--overrides", type=Path, default=PACK_DIR / "overrides")
    ap.add_argument("--out", type=Path, default=Path("dist"))
    ap.add_argument("--forge", help="Forge version to pin (default: pack.json / latest recommended)")
    ap.add_argument("--api", default=os.environ.get("MODRINTH_API", "https://api.modrinth.com/v2"))
    args = ap.parse_args(argv)

    pack = json.loads(args.pack.read_text(encoding="utf-8"))
    entries = json.loads(args.mods.read_text(encoding="utf-8"))["mods"]
    args.out.mkdir(parents=True, exist_ok=True)

    forge = resolve_forge(pack, args.forge)
    log(f"== {pack['name']} {pack['version']}: Minecraft {pack['minecraft']}, {pack['loader']} {forge}")

    r = Resolver(Modrinth(args.api), pack["loader"], pack["minecraft"])
    for entry in entries:
        log(f"-> {entry['slug']}")
        r.add_explicit(entry)
    nodes = r.finalize()

    files = []
    for n in nodes:
        try:
            files.append(file_entry(n))
        except (ValueError, KeyError) as e:
            r.errors.append(str(e))
    paths = [f["path"] for f in files]
    for p in {p for p in paths if paths.count(p) > 1}:
        r.errors.append(f"two files would install to {p}")

    index = {
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": pack["version"],
        "name": pack["name"],
        "summary": pack["summary"],
        "files": sorted(files, key=lambda f: f["path"]),
        "dependencies": {"minecraft": pack["minecraft"], pack["loader"]: forge},
    }
    lock = {
        "minecraft": pack["minecraft"],
        pack["loader"]: forge,
        "projects": [
            {
                "slug": n["project"]["slug"],
                "title": n["project"]["title"],
                "project_id": n["project"]["id"],
                "version_id": n["version"]["id"],
                "version_number": n["version"]["version_number"],
                "explicit": bool(n["entry"]),
                "sides": sorted(n["sides"]),
            }
            for n in nodes
        ],
        "missing_optional": [m["reason"] for m in r.missing_optional],
    }
    (args.out / "resolved.json").write_text(json.dumps(lock, indent=2), encoding="utf-8")
    report = write_report(args.out / "report.md", pack, forge, nodes, r)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(report + "\n")

    for w in r.warnings:
        log(f"  warning: {w}")
    for m in r.missing_optional:
        log(f"  skipped optional: {m['reason']}")
    if r.errors:
        for e in r.errors:
            log(f"  ERROR: {e}")
        log(f"!! {len(r.errors)} error(s); no .mrpack written")
        return 1

    out = args.out / f"{pack['name']}-{pack['version']}.mrpack"
    write_mrpack(out, index, args.overrides)
    explicit = sum(1 for n in nodes if n["entry"])
    log(f"== wrote {out} ({explicit} mods + {len(nodes) - explicit} libraries, {len(r.missing_optional)} optional skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
