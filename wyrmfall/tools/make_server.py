#!/usr/bin/env python3
"""Turn a WYRMFALL .mrpack into a ready-to-run Forge server folder.

  python make_server.py dist/WYRMFALL-1.0.0.mrpack --out server

Downloads every file the pack marks as needed on the server, checks each
SHA-512, copies the overrides, installs Forge, and accepts the Minecraft EULA
(you agree to it by running this: https://aka.ms/MinecraftEULA).
Start the server with ./run.sh (Linux/macOS) or run.bat (Windows).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

USER_AGENT = "wyrmfall-modpack-builder/1.0"
FORGE_MAVEN = "https://maven.minecraftforge.net/net/minecraftforge/forge"


def download(url: str, dest: Path) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return data
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  ... retrying {url} ({e})", flush=True)
    raise AssertionError("unreachable")


def safe_join(root: Path, rel: str) -> Path:
    p = PurePosixPath(rel)
    if p.is_absolute() or ".." in p.parts:
        raise ValueError(f"unsafe path in pack: {rel}")
    return root.joinpath(*p.parts)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mrpack", type=Path)
    ap.add_argument("--out", type=Path, default=Path("server"))
    ap.add_argument("--memory", default="6G", help="max heap for the server (default 6G)")
    ap.add_argument("--skip-forge", action="store_true", help="do not download/run the Forge installer")
    args = ap.parse_args(argv)

    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.mrpack) as z:
        index = json.loads(z.read("modrinth.index.json"))
        for prefix in ("overrides/", "server-overrides/"):
            for name in z.namelist():
                if name.startswith(prefix) and not name.endswith("/"):
                    dest = safe_join(out, name[len(prefix):])
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(z.read(name))

    files = [f for f in index["files"] if f.get("env", {}).get("server", "required") != "unsupported"]
    print(f"== {index['name']} {index['versionId']}: {len(files)} server files", flush=True)
    for f in files:
        dest = safe_join(out, f["path"])
        if dest.exists() and hashlib.sha512(dest.read_bytes()).hexdigest() == f["hashes"]["sha512"]:
            continue
        data = download(f["downloads"][0], dest)
        if hashlib.sha512(data).hexdigest() != f["hashes"]["sha512"]:
            dest.unlink()
            print(f"!! hash mismatch for {f['path']}", file=sys.stderr)
            return 1
        print(f"  + {f['path']}", flush=True)

    deps = index["dependencies"]
    if "forge" in deps and not args.skip_forge:
        full = f"{deps['minecraft']}-{deps['forge']}"
        installer = out / f"forge-{full}-installer.jar"
        if not (out / "run.sh").exists():
            print(f"== installing Forge {full}", flush=True)
            download(f"{FORGE_MAVEN}/{full}/forge-{full}-installer.jar", installer)
            log_path = out / "forge-installer-output.log"
            with log_path.open("w", encoding="utf-8") as fh:
                result = subprocess.run(["java", "-jar", installer.name, "--installServer"], cwd=out,
                                        stdout=fh, stderr=subprocess.STDOUT)
            if result.returncode != 0:
                print("\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-60:]))
                print("!! Forge installer failed", file=sys.stderr)
                return 1
            log_path.unlink()
            installer.unlink(missing_ok=True)
            for leftover in out.glob("*installer.jar.log"):
                leftover.unlink()
    (out / "user_jvm_args.txt").write_text(f"-Xms2G\n-Xmx{args.memory}\n", encoding="utf-8")
    (out / "eula.txt").write_text("eula=true\n", encoding="utf-8")
    props = out / "server.properties"
    if not props.exists():
        props.write_text("motd=\\u00A74\\u00A7lWYRMFALL \\u00A78| \\u00A77The sky burns.\ndifficulty=hard\nallow-flight=true\nview-distance=10\n", encoding="utf-8")
    print(f"== server ready in {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
