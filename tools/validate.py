#!/usr/bin/env python3
"""Offline compile check: expands #include like Iris/OptiFine (absolute paths from the
shaders/ root, include guards honoured by the GLSL preprocessor), injects the macros the
loaders define, and compiles each stage with glslangValidator.
Usage: tools/validate.py [-D NAME[=VAL] ...] [program-filter]"""
import os, re, subprocess, sys, tempfile

ROOT = os.environ.get("SHADER_ROOT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shaders")
LOADER_MACROS = """#define MC_VERSION 12100
#define MC_GL_VERSION 460
#define MC_GLSL_VERSION 460
#define IS_IRIS
#define MC_RENDER_STAGE_NONE 0
#define MC_RENDER_STAGE_SKY 1
#define MC_RENDER_STAGE_SUNSET 2
#define MC_RENDER_STAGE_CUSTOM_SKY 3
#define MC_RENDER_STAGE_SUN 4
#define MC_RENDER_STAGE_MOON 5
#define MC_RENDER_STAGE_STARS 6
#define MC_RENDER_STAGE_VOID 7
#define MC_RENDER_STAGE_TERRAIN_SOLID 8
#define MC_RENDER_STAGE_TERRAIN_CUTOUT_MIPPED 9
#define MC_RENDER_STAGE_TERRAIN_CUTOUT 10
#define MC_RENDER_STAGE_ENTITIES 11
#define MC_RENDER_STAGE_BLOCK_ENTITIES 12
#define MC_RENDER_STAGE_DESTROY 13
#define MC_RENDER_STAGE_OUTLINE 14
#define MC_RENDER_STAGE_DEBUG 15
#define MC_RENDER_STAGE_HAND_SOLID 16
#define MC_RENDER_STAGE_TERRAIN_TRANSLUCENT 17
#define MC_RENDER_STAGE_TRIPWIRE 18
#define MC_RENDER_STAGE_PARTICLES 19
#define MC_RENDER_STAGE_CLOUDS 20
#define MC_RENDER_STAGE_RAIN_SNOW 21
#define MC_RENDER_STAGE_WORLD_BORDER 22
#define MC_RENDER_STAGE_HAND_TRANSLUCENT 23
"""
STAGES = {".vsh": "vert", ".gsh": "geom", ".fsh": "frag"}
INC = re.compile(r'^\s*#include\s+"([^"]+)"')


def expand(path, seen_stack):
    out = []
    with open(path) as f:
        for line in f:
            m = INC.match(line)
            if m:
                inc = m.group(1)
                target = os.path.join(ROOT, inc.lstrip("/")) if inc.startswith("/") else os.path.join(os.path.dirname(path), inc)
                target = os.path.normpath(target)
                if target in seen_stack:
                    raise RuntimeError(f"recursive include {target}")
                out.append(expand(target, seen_stack + [target]))
            else:
                out.append(line)
    return "".join(out)


def build_source(path, extra):
    src = expand(path, [path])
    lines = src.split("\n", 1)
    defs = "".join(f"#define {d.replace('=', ' ', 1)}\n" for d in extra)
    return lines[0] + "\n" + LOADER_MACROS + defs + "#line 2\n" + (lines[1] if len(lines) > 1 else "")


def main():
    args = sys.argv[1:]
    extra, filt = [], None
    while args:
        a = args.pop(0)
        if a == "-D":
            extra.append(args.pop(0))
        else:
            filt = a
    failures = 0
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for dim in ("", "world-1", "world1"):
            d = os.path.join(ROOT, dim) if dim else ROOT
            for name in sorted(os.listdir(d)):
                ext = os.path.splitext(name)[1]
                if ext not in STAGES or (filt and filt not in name):
                    continue
                total += 1
                src = build_source(os.path.join(d, name), extra)
                tmpf = os.path.join(tmp, name + ".glsl")
                with open(tmpf, "w") as f:
                    f.write(src)
                r = subprocess.run(["glslangValidator", "-S", STAGES[ext], tmpf], capture_output=True, text=True)
                if r.returncode != 0:
                    failures += 1
                    print(f"--- FAIL {dim or 'root'}/{name}")
                    print("\n".join(l for l in r.stdout.splitlines() if "ERROR" in l or "error" in l)[:4000])
    print(f"{total - failures}/{total} stages compiled")
    # link check: interface matching across vsh -> (gsh) -> fsh
    link_fail = 0
    links = 0
    with tempfile.TemporaryDirectory() as tmp:
        for dim in ("", "world-1", "world1"):
            d = os.path.join(ROOT, dim) if dim else ROOT
            progs = sorted({os.path.splitext(n)[0] for n in os.listdir(d) if n.endswith(".fsh")})
            for prog in progs:
                if filt and filt not in prog:
                    continue
                files = []
                for ext, st in ((".vsh", "vert"), (".gsh", "geom"), (".fsh", "frag")):
                    path = os.path.join(d, prog + ext)
                    if os.path.exists(path):
                        out = os.path.join(tmp, f"{dim}_{prog}.{st}")
                        with open(out, "w") as f:
                            f.write(build_source(path, extra))
                        files.append(out)
                links += 1
                r = subprocess.run(["glslangValidator", "-l"] + files, capture_output=True, text=True)
                if r.returncode != 0:
                    link_fail += 1
                    print(f"--- LINK FAIL {dim or 'root'}/{prog}")
                    print("\n".join(l for l in r.stdout.splitlines() if "ERROR" in l or "error" in l)[:3000])
    print(f"{links - link_fail}/{links} programs linked")
    failures += link_fail
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
