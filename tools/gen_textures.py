#!/usr/bin/env python3
"""Generates every texture used by the Lumen mod. Run from the repo root: python3 tools/gen_textures.py"""
import math
import os
import random

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "src", "main", "resources", "assets", "lumen", "textures")


def save(img, *path):
    full = os.path.join(ROOT, *path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full)


def clamp(v):
    return max(0, min(255, int(v)))


def mix(a, b, t):
    return tuple(clamp(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


# ---------------------------------------------------------------- Lumen orb
MOODS = {
    #           sclera glow       rim             iris            pupil shape
    "calm":    ((235, 252, 255), (120, 220, 255), (40, 170, 230), "round"),
    "uneasy":  ((255, 244, 214), (255, 180, 70), (220, 120, 20), "round"),
    "hostile": ((255, 200, 200), (170, 10, 30), (90, 0, 10), "slit"),
}


def orb(mood, blink):
    sclera, rim, iris, pupil = MOODS[mood]
    n = 32
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            dx, dy = (x - c) / c, (y - c) / c
            d = math.hypot(dx, dy)
            if d > 1.0:
                continue
            # Sphere shading: bright centre fading to coloured rim, highlight top-left.
            base = mix(sclera, rim, min(1.0, d ** 2.2))
            hl = max(0.0, 1.0 - math.hypot(dx + 0.38, dy + 0.42) / 0.32)
            col = mix(base, (255, 255, 255), hl * 0.8)
            alpha = 255 if d < 0.92 else clamp(255 * (1.0 - (d - 0.92) / 0.08))
            if blink:
                # Closed lid: a thin dark curved line across the middle.
                lid_y = 0.06 * (1 - dx * dx)
                if abs(dy - lid_y) < 0.07 and abs(dx) < 0.62:
                    col = mix(iris, (0, 0, 0), 0.4)
            else:
                ix, iy = dx / 0.42, dy / 0.42
                di = math.hypot(ix, iy)
                if di <= 1.0:
                    col = mix(iris, mix(iris, (255, 255, 255), 0.35), max(0, 1 - di) * 0.6)
                    if pupil == "round":
                        if di < 0.45:
                            col = (10, 14, 24)
                    else:
                        if abs(ix) < 0.18 * (1 - iy * iy) + 0.04:
                            col = (8, 0, 0)
                    # Catch-light in the pupil.
                    if math.hypot(ix + 0.3, iy + 0.35) < 0.18:
                        col = (255, 255, 255)
            px[x, y] = col + (alpha,)
    return img


for mood in MOODS:
    save(orb(mood, False), "entity", "lumen", f"orb_{mood}.png")
    save(orb(mood, True), "entity", "lumen", f"orb_{mood}_blink.png")

# Halo: soft radial glow, white centre fading to black (rendered additively and tinted per mood).
n = 64
halo = Image.new("RGBA", (n, n), (0, 0, 0, 0))
hp = halo.load()
c = (n - 1) / 2
for y in range(n):
    for x in range(n):
        d = math.hypot(x - c, y - c) / c
        v = max(0.0, 1.0 - d) ** 2.0
        hp[x, y] = (clamp(255 * v), clamp(255 * v), clamp(255 * v), clamp(255 * min(1.0, v * 1.5)))
save(halo, "entity", "lumen", "halo.png")

# ---------------------------------------------------------------- Hollow
rng = random.Random(1337)
hollow = Image.new("RGBA", (64, 32), (0, 0, 0, 255))
hpx = hollow.load()
for y in range(32):
    for x in range(64):
        v = rng.randint(6, 22)
        tint = (v + 3, v, v + 8)
        if rng.random() < 0.04:  # faint violet cracks
            tint = (40, 18, 60)
        hpx[x, y] = tint + (255,)
# Hollow mouth on the head's front face (head front = x 8..15, y 8..15).
for x in range(10, 14):
    hpx[x, 14] = (2, 0, 4, 255)
save(hollow, "entity", "hollow", "hollow.png")

eyes = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
ep = eyes.load()
# Same eye placement as the vanilla enderman eye layer (row 12 of the head's front face).
for (x, y) in [(8, 12), (10, 12), (13, 12), (15, 12)]:
    ep[x, y] = (120, 200, 240, 255)
for (x, y) in [(9, 12), (14, 12)]:
    ep[x, y] = (245, 252, 255, 255)
save(eyes, "entity", "hollow", "hollow_eyes.png")

# ---------------------------------------------------------------- Vessel block
def vessel_cage():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    frame, light = (150, 110, 205, 255), (205, 175, 250, 255)
    for i in range(16):
        for (x, y) in [(i, 0), (i, 15), (0, i), (15, i)]:
            p[x, y] = frame
        for (x, y) in [(i, 1), (1, i)]:
            if 0 < i < 15:
                p[x, y] = light
    # Diagonal glass struts.
    for i in range(2, 14):
        p[i, i] = (180, 150, 235, 200)
        p[15 - i, i] = (180, 150, 235, 200)
    # Faint glass tint.
    for y in range(2, 14):
        for x in range(2, 14):
            if p[x, y][3] == 0 and (x + y) % 5 == 0:
                p[x, y] = (210, 200, 255, 70)
    return img


def vessel_base():
    img = Image.new("RGBA", (16, 16))
    p = img.load()
    r = random.Random(7)
    for y in range(16):
        for x in range(16):
            v = r.randint(-10, 10)
            p[x, y] = (60 + v, 48 + v, 80 + v, 255)
    for i in range(16):
        p[i, 0] = p[i, 15] = p[0, i] = p[15, i] = (100, 80, 140, 255)
    return img


def vessel_core(awake):
    img = Image.new("RGBA", (16, 16))
    p = img.load()
    c = 7.5
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - c, y - c) / 10.6
            inner = (255, 255, 255) if awake else (200, 240, 255)
            outer = (120, 220, 255) if awake else (90, 120, 200)
            p[x, y] = mix(inner, outer, min(1, d * 1.3)) + (255,)
    return img


save(vessel_cage(), "block", "lumen_vessel_cage.png")
save(vessel_base(), "block", "lumen_vessel_base.png")
save(vessel_core(False), "block", "lumen_vessel_core.png")
save(vessel_core(True), "block", "lumen_vessel_core_awake.png")

# ---------------------------------------------------------------- Items
EGG = [
    "......####......",
    ".....######.....",
    "....########....",
    "...##########...",
    "...##########...",
    "..############..",
    "..############..",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    "..############..",
    "...##########...",
    "....########....",
    "......####......",
]


def egg(base, spot, seed):
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    r = random.Random(seed)
    for y, row in enumerate(EGG):
        for x, ch in enumerate(row):
            if ch != "#":
                continue
            edge = any(
                not (0 <= x + dx < 16 and 0 <= y + dy < 16) or EGG[y + dy][x + dx] != "#"
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            col = mix(base, (0, 0, 0), 0.35) if edge else base
            if not edge and x < 7 and y < 6:
                col = mix(base, (255, 255, 255), 0.3)
            p[x, y] = col + (255,)
    placed = 0
    while placed < 7:
        x, y = r.randint(3, 12), r.randint(3, 13)
        if EGG[y][x] == "#" and EGG[y][x + 1] == "#":
            p[x, y] = spot + (255,)
            if r.random() < 0.5:
                p[x + 1, y] = spot + (255,)
            placed += 1
    return img


save(egg((215, 245, 255), (60, 170, 230), 1), "item", "lumen_spawn_egg.png")
save(egg((24, 20, 32), (190, 230, 255), 2), "item", "hollow_spawn_egg.png")

shard = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
sp = shard.load()
SHARD = [
    "..........##....",
    ".........#ab#...",
    "........#abb#...",
    ".......#abbc#...",
    "......#abbcc#...",
    ".....#abbcc#....",
    "....#abbcc#.....",
    "...#abbcc#......",
    "...#abcc#.......",
    "..#abcc#........",
    "..#bcc#.........",
    ".#bcc#..........",
    ".#cc#...........",
    ".#c#............",
    "..#.............",
    "................",
]
COLS = {"#": (10, 6, 16), "a": (170, 120, 230), "b": (70, 40, 110), "c": (36, 20, 58)}
for y, row in enumerate(SHARD):
    for x, ch in enumerate(row):
        if ch in COLS:
            sp[x, y] = COLS[ch] + (255,)
save(shard, "item", "hollow_shard.png")

# ---------------------------------------------------------------- Mod icon
icon = orb("calm", False).resize((96, 96), Image.NEAREST)
canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
glow = halo.resize((128, 128), Image.BILINEAR)
gp = glow.load()
for y in range(128):
    for x in range(128):
        r_, g_, b_, a_ = gp[x, y]
        gp[x, y] = (clamp(r_ * 0.62), clamp(g_ * 0.9), clamp(b_), a_)
canvas.alpha_composite(glow)
canvas.alpha_composite(icon, (16, 16))
os.makedirs(os.path.join(ROOT, ".."), exist_ok=True)
canvas.save(os.path.join(ROOT, "..", "icon.png"))
print("textures written to", os.path.abspath(ROOT))
