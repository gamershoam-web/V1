#!/usr/bin/env python3
"""Generates the per-program entry files (shaders/<dim>/<program>.<stage>) that include
the shared implementations in shaders/programs/. Re-run after adding a program."""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shaders")
VERSION = "#version 430 compatibility"

# program name -> (source file, extra defines, stages)
PROGRAMS = {
    "shadow":                   ("shadow",               [],                    ("vsh", "gsh", "fsh")),
    "gbuffers_basic":           ("gbuffers_opaque",      ["G_BASIC"],           ("vsh", "fsh")),
    "gbuffers_line":            ("gbuffers_opaque",      ["G_BASIC"],           ("vsh", "fsh")),
    "gbuffers_terrain":         ("gbuffers_opaque",      ["G_TERRAIN"],         ("vsh", "fsh")),
    "gbuffers_block":           ("gbuffers_opaque",      ["G_BLOCK"],           ("vsh", "fsh")),
    "gbuffers_entities":        ("gbuffers_opaque",      ["G_ENTITIES"],        ("vsh", "fsh")),
    "gbuffers_entities_glowing":("gbuffers_opaque",      ["G_ENTITIES"],        ("vsh", "fsh")),
    "gbuffers_hand":            ("gbuffers_opaque",      ["G_HAND"],            ("vsh", "fsh")),
    "gbuffers_spidereyes":      ("gbuffers_opaque",      ["G_EMISSIVE"],        ("vsh", "fsh")),
    "gbuffers_beaconbeam":      ("gbuffers_opaque",      ["G_EMISSIVE"],        ("vsh", "fsh")),
    "gbuffers_water":           ("gbuffers_translucent", ["G_WATER"],           ("vsh", "fsh")),
    "gbuffers_hand_water":      ("gbuffers_translucent", ["G_WATER"],           ("vsh", "fsh")),
    "gbuffers_textured":        ("gbuffers_translucent", ["G_PARTICLES"],       ("vsh", "fsh")),
    "gbuffers_textured_lit":    ("gbuffers_translucent", ["G_PARTICLES"],       ("vsh", "fsh")),
    "gbuffers_weather":         ("gbuffers_translucent", ["G_WEATHER"],         ("vsh", "fsh")),
    "gbuffers_armor_glint":     ("gbuffers_translucent", ["G_GLINT"],           ("vsh", "fsh")),
    "gbuffers_skybasic":        ("gbuffers_discard",     [],                    ("vsh", "fsh")),
    "gbuffers_skytextured":     ("gbuffers_discard",     [],                    ("vsh", "fsh")),
    "gbuffers_clouds":          ("gbuffers_discard",     [],                    ("vsh", "fsh")),
    "gbuffers_damagedblock":    ("gbuffers_damaged",     [],                    ("vsh", "fsh")),
    "deferred":                 ("deferred_ptgi",        [],                    ("vsh", "fsh")),
    "deferred1":                ("deferred_temporal",    [],                    ("vsh", "fsh")),
    "deferred2":                ("deferred_atrous",      ["ATROUS_STEP 1"],     ("vsh", "fsh")),
    "deferred3":                ("deferred_atrous",      ["ATROUS_STEP 2"],     ("vsh", "fsh")),
    "deferred4":                ("deferred_atrous",      ["ATROUS_STEP 4"],     ("vsh", "fsh")),
    "deferred5":                ("deferred_atrous",      ["ATROUS_STEP 8"],     ("vsh", "fsh")),
    "deferred6":                ("deferred_lighting",    [],                    ("vsh", "fsh")),
    "composite":                ("composite_vl",         [],                    ("vsh", "fsh")),
    "composite1":               ("composite_main",       [],                    ("vsh", "fsh")),
    "composite2":               ("composite_taa",        [],                    ("vsh", "fsh")),
    "composite3":               ("composite_bloom",      ["BLOOM_PASS 0"],      ("vsh", "fsh")),
    "composite4":               ("composite_bloom",      ["BLOOM_PASS 1"],      ("vsh", "fsh")),
    "composite5":               ("composite_bloom",      ["BLOOM_PASS 2"],      ("vsh", "fsh")),
    "final":                    ("final",                [],                    ("vsh", "fsh")),
}

DIMENSIONS = {"": [], "world-1": ["DIM_NETHER"], "world1": ["DIM_END"]}
STAGE_MACRO = {"vsh": "VSH", "gsh": "GSH", "fsh": "FSH"}


def main():
    count = 0
    for dim, dim_defs in DIMENSIONS.items():
        out_dir = os.path.join(ROOT, dim) if dim else ROOT
        os.makedirs(out_dir, exist_ok=True)
        for name, (src, defs, stages) in PROGRAMS.items():
            for stage in stages:
                lines = [VERSION, f"#define {STAGE_MACRO[stage]}"]
                lines += [f"#define {d}" for d in dim_defs + defs]
                lines.append(f'#include "/programs/{src}.glsl"')
                with open(os.path.join(out_dir, f"{name}.{stage}"), "w", newline="\n") as f:
                    f.write("\n".join(lines) + "\n")
                count += 1
    print(f"wrote {count} program entry files")


if __name__ == "__main__":
    main()
