# Review fixes

## Shot physics and scoring

- Overhit dispersion now grows from the normal-power baseline instead of resetting to a smaller value immediately above 100% power.
- Landing impact retains substantially less horizontal speed on each bounce. On a flat fairway, the driver now carries 169.1 yards and finishes at 202.3 yards at 85% power (33.2 yards of rollout); at 100% it carries 214.0 and finishes at 256.0 (42.0 yards of rollout).
- Shot results expose the sampled landing index, physical stop point, and hazard impact separately from the playable `end` position. Water and out-of-bounds shots therefore retain their visible impact path while gameplay can reset the ball safely.
- The per-hole score is clamped to 12 after adding both the attempted stroke and any penalty.

## Minimap

- Flight, rollout, and putting guides use the sampled physics path, preserving wind drift and terrain-induced bends.
- Penalty rollout ends at the hazard impact. The playable reset is a separate marker and is never rendered as backward travel to the tee.
- Landing, stopping, and hazard/reset locations have distinct marker treatments.
- Terrain is rendered at one-pixel resolution and cached by hole and map scale, removing the previous blocky three-pixel cells without repeating terrain sampling on every charge update.

## Verification

- `node --test --test-isolation=none tests/game.test.js`: 13 passed, 0 failed.
- `node --test --test-isolation=none tests/minimap.test.js`: 3 passed, 0 failed.
- Flat-hole measurement confirmed descending full-power totals for driver, fairway wood, 5 iron, 7 iron, pitching wedge, sand wedge, and putter.

## Keyboard and persistence

- Focused menu buttons retain native Space activation without triggering a shot. Letter shortcuts still work after clicking a club selector. Independent camera orbit also supports J/L/I/K.
- Reading the browser storage handle happens inside the recovery boundary. Browsers that deny storage access can still start with playable defaults; unsuccessful saves return a failure flag. A throwing-getter regression reproduced the failure before the fix and passes afterward.
