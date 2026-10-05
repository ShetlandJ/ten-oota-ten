# 10 Oota 10

A low-poly browser game for Daniel, who cycles the A970 through Cunningsburgh and rates the drivers who overtake him. You drive south from the Aithsetter junction to the Mousa Sound lay-by, catch up with Daniel four times, and he rates each overtake out of ten. A ten is meant to be rare.

Three.js + Vite. Works with a keyboard or touch, in portrait or landscape.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (add ?touch to force the touch UI on desktop)
npm run build      # static build in dist/
npm test           # headless scoring checks
```

## Controls

| | Keyboard | Touch |
|---|---|---|
| Accelerate / brake | W / S or ↑ / ↓ (pressure builds while held) | Gas / Brake pedals |
| Steer | A / D or ← / → | Steering slider |
| Indicators | Q left, E right. Press the same key again to cancel, or X | Arrow buttons. Tap again to cancel |
| Horn | H | Horn |
| Camera | C (chase / bonnet) | Camera button |
| Pause | P / Esc | Pause button |

## What gets a ten

Every phase has to be clean: approach, indicate out, move out, pass, indicate in, move back in, cancel.

- Hold a gap of at least 2 seconds behind him. No tailgating, no horn, no revving.
- Right indicator on for 3+ seconds before you cross over.
- Only go when it's safe: no oncoming traffic within 6 seconds, and not on a bend, crest, solid line, junction or bus stop.
- Give him 1.5m below 30mph, rising to 2m at 50mph and more above that (Highway Code rule 163). A live meter shows it.
- Stay within the limit (50 through Cunningsburgh, 60 outside) and pass at a sensible speed difference.
- Left indicator on before moving back in, and only once he's 9m+ behind you.
- Cancel the indicator within 3 seconds. Nothing auto-cancels.
- No harsh steering or braking at any point.
- Waiting behind for a genuinely safe gap earns a patience bonus. It can make up for small deductions but can't turn a 9 into a 10.

Hitting Daniel gets a 0 and a slow-motion replay.

## Code layout

```
scripts/bake.mjs          OSM (Overpass + OSM API) + Terrarium DEM -> public/data/route.json
scripts/test-scoring.mjs  scripted overtakes through the real physics + scorer
src/world/                road model (sight distance, hazards), terrain, road mesh, scenery, sky
src/vehicles/             player physics, Daniel, low-poly models
src/traffic/              seeded oncoming traffic, wind gusts
src/scoring/              overtake tracker + scorer (pure, deterministic), quips, run result
src/input/ src/audio/ src/ui/
src/game.js               fixed-step sim, encounters, crash handling, camera, HUD
```

### Real geography

`npm run bake` rebuilds `public/data/route.json`: the A970 centreline (Overpass, `ref=A970`), building footprints, drystone walls, bus stops, junctions, lay-bys and cattle grids (OSM API), and elevation from AWS Terrarium tiles. Downloads are cached in `scripts/.cache/`, so add `--refresh` to fetch them again. The game loads only the baked JSON, so it works offline.

No-overtaking zones are calculated from the data. Forward sight distance is checked against the road's horizontal curve and vertical profile, and junctions and bus stops are added on top. Solid lines are painted wherever overtaking is restricted.

### Ready for a leaderboard

- Scoring is isolated in `src/scoring/` and has no three.js or DOM dependencies. All thresholds live in `scoring/config.js`, which is versioned with `SCORING_VERSION`.
- The simulation runs at a fixed 120Hz step, and traffic, gusts, weather and quips are all seeded. Runs on the same seed (for example "today's road") see identical traffic.
- Each run ends with a plain JSON result from `createRun().finish()`. It's logged to the console and the last 10 are stored in localStorage, ready to POST to a backend.

## Daniel's voice

- Quips are in `src/scoring/quips.js`. Replace `CATCHPHRASES` with his real ones.
- Voice clips: drop `public/audio/ten-oota-ten.mp3` (or `.m4a`/`.wav`) in and it plays on a perfect 10.

Map data © OpenStreetMap contributors (ODbL). Elevation: Mapzen Terrarium via AWS Open Data.
