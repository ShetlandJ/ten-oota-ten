// Bakes the real A970 through Cunningsburgh into public/data/route.json.
//
//   node scripts/bake.mjs            # uses cached downloads when present
//   node scripts/bake.mjs --refresh  # re-download OSM + DEM
//
// Sources: OpenStreetMap (Overpass API for ref=A970, OSM API bbox extract for
// buildings / walls / landmarks) and AWS Terrarium elevation tiles.
// Map data (c) OpenStreetMap contributors, ODbL.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts', '.cache');
const OUT = path.join(ROOT, 'public', 'data', 'route.json');
const REFRESH = process.argv.includes('--refresh');
const UA = '10oota10-game-bake/1.0 (gift game; contact via github)';

// ---- Route config ---------------------------------------------------------
// Southbound: from just north of the Aithsetter road end, through
// Cunningsburgh and Mail, to the Mousa Sound viewpoint lay-by.
const ROUTE = {
  start: { lat: 60.0640, lon: -1.2207, name: 'North of Aithsetter junction' },
  end: { lat: 60.0186, lon: -1.2307, name: 'Mousa Sound lay-by' },
};
const BBOX = { s: 60.010, w: -1.265, n: 60.072, e: -1.185 }; // OSM extract
const SAMPLE = 3; // metres between baked road samples
const TERRAIN_CELL = 30; // metres
const TERRAIN_MARGIN = 1100; // metres either side of the road
const DEM_ZOOM = 14;

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// ---- Download helpers -------------------------------------------------------
async function cached(name, fetcher) {
  const file = path.join(CACHE, name);
  if (!REFRESH && fs.existsSync(file)) return fs.readFileSync(file);
  const buf = await fetcher();
  fs.writeFileSync(file, buf);
  return buf;
}

async function get(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpassA970() {
  const q = `[out:json][timeout:25];way["ref"="A970"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});out geom;`;
  for (const url of OVERPASS) {
    try {
      const buf = await get(url, {
        method: 'POST',
        body: new URLSearchParams({ data: q }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const json = JSON.parse(buf.toString());
      if (json.elements?.length) return buf;
    } catch (e) {
      console.warn(`  overpass ${url} failed: ${e.message}`);
    }
  }
  return null;
}

// ---- OSM XML parsing (tiny, regex based; the API output is regular) --------
function parseOsmXml(xml) {
  const nodes = new Map();
  const ways = [];
  const tagRe = /<tag k="([^"]*)" v="([^"]*)"\/>/g;
  const dec = (s) => s.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"(\/>|>([\s\S]*?)<\/node>)/g)) {
    const tags = {};
    if (m[5]) for (const t of m[5].matchAll(tagRe)) tags[t[1]] = dec(t[2]);
    nodes.set(m[1], { id: m[1], lat: +m[2], lon: +m[3], tags });
  }
  for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags = {};
    for (const t of m[2].matchAll(tagRe)) tags[t[1]] = dec(t[2]);
    const nds = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((a) => a[1]);
    ways.push({ id: m[1], tags, nds });
  }
  return { nodes, ways };
}

// ---- Projection -------------------------------------------------------------
let LAT0 = 0;
let LON0 = 0;
let KX = 0;
const KY = 111132.954 - 559.822 * Math.cos(2 * ((60.04 * Math.PI) / 180));
function setOrigin(lat, lon) {
  LAT0 = lat;
  LON0 = lon;
  const φ = (lat * Math.PI) / 180;
  KX = 111412.84 * Math.cos(φ) - 93.5 * Math.cos(3 * φ);
}
// x = east, z = south (three.js: -z is "north")
const project = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KY];
const unproject = (x, z) => [LAT0 - z / KY, LON0 + x / KX];

// ---- Geometry helpers ---------------------------------------------------------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = dist(a, b);
    let t = step - carry;
    while (t <= L) {
      out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]);
      t += step;
    }
    carry = L - (t - step);
  }
  return out;
}

