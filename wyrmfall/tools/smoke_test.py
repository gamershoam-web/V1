#!/usr/bin/env python3
"""Boot a WYRMFALL server, prove it works, shut it down.

  python smoke_test.py server/

Passes only if:
  * Forge loads every mod and the world generates ("Done (...)!"),
  * WYRMFALL's KubeJS items exist and its datapack functions run,
  * the KubeJS logs contain no script errors,
  * the server log has no errors mentioning WYRMFALL's own content,
  * the server stops cleanly.
"""
from __future__ import annotations

import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

BOOT_TIMEOUT = 25 * 60
CHECKS = [
    # (console command, text that must appear, text that must NOT appear)
    ("difficulty", "The difficulty is Hard", None),
    ("scoreboard objectives list", "[Heart Crystals]", None),
    ("function wyrmfall:hearts/sync", "Executed", "Unknown function"),
    ("function wyrmfall:hearts/apply", "Executed", "Unknown function"),
    ("give @a kubejs:heart_crystal", "No player was found", "Unknown item"),
    ("give @a kubejs:heart_shard", "No player was found", "Unknown item"),
]
OWN_CONTENT = re.compile(r"wyrmfall|kubejs:heart", re.I)
BAD_LEVEL = re.compile(r"/(ERROR|WARN)\]|\[(ERROR|WARN)\]")


def main() -> int:
    server = Path(sys.argv[1] if len(sys.argv) > 1 else "server").resolve()
    transcript = server / "smoke-console.log"
    cmd = ["bash", "run.sh", "nogui"] if (server / "run.sh").exists() else ["cmd", "/c", "run.bat", "nogui"]
    proc = subprocess.Popen(cmd, cwd=server, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", bufsize=1)
    lines: "queue.Queue[str | None]" = queue.Queue()
    history: list[str] = []

    def pump():
        with transcript.open("w", encoding="utf-8") as fh:
            for line in proc.stdout:  # type: ignore[union-attr]
                fh.write(line)
                fh.flush()
                lines.put(line.rstrip("\n"))
        lines.put(None)

    threading.Thread(target=pump, daemon=True).start()
    failures: list[str] = []

    def read_until(pattern: str | None, timeout: float) -> bool:
        end = time.time() + timeout
        while time.time() < end:
            try:
                line = lines.get(timeout=1)
            except queue.Empty:
                continue
            if line is None:
                return False
            history.append(line)
            if "Loading" in line and "mods" in line or "Done (" in line or "Preparing spawn area" in line:
                print("   " + line[-160:], flush=True)
            if pattern and pattern in line:
                return True
        return pattern is None

    def send(command: str) -> None:
        proc.stdin.write(command + "\n")  # type: ignore[union-attr]
        proc.stdin.flush()  # type: ignore[union-attr]

    print(f"== booting {server}", flush=True)
    started = time.time()
    if not read_until("Done (", BOOT_TIMEOUT):
        failures.append("server did not finish starting (crashed or timed out)")
    else:
        print(f"== server up in {time.time() - started:.0f}s; running checks", flush=True)
        mark = len(history)
        for command, _, _ in CHECKS:
            send(command)
            read_until(None, 3)
        read_until(None, 5)
        output = "\n".join(history[mark:])
        for command, must, must_not in CHECKS:
            ok = must in output and not (must_not and must_not in output)
            print(f"   [{'ok' if ok else 'FAIL'}] {command}", flush=True)
            if not ok:
                failures.append(f"check failed: `{command}` (expected '{must}')")
        send("stop")
        if not read_until("All dimensions are saved", 180):
            failures.append("server did not stop cleanly")

    try:
        proc.wait(timeout=120)
    except subprocess.TimeoutExpired:
        proc.kill()
        failures.append("server process had to be killed")

    # Mod list summary from the Forge log.
    latest = server / "logs" / "latest.log"
    log_text = latest.read_text(encoding="utf-8", errors="replace") if latest.exists() else ""
    m = re.search(r"Found (\d+) mods? ", log_text) or re.search(r"Loading (\d+) mods", log_text)
    if m:
        print(f"== Forge loaded {m.group(1)} mods", flush=True)

    own_errors = [l for l in log_text.splitlines() if BAD_LEVEL.search(l) and OWN_CONTENT.search(l)]
    for l in own_errors:
        failures.append("server log: " + l.strip()[:300])

    kube_dir = server / "logs" / "kubejs"
    for kl in sorted(kube_dir.glob("*.log")) if kube_dir.exists() else []:
        text = kl.read_text(encoding="utf-8", errors="replace")
        print(f"== {kl.name}\n" + "\n".join("   " + l for l in text.splitlines()[-40:]), flush=True)
        for l in text.splitlines():
            if re.search(r"\[(ERROR|ERR)\s*\]|\bError(?: in|:)", l):
                failures.append(f"kubejs/{kl.name}: " + l.strip()[:300])

    crashes = sorted((server / "crash-reports").glob("*.txt")) if (server / "crash-reports").exists() else []
    for c in crashes:
        print(f"== CRASH REPORT {c.name}\n" + c.read_text(encoding="utf-8", errors="replace")[:6000], flush=True)
        failures.append(f"crash report written: {c.name}")

    if failures and not crashes:
        print("== last 80 console lines:\n" + "\n".join(history[-80:]), flush=True)
    if failures:
        print(f"!! SMOKE TEST FAILED ({len(failures)})", flush=True)
        for f in failures:
            print("   - " + f, flush=True)
        return 1
    print("== SMOKE TEST PASSED", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
