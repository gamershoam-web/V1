# Glacier architecture (pathing + builder)

## Pathfinder (`addon/pathing`)
- **PathWorld** – byte-per-block lazy section cache. Classes: AIR, SOLID, WATER, DANGER, CLIMB, FENCE (obstacle, not floor),
  DOOR, UNKNOWN, LAVA. `body()`, `floor()`, `stand()` predicates. Carpets/plates → AIR; narrow shapes → FENCE.
- **Planner** – weighted A* with an indexed heap, JPS on plain regions, moves: walk/ascend/fall/parkour/bridge/pillar/
  break/dig/climb/swim/door. `Context`: breakMult, `protect` (LongPredicate) + `protectPenalty`, `avoid` cells, throwaway count.
  CoarsePlanner does chunk-level hierarchical planning for long trips. Runs async on one daemon thread.
- **Executor** – follows steps with a trajectory search over a vanilla-physics PlayerSim (jump timing policies, turn penalty).
  Actions gated by `actionDone`; every waiting branch uses `checkStuck(limit)` → STUCK → replan. `safeWalk` crouches at
  drops > 3. `TEMP` / `PLACED_THROWAWAY` track temporary blocks; `anyBlockThrowaway` lets builders use plain blocks.
- **Pathing** – tick loop (camera saved at START, restored at END = silent rotation), goal/process handling, arrival
  (`inGoalAround`), elytra decisions (`elytraFor`, `shouldFlyInstead`, `flyNear`), pearls/wind charges (`tryThrow`),
  avoid-cells memory, temp-block cleanup.
- **ElytraFlight** – travel (cruise above terrain), precise landing (spin-down + predictive drop `dropMiss`), elevator
  (rocket straight up from an adjacent column, release at predicted apex), fall rescue, chestplate swap-back.

## Builder (`addon/pathing/build`)
- **SchematicSource** – Litematica bridge (reflection on SchematicWorldHandler/DataManager placements) or **FromFile**
  (`LitematicFile` reader/writer, rotation/mirror).
- **Placer** – printer-style solver: simulate `BlockItem.getPlacementState` over faces × hit points × looks; passes for
  aim-at-hit, explicit looks, sneak on interactive neighbours, air place; cycles properties (repeater delay, comparator,
  note, open); buckets for fluids; `skip()` + user blacklist; `UNCONFIRMED` set.
- **BuildProcess** – scan (bottom layer first), placement loop (cap/tick), checkLater confirmation, giveUp, layer logic
  (`lowestLayer`, optional strict), movement (Baritone-style goals to lowest unfinished blocks; optional row sweep),
  tower/step-up, support blocks + immediate removal, relocate when stuck, AI-route follower (`withRoute`).
- **Route format** (positions relative to the schematic's lowest corner, `;` or newline separated):
  `L y` layer · `G x y z` go · `P` place all in reach · `S` step up (jump+place below) · `W` wind charge boost ·
  `E x y z` ender pearl. `RouteDesigner` (dev) generates one from a schematic by greedy set cover per layer.
- **SchematicPreview** – placement ghost (move/rotate/mirror, faint white shell + outline) and current-layer overlay.

## Settings / GUI
`PathSettings` (static fields, saved to `config/glacier-pathfinder.properties` by reflection) + `PathfinderScreen`
(`settingsGrid` of toggles by field name, `Slider`, `Field` text boxes). Add a setting = field + grid entry.