function smooth(pts, radius, passes = 1) {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next = cur.map((_, i) => {
      let sx = 0;
      let sz = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        const w = radius + 1 - Math.abs(k);
        sx += cur[j][0] * w;
        sz += cur[j][1] * w;
        n += w;
      }
      return [sx / n, sz / n];
    });
    next[0] = cur[0];
    next[next.length - 1] = cur[cur.length - 1];
    cur = next;
  }
  return cur;
}

function smooth1(vals, radius, passes = 1) {
  let cur = vals;
  for (let p = 0; p < passes; p++) {
    cur = cur.map((_, i) => {
      let s = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        s += cur[j];
        n++;
      }
      return s / n;
    });
  }
  return cur;
}

// Minimum-area oriented rectangle for a footprint (rotating calipers, brute force on edges).
function orientedBox(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of pts) {
      const u = p[0] * c + p[1] * s;
      const v = -p[0] * s + p[1] * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      best = { area, x: cu * c - cv * s, z: cu * s + cv * c, w: maxU - minU, d: maxV - minV, rot: ang };
    }
  }
  // Long axis along w
  if (best.d > best.w) {
    [best.w, best.d] = [best.d, best.w];
    best.rot += Math.PI / 2;
  }
  return best;
}

// ---- DEM -------------------------------------------------------------------
const tiles = new Map();
const lon2tile = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2tile = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

