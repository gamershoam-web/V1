# Lessons from the Glacier builder (with the evidence)

| Problem seen | Cause | Fix that worked |
|---|---|---|
| "No path: out of time" forever inside a build | `protect` forbade breaking any schematic cell; walls sealed the interior | protect only *correct* blocks; allow breaking them at a big penalty after failures |
| Glass/campfires in sign & bed cells | clicked against a client-predicted block the server refused | `UNCONFIRMED` set; never click unconfirmed neighbours; 10-tick confirm window |
| Gates/trapdoors "wrong" right after placing | open-state checked before the cycle step | treat `needsCycle` as fine in the confirmation |
| Bot frozen in a 1×1 shaft / on a campfire | start cell not standable; centring branch had no timeout | plan from nearest standable neighbour; `checkStuck` on every wait; avoid-cells |
| Jumping at a lantern | narrow collision counted as floor | footprint < 0.7 → FENCE |
| Builds roof over itself | printer placed everything in reach incl. above head | don't place ≥ 2 above feet (only in printer mode) |
| Stranded on top of a column | full column towering | one step-up per layer |
| Flew "for no reason" | relocate fallback flew without trying to walk | walk first, fly only after 2 failed plans |
| Random leftover blocks | temp blocks out of reach when their job ended | remember them; break when back in reach; final cleanup |
| Slid off the landing block | glide momentum at release | spin-down, release only when slow & centred, crouch until stopped |
| Elevator lift missed spot | ballistic drop too short to drift | lean toward spot near the top, predict drop with air control |
| 2b2t | unknown place-rate limit | default 2 blocks/tick, strict-rotation toggle, air-place optional |

Benchmarks (headless VM, software GL – slower than a real PC):
- test_house 183 blocks: ~300–530 ticks, 183/183.
- sky_pad 9 blocks via elytra: 9/9 (elevator sometimes misses → rescue + retry).
- Mob farm 3377 blocks: ~450 placed in the first 5000 ticks with the default builder (≈40 min full); strict layers,
  row order and fixed tours were all slower. Biggest remaining costs: movement between spots and climbing tall,
  narrow sections; planner budget on weak CPUs.
