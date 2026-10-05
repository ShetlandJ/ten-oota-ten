// Road surface, markings, side roads and lay-bys.
import * as THREE from 'three';
import { ROAD } from '../config.js';

const ASPHALT = '#4b4e53';
const ASPHALT_SIDE = '#55585c';
const GRAVEL = '#9b9282';
const PAINT = '#f4f3ee';

export function buildRoad(road, terrain, data) {
  const group = new THREE.Group();
  group.add(asphalt(road));
  group.add(markings(road));
  group.add(sideRoads(road, terrain, data.sideRoads || []));
  group.add(laybys(road, data.laybys || []));
  group.add(cattleGrids(road, terrain, data.cattleGrids || [], data.sideRoads || []));
  return group;
}

function asphalt(road) {
  const n = road.n;
  const pos = [];
  const idx = [];
  const half = ROAD.halfWidth + 0.15;
  const f = {};
  for (let i = 0; i < n; i++) {
    road.frame(i * road.step, f);
    const y = f.y + 0.06;
    pos.push(f.x - f.nx * half, y, f.z - f.nz * half, f.x + f.nx * half, y, f.z + f.nz * half);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixUp(g);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshLambertMaterial({ color: ASPHALT, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  m.receiveShadow = true;
  return m;
}

// Normals must point up regardless of winding direction of the ribbon.
function fixUp(g) {
  const n = g.attributes.normal;
  if (n.getY(0) < 0) {
    const index = g.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
    g.computeVertexNormals();
  }
}

function markings(road) {
  const pos = [];
  const f0 = {};
  const f1 = {};
  const quad = (s0, s1, d, w) => {
    road.frame(s0, f0);
    road.frame(s1, f1);
    const y0 = f0.y + 0.075;
    const y1 = f1.y + 0.075;
    const a = [f0.x + f0.nx * (d - w / 2), y0, f0.z + f0.nz * (d - w / 2)];
    const b = [f0.x + f0.nx * (d + w / 2), y0, f0.z + f0.nz * (d + w / 2)];
    const c = [f1.x + f1.nx * (d - w / 2), y1, f1.z + f1.nz * (d - w / 2)];
    const e = [f1.x + f1.nx * (d + w / 2), y1, f1.z + f1.nz * (d + w / 2)];
    pos.push(...a, ...b, ...c, ...b, ...e, ...c);
  };

  const STEP = 1.5;
  for (let s = 0; s < road.length - STEP; s += STEP) {
    const mid = s + STEP / 2;
    // Edge lines
    quad(s, s + STEP, -ROAD.edgeLine, 0.12);
    quad(s, s + STEP, ROAD.edgeLine, 0.12);
    // Centre line: solid where overtaking is restricted, warning dashes on approach, else short dashes.
    let painted;
    if (road.solidAt(mid)) {
      painted = true;
    } else if (road.solidAt(mid + 50) || road.solidAt(mid + 25)) {
      painted = mid % 9 < 6;
    } else {
      painted = mid % 9 < 3;
    }
    if (painted) quad(s, s + STEP, 0, road.solidAt(mid) ? 0.16 : 0.12);
    // Second solid line on our side to read clearly as "no overtaking"
    if (road.solidAt(mid)) quad(s, s + STEP, -0.28, 0.14);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const normals = g.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshLambertMaterial({
      color: PAINT,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    }),
  );
  m.receiveShadow = true;
  return m;
}

function ribbon(points, width, yFn) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const L = Math.hypot(tx, tz) || 1;
    tx /= L;
    tz /= L;
    const nx = -tz;
    const nz = tx;
    const [x, z] = points[i];
    const y = yFn(x, z, i);
    pos.push(x - (nx * width) / 2, y, z - (nz * width) / 2, x + (nx * width) / 2, y, z + (nz * width) / 2);
    if (i) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixUp(g);
  return g;
}

function sideRoads(road, terrain, list) {
  const group = new THREE.Group();
  const matA = new THREE.MeshLambertMaterial({ color: ASPHALT_SIDE, polygonOffset: true, polygonOffsetFactor: -1 });
  const matG = new THREE.MeshLambertMaterial({ color: GRAVEL, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const sr of list) {
    // Start just outside the main carriageway edge so surfaces don't fight.
    const pts = [];
    let started = false;
    for (const p of sr.pts) {
      const pr = road.project(p[0], p[1]);
      if (!started && pr.dist < ROAD.halfWidth + 0.5) continue;
      started = true;
      pts.push([p[0], p[1]]);
    }
    if (pts.length < 2) continue;
    // Prepend the exact edge point so the side road meets the A970 cleanly.
    const first = road.project(pts[0][0], pts[0][1]);
    const edge = road.pos(first.s, Math.sign(first.d) * (ROAD.halfWidth + 0.1));
    pts.unshift([edge.x, edge.z]);
    const g = ribbon(pts, sr.width, (x, z) => {
      const pr = road.project(x, z, first.s);
      const t = Math.min(1, Math.max(0, (pr.dist - 4) / 10));
      const roadH = road.heightAt(pr.s) + 0.03;
      return roadH * (1 - t) + (terrain.heightAt(x, z) + 0.12) * t;
    });
    const m = new THREE.Mesh(g, sr.kind === 'track' || sr.kind === 'service' ? matG : matA);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function laybys(road, list) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: ASPHALT_SIDE, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const l of list) {
    const side = Math.sign(l.d) || -1;
    const pos = [];
    const idx = [];
    const f = {};
    const len = 70;
    const steps = 24;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const s = l.s - len / 2 + u * len;
      road.frame(s, f);
      const taper = Math.min(1, Math.min(u, 1 - u) * 4);
      const inner = ROAD.halfWidth - 0.2;
      const outer = ROAD.halfWidth + 0.2 + 3.2 * taper;
      const y = f.y + 0.04;
      pos.push(f.x + f.nx * side * inner, y, f.z + f.nz * side * inner, f.x + f.nx * side * outer, y, f.z + f.nz * side * outer);
      if (k) {
        const a = (k - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    fixUp(g);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function cattleGrids(road, terrain, grids, sideRoads) {
  const group = new THREE.Group();
  const tex = stripes();
  const mat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  for (const g of grids) {
    // Orient across the nearest side road segment.
    let best = null;
    for (const sr of sideRoads) {
      for (let i = 1; i < sr.pts.length; i++) {
        const p = sr.pts[i];
        const d = Math.hypot(p[0] - g.x, p[1] - g.z);
        if (!best || d < best.d) best = { d, a: sr.pts[i - 1], b: p, w: sr.width };
      }
    }
    if (!best || best.d > 15) continue;
    const ang = Math.atan2(best.b[0] - best.a[0], best.b[1] - best.a[1]);
    const geo = new THREE.PlaneGeometry(best.w + 0.6, 2.4);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    const pr = road.project(g.x, g.z);
    const y = pr.dist < 14 ? road.heightAt(pr.s) + 0.1 : terrain.heightAt(g.x, g.z) + 0.16;
    m.position.set(g.x, y, g.z);
    m.rotation.y = ang;
    group.add(m);
  }
  return group;
}

function stripes() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#2b2b2b';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#9aa0a6';
  for (let i = 0; i < 8; i++) x.fillRect(0, i * 8 + 1, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