async function loadTiles(bounds) {
  const x0 = Math.floor(lon2tile(bounds.w, DEM_ZOOM));
  const x1 = Math.floor(lon2tile(bounds.e, DEM_ZOOM));
  const y0 = Math.floor(lat2tile(bounds.n, DEM_ZOOM));
  const y1 = Math.floor(lat2tile(bounds.s, DEM_ZOOM));
  console.log(`  DEM tiles ${x1 - x0 + 1} x ${y1 - y0 + 1} at z${DEM_ZOOM}`);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const buf = await cached(`terrarium_${DEM_ZOOM}_${x}_${y}.png`, () =>
        get(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/${x}/${y}.png`),
      );
      const png = PNG.sync.read(buf);
      const h = new Float32Array(256 * 256);
      for (let i = 0; i < 256 * 256; i++) {
        const r = png.data[i * 4];
        const g = png.data[i * 4 + 1];
        const b = png.data[i * 4 + 2];
        h[i] = r * 256 + g + b / 256 - 32768;
      }
      tiles.set(`${x}/${y}`, h);
    }
  }
}

function demPixel(px, py) {
  const tx = Math.floor(px / 256);
  const ty = Math.floor(py / 256);
  const t = tiles.get(`${tx}/${ty}`);
  if (!t) return 0;
  return t[(py - ty * 256) * 256 + (px - tx * 256)];
}

function elevation(lat, lon) {
  const fx = lon2tile(lon, DEM_ZOOM) * 256 - 0.5;
  const fy = lat2tile(lat, DEM_ZOOM) * 256 - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ax = fx - ix;
  const ay = fy - iy;
  const a = demPixel(ix, iy);
  const b = demPixel(ix + 1, iy);
  const c = demPixel(ix, iy + 1);
  const d = demPixel(ix + 1, iy + 1);
  return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
}

// ---- Main --------------------------------------------------------------------
async function main() {
  console.log('Fetching OSM extract…');
  const xml = (
    await cached('osm_map.xml', () =>
      get(`https://api.openstreetmap.org/api/0.6/map?bbox=${BBOX.w},${BBOX.s},${BBOX.e},${BBOX.n}`),
    )
  ).toString();
  const osm = parseOsmXml(xml);
  console.log(`  ${osm.nodes.size} nodes, ${osm.ways.length} ways`);

  console.log('Fetching A970 from Overpass…');
  let a970Ways;
  let overpassBuf = null;
  try {
    overpassBuf = await cached('overpass_a970.json', async () => {
      const b = await overpassA970();
      if (!b) throw new Error('all overpass mirrors failed');
      return b;
    });
  } catch (e) {
    console.warn(`  ${e.message}; using A970 ways from the OSM API extract instead`);
  }
  if (overpassBuf) {
    const json = JSON.parse(overpassBuf.toString());
    a970Ways = json.elements
      .filter((e) => e.type === 'way')
      .map((w) => ({
        id: String(w.id),
        tags: w.tags,
        nds: w.nodes.map(String),
        geom: w.geometry.map((g) => ({ lat: g.lat, lon: g.lon })),
      }));
  } else {
    a970Ways = osm.ways
      .filter((w) => w.tags.ref === 'A970')
      .map((w) => ({ ...w, geom: w.nds.map((n) => osm.nodes.get(n)).filter(Boolean) }));
  }
  console.log(`  ${a970Ways.length} A970 ways`);

  // Chain the ways into one polyline by shared end nodes.
  const chain = chainWays(a970Ways);
  setOrigin((ROUTE.start.lat + ROUTE.end.lat) / 2, (ROUTE.start.lon + ROUTE.end.lon) / 2);

  // Project & orient start -> end, clip.
  let pts = chain.map((p) => ({ ...p, xz: project(p.lat, p.lon) }));
  const sXZ = project(ROUTE.start.lat, ROUTE.start.lon);
  const eXZ = project(ROUTE.end.lat, ROUTE.end.lon);
  const nearest = (xz) => pts.reduce((bi, p, i) => (dist(p.xz, xz) < dist(pts[bi].xz, xz) ? i : bi), 0);
  let i0 = nearest(sXZ);
  let i1 = nearest(eXZ);
  if (i0 > i1) {
    pts = pts.reverse();
    i0 = pts.length - 1 - i0;
    i1 = pts.length - 1 - i1;
  }
  // Keep 400m beyond each end for run-in / run-out visuals.
  const extra = 400;
  let a = i0;
  for (let acc = 0; a > 0 && acc < extra; a--) acc += dist(pts[a].xz, pts[a - 1].xz);
  let b = i1;
  for (let acc = 0; b < pts.length - 1 && acc < extra; b++) acc += dist(pts[b].xz, pts[b + 1].xz);
  pts = pts.slice(a, b + 1);

  // Smooth & resample the centreline.
  let line = resample(
    pts.map((p) => p.xz),
    1,
  );
  line = smooth(line, 6, 3);
  line = resample(line, SAMPLE);
  const N = line.length;
  const sArr = line.map((_, i) => i * SAMPLE);
  const routeStart = nearestIndex(line, sXZ) * SAMPLE;
  const routeEnd = nearestIndex(line, eXZ) * SAMPLE;
  console.log(`  road ${((N * SAMPLE) / 1000).toFixed(2)} km, route ${routeStart}m → ${routeEnd}m`);

  // Speed limits per sample from the source ways (nearest way point).
  const limitRaw = line.map((xz) => {
    let best = null;
    let bd = Infinity;
    for (const p of pts) {
      const d = dist(p.xz, xz);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best.limit;
  });
  // Village zone: everything between the first and last 50mph sample is 50.
  const fifty = limitRaw.map((l, i) => (l === 50 ? i : -1)).filter((i) => i >= 0);
  const villageStart = fifty.length ? fifty[0] * SAMPLE : null;
  const villageEnd = fifty.length ? fifty[fifty.length - 1] * SAMPLE : null;
  console.log(`  village 50mph zone: ${villageStart}m → ${villageEnd}m`);

  // ---- Elevation
  console.log('Fetching elevation…');
  const ll = line.map(([x, z]) => unproject(x, z));
  const lats = ll.map((p) => p[0]);
  const lons = ll.map((p) => p[1]);
  const padLat = TERRAIN_MARGIN / KY + 0.004;
  const padLon = TERRAIN_MARGIN / KX + 0.006;
  await loadTiles({
    s: Math.min(...lats) - padLat,
    n: Math.max(...lats) + padLat,
    w: Math.min(...lons) - padLon,
    e: Math.max(...lons) + padLon,
  });
  let roadY = ll.map(([lat, lon]) => elevation(lat, lon));
  roadY = smooth1(roadY, 8, 4).map((v) => Math.max(v, 2));

  // ---- Terrain grid
  console.log('Building terrain…');
  const xs = line.map((p) => p[0]);
  const zs = line.map((p) => p[1]);
  const minX = Math.floor((Math.min(...xs) - TERRAIN_MARGIN) / TERRAIN_CELL) * TERRAIN_CELL;
  const maxX = Math.ceil((Math.max(...xs) + TERRAIN_MARGIN) / TERRAIN_CELL) * TERRAIN_CELL;
  const minZ = Math.floor((Math.min(...zs) - TERRAIN_MARGIN) / TERRAIN_CELL) * TERRAIN_CELL;
  const maxZ = Math.ceil((Math.max(...zs) + TERRAIN_MARGIN) / TERRAIN_CELL) * TERRAIN_CELL;
  const cols = (maxX - minX) / TERRAIN_CELL + 1;
  const rows = (maxZ - minZ) / TERRAIN_CELL + 1;

  const grid = makeRoadIndex(line, 40);
  const heights = new Array(cols * rows);
  const roadDist = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + c * TERRAIN_CELL;
      const z = minZ + r * TERRAIN_CELL;
      const [lat, lon] = unproject(x, z);
      let h = elevation(lat, lon);
      const near = grid.nearest(x, z);
      const dd = near.d;
      if (dd < 60) {
        // Flatten into a gentle cutting/embankment under the road.
        const ry = roadY[near.i] - 0.35;
        const t = smoothstep(12, 60, dd);
        h = ry * (1 - t) + h * t;
      }
      heights[r * cols + c] = h;
      roadDist[r * cols + c] = Math.round(dd);
    }
  }

  // Make sure no terrain triangle pokes up through the asphalt: probe the
  // centreline and both edges, push offending triangle vertices down.
  for (let pass = 0; pass < 4; pass++) {
    let fixed = 0;
    for (let i = 0; i < N; i++) {
      const j = Math.min(N - 1, i + 1);
      const i0 = Math.max(0, j - 1);
      const tx = line[j][0] - line[i0][0];
      const tz = line[j][1] - line[i0][1];
      const L = Math.hypot(tx, tz) || 1;
      for (const off of [-5, -3.5, -1.7, 0, 1.7, 3.5, 5]) {
        const x = line[i][0] + (-tz / L) * off;
        const z = line[i][1] + (tx / L) * off;
        const tri = gridTriangle(x, z);
        if (!tri) continue;
        const h = tri.reduce((s, [k, w]) => s + heights[k] * w, 0);
        const limit = roadY[i] - 0.25;
        if (h > limit) {
          for (const [k] of tri) heights[k] -= h - limit + 0.1;
          fixed++;
        }
      }
    }
    if (!fixed) break;
  }
  for (let k = 0; k < heights.length; k++) heights[k] = Math.round(heights[k] * 10) / 10;

  // Same triangulation as the game: cell split along the (c, r+1)-(c+1, r) diagonal.
  function gridTriangle(x, z) {
    const fc = (x - minX) / TERRAIN_CELL;
    const fr = (z - minZ) / TERRAIN_CELL;
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    if (c < 0 || r < 0 || c >= cols - 1 || r >= rows - 1) return null;
    const fx = fc - c;
    const fz = fr - r;
    const A = r * cols + c;
    const B = (r + 1) * cols + c;
    const C = (r + 1) * cols + c + 1;
    const D = r * cols + c + 1;
    if (fx + fz <= 1) return [[A, 1 - fx - fz], [D, fx], [B, fz]];
    return [[C, fx + fz - 1], [B, 1 - fx], [D, 1 - fz]];
  }

  // ---- Features
  console.log('Extracting features…');
  const wayPts = (w) => w.nds.map((n) => osm.nodes.get(n)).filter(Boolean);
  const roadFrame = (x, z) => {
    const n = grid.nearest(x, z);
    const i = n.i;
    const j = Math.min(N - 1, i + 1);
    const i0 = Math.max(0, j - 1);
    const tx = line[j][0] - line[i0][0];
    const tz = line[j][1] - line[i0][1];
    const L = Math.hypot(tx, tz) || 1;
    // right normal for heading t is (-tz, tx)
    const side = ((x - line[i][0]) * (-tz / L) + (z - line[i][1]) * (tx / L));
    return { s: i * SAMPLE, d: side, dist: n.d };
  };
  const groundAt = (x, z) => {
    const [lat, lon] = unproject(x, z);
    return elevation(lat, lon);
  };

  const buildings = [];
  for (const w of osm.ways) {
    if (!w.tags.building) continue;
    const p = wayPts(w);
    if (p.length < 4) continue;
    const xz = p.slice(0, -1).map((n) => project(n.lat, n.lon));
    const cx = xz.reduce((s, q) => s + q[0], 0) / xz.length;
    const cz = xz.reduce((s, q) => s + q[1], 0) / xz.length;
    const f = roadFrame(cx, cz);
    if (f.dist > TERRAIN_MARGIN - 50) continue;
    const box = orientedBox(xz.map(([x, z]) => [x - cx, z - cz]));
    const kind =
      w.tags.building === 'church' || w.tags.amenity === 'place_of_worship'
        ? 'kirk'
        : w.tags.amenity === 'community_centre'
          ? 'hall'
          : box.w * box.d < 35
            ? 'shed'
            : 'house';
    const y = Math.min(...xz.map(([x, z]) => sampleTerrain(x, z)));
    buildings.push({
      x: r1(cx + box.x),
      z: r1(cz + box.z),
      y: r1(y),
      w: r1(Math.max(3, box.w)),
      d: r1(Math.max(3, box.d)),
      rot: r3(box.rot),
      kind,
      name: w.tags.name || undefined,
    });
  }
  console.log(`  ${buildings.length} buildings`);

  function sampleTerrain(x, z) {
    const tri = gridTriangle(x, z);
    return tri ? tri.reduce((acc, [k, w]) => acc + heights[k] * w, 0) : 0;
  }

  // Drystone walls & fences: polylines (resampled to 6m), clipped to corridor.
  const walls = [];
  for (const w of osm.ways) {
    const kind = w.tags.barrier === 'wall' ? 'wall' : w.tags.barrier === 'fence' ? 'fence' : null;
    if (!kind) continue;
    const xz = wayPts(w).map((n) => project(n.lat, n.lon));
    if (xz.length < 2) continue;
    const rs = resample(xz, 6);
    const keep = rs.filter(([x, z]) => {
      const f = roadFrame(x, z);
      return f.dist < TERRAIN_MARGIN - 50 && f.dist > 6;
    });
    if (keep.length >= 2) walls.push({ kind, pts: keep.map(([x, z]) => [r1(x), r1(z)]) });
  }
  console.log(`  ${walls.length} walls/fences`);

  // Lochs (natural=water polygons)
  const lochs = [];
  for (const w of osm.ways) {
    if (w.tags.natural !== 'water') continue;
    const xz = wayPts(w).map((n) => project(n.lat, n.lon));
    if (xz.length < 4) continue;
    const cx = xz.reduce((s, q) => s + q[0], 0) / xz.length;
    const cz = xz.reduce((s, q) => s + q[1], 0) / xz.length;
    if (roadFrame(cx, cz).dist > TERRAIN_MARGIN) continue;
    lochs.push({ y: r1(Math.max(1, groundAt(cx, cz))), pts: xz.map(([x, z]) => [r1(x), r1(z)]), name: w.tags.name });
  }

  // Coastline polylines (for shoreline foam + sanity), clipped.
  const coast = [];
  for (const w of osm.ways) {
    if (w.tags.natural !== 'coastline') continue;
    const xz = resample(
      wayPts(w).map((n) => project(n.lat, n.lon)),
      15,
    ).filter(([x, z]) => roadFrame(x, z).dist < TERRAIN_MARGIN + 100);
    if (xz.length >= 2) coast.push(xz.map(([x, z]) => [r1(x), r1(z)]));
  }

  // Points of interest along the route
  const onRoute = (n, maxD = 30) => {
    const [x, z] = project(n.lat, n.lon);
    const f = roadFrame(x, z);
    return f.dist <= maxD ? { s: f.s, d: r1(f.d), x: r1(x), z: r1(z) } : null;
  };
  const busStops = [];
  const cattleGrids = [];
  const laybys = [];
  const places = [];
  for (const n of osm.nodes.values()) {
    const t = n.tags;
    if (t.highway === 'bus_stop') {
      const p = onRoute(n, 25);
      if (p) busStops.push({ ...p, name: t.name || null, shelter: t.shelter === 'yes' });
    } else if (t.barrier === 'cattle_grid') {
      const p = onRoute(n, 400);
      if (p) cattleGrids.push({ ...p, onRoute: Math.abs(p.d) < 6 });
    } else if (t.parking === 'layby') {
      const p = onRoute(n, 40);
      if (p) laybys.push(p);
    } else if (t.place && t.name) {
      const [x, z] = project(n.lat, n.lon);
      const f = roadFrame(x, z);
      if (f.dist < 2500) places.push({ name: t.name, kind: t.place, s: f.s, x: r1(x), z: r1(z) });
    }
  }

  // Junctions: side roads that share a node with the A970.
  const a970Nodes = new Set(a970Ways.flatMap((w) => w.nds));
  const junctions = [];
  const sideRoads = [];
  const SIDE = new Set(['unclassified', 'residential', 'service', 'tertiary', 'secondary', 'track']);
  for (const w of osm.ways) {
    if (!SIDE.has(w.tags.highway) || w.tags.ref === 'A970') continue;
    const hit = w.nds.findIndex((id) => a970Nodes.has(id));
    if (hit < 0) continue;
    const p = osm.nodes.get(w.nds[hit]);
    const at = onRoute(p, 12);
    if (!at) continue;
    // Walk away from the junction for up to 120m.
    const forward = hit === 0 ? w.nds : hit === w.nds.length - 1 ? [...w.nds].reverse() : null;
    const seq = forward || w.nds.slice(hit);
    let poly = resample(
      seq.map((id) => osm.nodes.get(id)).filter(Boolean).map((q) => project(q.lat, q.lon)),
      5,
    );
    let acc = 0;
    const cut = [];
    for (let k = 0; k < poly.length; k++) {
      if (k) acc += dist(poly[k], poly[k - 1]);
      if (acc > 120) break;
      cut.push(poly[k]);
    }
    if (cut.length < 2) continue;
    const major = w.tags.highway === 'unclassified' || w.tags.highway === 'tertiary' || w.tags.highway === 'residential';
    junctions.push({ s: at.s, side: Math.sign(roadFrame(cut[cut.length - 1][0], cut[cut.length - 1][1]).d) || 1, kind: w.tags.highway, name: w.tags.name || null, major });
    sideRoads.push({
      kind: w.tags.highway,
      width: w.tags.highway === 'track' ? 2.6 : w.tags.highway === 'service' ? 3 : 4.5,
      pts: cut.map(([x, z]) => [r1(x), r1(z), r1(sampleTerrain(x, z) + 0.05)]),
    });
  }
  junctions.sort((a, b) => a.s - b.s);
  console.log(`  ${junctions.length} junctions, ${busStops.length} bus stops, ${cattleGrids.length} cattle grids, ${laybys.length} lay-bys`);

  // Named landmarks
  const landmarks = [];
  const named = (re) => osm.ways.find((w) => re.test(w.tags.name || ''));
  for (const [re, label] of [
    [/^Cunningsburgh Hall$/, 'Cunningsburgh Hall'],
    [/^Mail Kirk$/, 'Mail Kirk'],
    [/Cunningsburgh United Free Church/, 'Cunningsburgh Kirk'],
    [/Cunningsburgh Primary School/, 'Cunningsburgh School'],
  ]) {
    const w = named(re);
    if (!w) continue;
    const p = wayPts(w);
    const cx = p.reduce((s, q) => s + q.lat, 0) / p.length;
    const cy = p.reduce((s, q) => s + q.lon, 0) / p.length;
    const [x, z] = project(cx, cy);
    const f = roadFrame(x, z);
    landmarks.push({ name: label, s: f.s, d: r1(f.d), x: r1(x), z: r1(z) });
  }
  const aithJ = junctions.reduce(
    (best, j) => {
      const [jx, jz] = line[Math.round(j.s / SAMPLE)];
      const d = dist([jx, jz], project(60.0604, -1.222));
      return d < best.d ? { d, j } : best;
    },
    { d: Infinity, j: null },
  );
  if (aithJ.j) {
    aithJ.j.name = 'Aithsetter';
    landmarks.push({ name: 'Aithsetter junction', s: aithJ.j.s, d: aithJ.j.side * 6 });
  }

  const out = {
    version: 1,
    id: 'a970-cunningsburgh-sb',
    attribution: 'Map data © OpenStreetMap contributors (ODbL). Elevation: Mapzen Terrarium / AWS Open Data.',
    origin: { lat: LAT0, lon: LON0 },
    route: { start: routeStart, end: routeEnd, startName: ROUTE.start.name, endName: ROUTE.end.name },
    village: { start: villageStart, end: villageEnd, name: 'Cunningsburgh' },
    road: {
      step: SAMPLE,
      x: line.map((p) => r1(p[0])),
      z: line.map((p) => r1(p[1])),
      y: roadY.map(r2),
    },
    terrain: { minX, minZ, cell: TERRAIN_CELL, cols, rows, h: heights, roadDist },
    buildings,
    walls,
    lochs,
    coast,
    busStops,
    cattleGrids,
    laybys,
    junctions,
    sideRoads,
    places,
    landmarks,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

function chainWays(ways) {
  // Build node-level chain using end node ids, geometry carried along.
  const items = ways.map((w) => ({
    first: w.nds[0],
    last: w.nds[w.nds.length - 1],
    pts: w.geom.map((g) => ({ lat: g.lat, lon: g.lon, limit: limitOf(w) })),
  }));
  const used = new Set();
  let chain = [...items[0].pts];
  let head = items[0].first;
  let tail = items[0].last;
  used.add(0);
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const it = items[i];
      if (it.first === tail) chain = chain.concat(it.pts.slice(1)), (tail = it.last);
      else if (it.last === tail) chain = chain.concat([...it.pts].reverse().slice(1)), (tail = it.first);
      else if (it.last === head) chain = it.pts.slice(0, -1).concat(chain), (head = it.first);
      else if (it.first === head) chain = [...it.pts].reverse().slice(0, -1).concat(chain), (head = it.last);
      else continue;
      used.add(i);
      grew = true;
    }
  }
  console.log(`  chained ${used.size}/${items.length} ways into ${chain.length} points`);
  return chain;
}

function limitOf(w) {
  const m = /(\d+)\s*mph/.exec(w.tags.maxspeed || '');
  if (m) return +m[1];
  return 60; // national speed limit, single carriageway
}

function nearestIndex(line, xz) {
  let bi = 0;
  let bd = Infinity;
  line.forEach((p, i) => {
    const d = dist(p, xz);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

function makeRoadIndex(line, cell) {
  const map = new Map();
  line.forEach(([x, z], i) => {
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  return {
    nearest(x, z) {
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      let best = { i: 0, d: Infinity };
      for (let ring = 0; ring < 80; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dz = -ring; dz <= ring; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const list = map.get(`${cx + dx},${cz + dz}`);
            if (!list) continue;
            for (const i of list) {
              const d = Math.hypot(line[i][0] - x, line[i][1] - z);
              if (d < best.d) best = { i, d };
            }
          }
        }
        if (best.d < ring * cell) break;
      }
      return best;
    },
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
