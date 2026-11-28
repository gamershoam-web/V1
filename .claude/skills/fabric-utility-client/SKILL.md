---
name: fabric-utility-client
description: Build, extend, test and ship Fabric "utility client" mods for Minecraft Java (anarchy-server style clients such as Glacier with modules, a click GUI, HUD, pathfinder, elytra flight and a schematic auto-builder). Use whenever the user wants a new client module, a fix to an existing one, a pathfinding/auto-build/elytra feature, a release jar, or wants a third-party mod jar checked. Covers the Loom setup, mixin rules, the headless in-game test harness, release packaging, the user's Android/2b2t constraints, and the lessons learned building Glacier.
---

# Fabric utility client builder

You are building a client-side Fabric mod ("utility client") for Minecraft Java. The reference project is **Glacier**
(Fabric, MC 1.21.11, authors Ryedawgggg / Mode1). Work like this: change code, compile, prove it in a real headless
game, then ship a verified jar. Never ship something you have not compiled; say plainly what was and wasn't tested.

## 1. Who you are building for

- Plays 2b2t / anarchy servers on **Android (MojoLauncher, GUI scale ~666x300)** with ~58 other mods. Phone CPU is weak:
  keep per-tick work small, give async planners a generous time budget (1.5 s), avoid per-frame allocations.
- Survival anticheat (Grim-style). Defaults must be safe: <= 2 block placements per tick, look where you click
  (offer a "strict rotations" toggle), no placing while gliding, air-place behind a setting/fallback.
- Wants features that behave like a skilled real player. Prefers short status updates, jars delivered fast,
  and honest numbers ("placed 450/3377 in 4 min", not "works great").

## 2. Project layout (Glacier)

```
src/main/java/me/matl114/
  hacks/…                    core client (modules, RenderTasks, utils)
  addon/modules/…            Glacier modules (GlacierModule base, register in hacks/MovTasks.java etc.)
  addon/menu/MenuBase.java   toolbar (Mode, HUD Editor, AI, Pathfinder, Style)
  addon/pathing/…            pathfinder: PathWorld, Planner, Executor, Pathing, ElytraFlight, Goal, PathSettings
  addon/pathing/build/…      builder: BuildProcess, Placer, SchematicSource, LitematicFile, SchematicPreview, Throws
  addon/pathing/gui/PathfinderScreen.java   tabs Go/Jobs/Build/Waypoints/Settings/Colors
  addon/dev/…                DEV ONLY test harness (ShotBot, PathTest, RouteDesigner) – never ship
src/main/resources/fabric.mod.json, slimefunhelper.mixins.json
gradle.properties (mod_version)
```

See `references/architecture.md` for how the pathfinder, executor, elytra and builder fit together.

## 3. Build rules that bite

- Fabric Loom with a yarn-like mapping (e.g. `isFallFlying()`, not `isGliding`). Check names against existing code.
- Mixin invokers are remapped in-class (no refmap): `@Invoker("getPlacementState") BlockState glacier$getPlacementState(...)`.
- Gradle `expand` turns `\n` into a real newline: write `\\n` inside `fabric.mod.json` strings or the JSON breaks.
- Bump `mod_version` in `gradle.properties` for every jar you hand over.
- Compile check: `./gradlew compileJava --no-daemon -q 2>&1 | grep error: -A2`.

## 4. Test in a real game (headless)

Dev harness: `addon/dev/ShotBot` (client entrypoint) + `PathTest` (courses). Restore it from the backup folder
before testing; it must be absent from release jars.

```bash
timeout 900 env LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 854x480x24" ./gradlew runClient --no-daemon -q \
  -PshotW=854 -PshotH=480 -PshotGui=0 -PmtPath=true -PpathOnly=build,elybuild,elytower -PpathDebug=true
grep -E "RESULT" run/logs/latest.log
```

- Courses log `RESULT <name> ARRIVED|TIMEOUT`, `correct N/M`, `lowest health`. `-PpathDebug=true` enables `[PATHDBG]` lines.
- Long runs: start in the background and watch `run/logs/latest.log` with a Monitor/grep for `t=5000` checkpoints.
- `/fill` is capped at 32768 blocks: clear big areas in 5-10 wide slabs.
- Software GL starves CPU: planner times here are worse than on a PC; don't over-tune to the VM.
- Record what the user can watch: `ffmpeg -f x11grab -i :99 …` with `XAUTHORITY` from the running Xvfb `-auth` arg.
- Regression set before every jar: `build` (183/183), `elybuild` (9/9), `elytower`, `elyfloat`, `pillar`.

## 5. Ship a release

```bash
cp -r src/main/java/me/matl114/addon/dev <backup>/        # keep the harness
rm -rf src/main/java/me/matl114/addon/dev
sed -i '/"client": \["me.matl114.addon.dev.ShotBot"\],/d' src/main/resources/fabric.mod.json
sed -i 's/^mod_version=.*/mod_version=X.Y.Z/' gradle.properties
./gradlew build --no-daemon -q
unzip -l build/libs/Glacier-1.21.11-X.Y.Z.jar | grep -c addon/dev                 # must be 0
unzip -p build/libs/Glacier-1.21.11-X.Y.Z.jar fabric.mod.json | python3 -c "import json,sys;print(json.load(sys.stdin)['version'])"
```
Pick the exact versioned jar (not `head -1` of `build/libs`). Send it, then list what changed and what was tested.

## 6. Hard-won lessons (do not relearn these)

Builder / pathfinder (details in `references/lessons.md`):
- Never treat every schematic cell as unbreakable — protect only blocks that are already correct; walls seal interiors otherwise.
- Never click against a block the server hasn't confirmed (track UNCONFIRMED); refused placements otherwise land in the hole.
- Count "placed" only after the server confirms; give up a block after ~12 tries; cap retry cooldowns (~2 s).
- Layer order: Baritone style (build in layers bottom-up, place everything reachable in the current layer, walk next to the
  lowest unfinished blocks). Strict "finish every block first" and fixed row order were *slower* – keep them as options.
- Never place above your own head (roofs you in). Tower (jump + place under) for columns, but one step per layer – full
  column towering strands the bot on top.
- Stuck handling: remember cells you pushed into without moving (avoid ~60 s), plan from the nearest standable cell when
  standing on odd blocks (campfire, fence, lantern), every waiting branch needs a timeout.
- Narrow collision shapes (lantern, chain, pane, open trapdoor) are obstacles, not floors; carpets/plates are walkable.
- Don't shut doors/gates while walking through them. Skip beds/signs/banners by default (user-editable "never place" list).
- Movement priority: walk > wind charge (3-7 up) > ender pearl (>10 away) > elytra (no path / long pillars) > pillar > break.
- Elytra landing: go above the spot, spin in place (yaw +45/tick) to sink straight down, release only when low, centred and
  slow, crouch through touchdown until sliding stops. Pause all placing while gliding.
- Remove temporary blocks (pillars/supports) as soon as their job is done; remember ones left out of reach.

## 7. Safety

- Before running or recommending any third-party mod jar, inspect it: no Minecraft references + obfuscated names +
  `ProcessBuilder`/sockets/Base64 + a large encrypted "config" asset = stealer. Tell the user to delete it and rotate
  Microsoft/Discord passwords if it was ever launched. Never run such a jar.
- Never store/print API keys the user pastes. Don't copy code from All-Rights-Reserved clients; write your own.
