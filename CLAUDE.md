# CLAUDE.md

10 Oota 10: a Three.js + Vite browser game where you overtake Daniel (a real person, a friend of James) on the real A970 through Cunningsburgh, Shetland, and he rates each overtake out of 10. It's a gift and goes out to his Instagram audience, so most players will be on phones.

Live: https://shetlandj.github.io/ten-oota-ten/ (deployed by `.github/workflows/pages.yml` on every push to `main`; the workflow runs `npm test` first).

## Commands

```bash
npm run dev          # vite --host; add ?touch to the URL to force the touch UI on desktop
npm test             # scripts/test-scoring.mjs: scripted overtakes through real physics + scorer
npm run build        # dist/ (base is './' so it works under /ten-oota-ten/ on Pages)
npm run bake         # rebuild public/data/route.json from cached OSM/DEM downloads
npm run bake -- --refresh   # re-download (Overpass is often overloaded; the script falls back across mirrors)
```

Run `npm test` after touching anything in `src/scoring/`, `src/vehicles/player.js` or `src/vehicles/cyclist.js`. The test drives the real physics, so physics changes can shift scores.

## Coordinate conventions (get these wrong and everything is mirrored)

- World: x = east, z = **south** (north is -z), y = up. Metres.
- Road coordinates: `s` = distance along the centreline in the direction of travel (southbound), `d` = lateral offset, **positive = right**.
- UK, so we drive on the left: own lane centre `d = -1.65` (`OWN_LANE`), oncoming lane `+1.65`. Daniel rides at `d = -2.35`.
- Right-hand normal for tangent `(tx, tz)` is `(-tz, tx)`. `road.pos(s, d)` / `road.frame(s)` do this; use them rather than recomputing.
- All models face **+z**; `rotation.y = heading` where `heading = atan2(tx, tz)`. Oncoming vehicles add `Math.PI`.
- Terrain triangulation splits each cell along the (c, r+1)–(c+1, r) diagonal. `Terrain.heightAt` and `gridTriangle` in `scripts/bake.mjs` must stay identical, or objects float/sink and the bake's "no terrain poking through the asphalt" pass breaks.

## Architecture

- `scripts/bake.mjs` → `public/data/route.json` (road samples every 3m, terrain grid 30m, buildings as oriented boxes, walls, bus stops, junctions, lay-bys, cattle grids). The game never hits the network.
- `src/world/road.js` is pure (no three.js): sight distance, hazard zones (bend/crest/junction/bus stop), speed limits. Hazard thresholds are tuned for ~47% of the route restricted. Check `road.restrictedFraction()` if you change them.
- `src/scoring/` is pure and deterministic: no three.js, DOM, `Date` or `Math.random`. `overtake.js` is a phase state machine fed one frame per sim step; `config.js` holds every threshold and deduction. **Bump `SCORING_VERSION` whenever a threshold changes what a 10 means** (a future leaderboard keys on it).
- `src/game.js` runs a fixed 120Hz sim (`SIM_DT`) with an accumulator; rendering is decoupled. Traffic (`traffic/traffic.js`), gusts (`traffic/wind.js`), weather and quip choice are all seeded from the run seed. Keep it that way: no `Math.random()` in anything that affects gameplay.
- Scores: a non-perfect overtake is capped at 9.95 and displayed with `Math.floor`. Never round up to 10.
- Run results (`scoring/run.js`) are plain serialisable JSON, logged to the console and the last 10 kept in localStorage, ready to POST to a backend later. Don't put class instances or Three objects in them.

## Gotchas

- Flat ribbons/quads (markings, road) must wind so their face normal points **up**. A downward face renders with the hemisphere light's green ground colour. Don't paper over it with `DoubleSide`.
- `PCFSoftShadowMap` was removed in this three.js version; use `PCFShadowMap`.
- Player steering is deliberately ramped so steady keyboard input stays under the 3.6 m/s² harsh-steer threshold. Only flicking left-right or fast touch swipes count as harsh. Changing `STEER_RAMP`/`STEER_RETURN`/`vdMax` in `player.js` changes smoothness scoring.
- Indicators never auto-cancel. Same key toggles off; the other side switches over.
- `public/audio/ten-oota-ten.{mp3,m4a,wav,ogg}` is an optional voice clip of Daniel played on a perfect 10. Until James adds it, four 404s in the console are expected.
- Touching Daniel never knocks him over: `Game._bonk` freezes the sim and shows the comic pop-up (`ui/bonk.js`), scores 0, then drops him 30m behind the car. This is deliberate (he's real and the game goes to his followers). Head-on crashes with oncoming traffic still get the slow-mo.
- `public/audio/right-of-way.mp3` loops on the title/end screens via `audio.playMusic`. It only starts after the first tap/key (browser autoplay rules).
- `CATCHPHRASES` in `src/scoring/quips.js` are placeholders lifted from Daniel's posts; James may supply real ones.

## Debugging

- `window.__game` exposes the game (player, traffic, active encounter, tracker via `active.tracker.raw`).
- `__game.debugCam = true` stops the game moving the camera so you can position it manually.
- Teleporting: set `__game.player.s` / `.d` / `.v`; use `__game.road.hazardWithin(s, dist)` to find clear stretches (the longest is ~300m).

## Style

Low-poly, flat colours, vertex-coloured merged geometry and instancing to keep draw calls low for mid-range phones. UI follows the Instagram reel look (warm orange→red/pink story gradient, white caption cards in a condensed serif, yellow "10 oota 10" comic badge). No purple, no emojis.
