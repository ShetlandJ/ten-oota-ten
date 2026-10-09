// Static scenery: crofts, kirks, drystone walls, poles, sheep, bus shelters, signs.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { Rng } from '../util/rng.js';
import { part, merge, box, cyl, ico, gable, lambert } from '../util/geo.js';

const WALL_COLOURS = ['#f3f1ea', '#ece7da', '#f7f5ef', '#e3ddcf', '#d9d6cc'];
const ROOF_COLOURS = ['#3e444b', '#474c52', '#353a40', '#5a3a30'];
const SHED_COLOURS = ['#8d3b2f', '#5f7357', '#7b7f84', '#3f5e74'];

export function buildScenery(road, terrain, data, seed = 'scenery') {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const mat = lambert();
  const obstacles = [];

  const bld = buildings(road, terrain, data.buildings, rng, obstacles);
  const bmesh = new THREE.Mesh(bld, mat);
  bmesh.castShadow = true;
  bmesh.receiveShadow = true;
  group.add(bmesh);

  group.add(walls(road, terrain, data.walls, rng, mat));
  group.add(poles(road, terrain, rng, mat));
  group.add(busShelters(road, data.busStops, mat));
  group.add(signs(road, data));
  const sheep = flock(road, terrain, rng, obstacles, mat);
  group.add(sheep);
  group.add(tussocks(road, terrain, data, rng, obstacles));
  return { group, sheep };
}

// ---- Buildings ---------------------------------------------------------------
function buildings(road, terrain, list, rng, obstacles) {
  const parts = [];
  for (const b of list) {
    const pr = road.project(b.x, b.z);
    if (pr.dist < ROAD.halfWidth + 2 + b.d / 2) continue; // footprint error onto the road
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    let y = Infinity;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = (u * b.w) / 2;
      const lz = (v * b.d) / 2;
      y = Math.min(y, terrain.heightAt(b.x + lx * c - lz * s, b.z + lx * s + lz * c));
    }
    if (y < 0.5) continue;
    obstacles.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2 + 3 });
    const local = [];
    const wallCol = rng.pick(WALL_COLOURS);
    const roofCol = rng.pick(ROOF_COLOURS);
    const W = b.w;
    const D = b.d;
    const base = 1.2; // plinth below ground for slopes
    if (b.kind === 'shed') {
      const h = 2.4;
      const col = rng.pick(SHED_COLOURS);
      local.push(part(box(W, h + base, D), col, { y: (h - base) / 2 }));
      local.push(part(gable(W, D, 0.8, 0.15), '#5d6166', { y: h }));
    } else if (b.kind === 'kirk') {
      const h = 5.5;
      local.push(part(box(W, h + base, D), '#ece8de', { y: (h - base) / 2 }));
      local.push(part(gable(W, D, 4.2, 0.35), '#3a3f45', { y: h }));
      // Bell-cote on the west gable
      local.push(part(box(1.6, 3.2, 1.6), '#ece8de', { x: -W / 2 + 0.6, y: h + 4.2 + 0.4 }));
      local.push(part(gable(1.8, 1.8, 1.2, 0.1), '#3a3f45', { x: -W / 2 + 0.6, y: h + 5.9 }));
      // Tall windows
      for (let k = -2; k <= 2; k++) {
        local.push(part(box(0.9, 2.6, 0.12), '#33414a', { x: k * (W / 6), y: 2.8, z: D / 2 + 0.02 }));
        local.push(part(box(0.9, 2.6, 0.12), '#33414a', { x: k * (W / 6), y: 2.8, z: -D / 2 - 0.02 }));
      }
    } else if (b.kind === 'hall') {
      const h = 4.6;
      local.push(part(box(W, h + base, D), '#e6e2d4', { y: (h - base) / 2 }));
      local.push(part(gable(W, D, 2.2, 0.4), '#4a5058', { y: h }));
      for (let k = -3; k <= 3; k++) local.push(part(box(1.4, 1.3, 0.12), '#33414a', { x: k * (W / 8), y: 2.6, z: D / 2 + 0.02 }));
      local.push(part(box(1.8, 2.4, 0.15), '#2f5d7d', { x: 0, y: 1.2, z: D / 2 + 0.05 }));
    } else {
      // Croft house: 1.5 storey, steep slate roof, chimneys on the gables.
      const h = W > 11 ? 3.1 : 2.8;
      local.push(part(box(W, h + base, D), wallCol, { y: (h - base) / 2 }));
      const rh = Math.min(3.6, D * 0.55);
      local.push(part(gable(W, D, rh, 0.25), roofCol, { y: h }));
      local.push(part(box(0.7, 1.4, 0.9), wallCol, { x: -W / 2 + 0.35, y: h + rh - 0.1 }));
      local.push(part(box(0.7, 1.4, 0.9), wallCol, { x: W / 2 - 0.35, y: h + rh - 0.1 }));
      const nWin = Math.max(1, Math.floor(W / 3.5));
      for (let k = 0; k < nWin; k++) {
        const x = -W / 2 + ((k + 0.5) * W) / nWin;
        local.push(part(box(0.9, 1.0, 0.1), '#34434d', { x, y: 1.5, z: D / 2 + 0.02 }));
        local.push(part(box(0.9, 1.0, 0.1), '#34434d', { x, y: 1.5, z: -D / 2 - 0.02 }));
      }
      local.push(part(box(0.9, 1.9, 0.12), rng.pick(['#2f5d7d', '#8d3b2f', '#3d6b4a', '#c9a227']), { x: 0.2, y: 0.95, z: D / 2 + 0.04 }));
      // Dormers on bigger houses
      if (W > 9 && rng.chance(0.6)) {
        for (const x of [-W / 4, W / 4]) {
          local.push(part(box(1.4, 1.2, 1.2), wallCol, { x, y: h + 0.9, z: D / 4 }));
          local.push(part(gable(1.4, 1.2, 0.6, 0.1), roofCol, { x, y: h + 1.5, z: D / 4 }));
        }
      }
    }
    const g = merge(local);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(b.x, y, b.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.rot),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    parts.push(g);
  }
  return merge(parts);
}

// ---- Drystone walls & fences ------------------------------------------------
function walls(road, terrain, osmWalls, rng, mat) {
  const segs = [];
  const add = (x0, z0, x1, z1, kind) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.5) return;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    if (terrain.heightAt(mx, mz) < 1) return;
    const pr = road.project(mx, mz);
    if (pr.dist < ROAD.halfWidth + 2.5) return;
    segs.push({ x0, z0, x1, z1, kind });
  };
  for (const w of osmWalls) {
    for (let i = 1; i < w.pts.length; i++) add(w.pts[i - 1][0], w.pts[i - 1][1], w.pts[i][0], w.pts[i][1], w.kind);
  }
  // Procedural walls along the A970 and field dykes running off it (outside the village core).
  const f = {};
  const sideOffset = { [-1]: 9 + rng.range(0, 3), [1]: 9 + rng.range(0, 3) };
  for (const side of [-1, 1]) {
    let s = 0;
    while (s < road.length - 10) {
      const runLen = rng.range(60, 220);
      const gap = rng.range(8, 40);
      const off = sideOffset[side] + rng.range(-1.5, 1.5);
      const inVillage = s > road.village.start + 150 && s < road.village.end - 150;
      if (!inVillage || rng.chance(0.25)) {
        for (let t = s; t < Math.min(s + runLen, road.length - 6); t += 6) {
          const a = road.pos(t, side * off, {});
          const b = road.pos(t + 6, side * off, {});
          add(a.x, a.z, b.x, b.z, 'wall');
        }
        // Field dyke heading off into the hills
        if (rng.chance(0.55)) {
          road.frame(s + runLen, f);
          const start = road.pos(s + runLen, side * off, {});
          const ang = Math.atan2(f.nx * side, f.nz * side) + rng.range(-0.35, 0.35);
          const len = rng.range(60, 260);
          let px = start.x;
          let pz = start.z;
          for (let k = 0; k < len; k += 6) {
            const nx = px + Math.sin(ang) * 6;
            const nz = pz + Math.cos(ang) * 6;
            add(px, pz, nx, nz, 'wall');
            px = nx;
            pz = nz;
          }
        }
      }
      s += runLen + gap;
    }
  }

  const group = new THREE.Group();
  const wallGeo = merge([part(box(1, 1, 1), '#ffffff', { y: 0.5 })]);
  const stoneMat = mat;
  const walls = segs.filter((s) => s.kind === 'wall');
  const fences = segs.filter((s) => s.kind === 'fence');
  const im = new THREE.InstancedMesh(wallGeo, stoneMat, walls.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  walls.forEach((w, i) => {
    const y0 = terrain.heightAt(w.x0, w.z0);
    const y1 = terrain.heightAt(w.x1, w.z1);
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0) + 0.15;
    dummy.position.set((w.x0 + w.x1) / 2, (y0 + y1) / 2 - 0.15, (w.z0 + w.z1) / 2);
    dummy.rotation.set(0, Math.atan2(w.x1 - w.x0, w.z1 - w.z0), 0);
    dummy.rotation.x = 0;
    dummy.scale.set(0.6, 0.95 + rng.range(-0.15, 0.12), len);
    // tilt to follow slope
    const pitch = Math.atan2(y1 - y0, len);
    dummy.rotateX(-pitch);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    col.set(rng.pick(['#9a978b', '#8b887d', '#a39f92', '#928e80', '#85837a']));
    im.setColorAt(i, col);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  group.add(im);

  // Fence posts
  const posts = [];
  for (const fz of fences) {
    const len = Math.hypot(fz.x1 - fz.x0, fz.z1 - fz.z0);
    for (let t = 0; t < len; t += 3) posts.push([fz.x0 + ((fz.x1 - fz.x0) * t) / len, fz.z0 + ((fz.z1 - fz.z0) * t) / len]);
  }
  if (posts.length) {
    const pg = merge([part(box(0.14, 1.2, 0.14), '#6e5b45', { y: 0.6 })]);
    const pm = new THREE.InstancedMesh(pg, mat, posts.length);
    posts.forEach(([x, z], i) => {
      dummy.position.set(x, terrain.heightAt(x, z), z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pm.setMatrixAt(i, dummy.matrix);
    });
    group.add(pm);
  }
  return group;
}

// ---- Telegraph poles ----------------------------------------------------------
function poles(road, terrain, rng, mat) {
  const pts = [];
  const side = 1;
  const off = 7.5;
  for (let s = 20; s < road.length - 20; s += 55 + rng.range(-6, 6)) {
    const p = road.pos(s, side * off, {});
    if (terrain.heightAt(p.x, p.z) < 1) continue;
    pts.push(p);
  }
  const g = merge([part(cyl(0.12, 0.16, 8, 6), '#5b4a3a', { y: 4 }), part(box(1.4, 0.12, 0.12), '#5b4a3a', { y: 7.6 })]);
  const im = new THREE.InstancedMesh(g, mat, pts.length);
  const dummy = new THREE.Object3D();
  const wire = [];
  const f = {};
  pts.forEach((p, i) => {
    const y = terrain.heightAt(p.x, p.z);
    p.y = y;
    const pr = road.project(p.x, p.z);
    road.frame(pr.s, f);
    dummy.position.set(p.x, y, p.z);
    dummy.rotation.set(0, f.heading, 0);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    if (i) {
      const a = pts[i - 1];
      for (const dx of [-0.6, 0.6]) {
        // sagging wire in 4 pieces
        const steps = 4;
        for (let k = 0; k < steps; k++) {
          const u0 = k / steps;
          const u1 = (k + 1) / steps;
          const sag = (u) => -Math.sin(u * Math.PI) * 0.6;
          const P = (u) => [
            a.x + (p.x - a.x) * u + Math.cos(f.heading) * dx,
            a.y + (y - a.y) * u + 7.65 + sag(u),
            a.z + (p.z - a.z) * u - Math.sin(f.heading) * dx,
          ];
          wire.push(...P(u0), ...P(u1));
        }
      }
    }
  });
  im.castShadow = true;
  const group = new THREE.Group();
  group.add(im);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2d2d2d' })));
  return group;
}

// ---- Bus shelters ----------------------------------------------------------------
function busShelters(road, stops, mat) {
  const parts = [];
  const f = {};
  for (const b of stops) {
    const side = Math.sign(b.d) || -1;
    road.frame(b.s, f);
    const off = ROAD.halfWidth + 2.2;
    const p = road.pos(b.s, side * off, {});
    const local = [];
    // Bus stop flag pole
    local.push(part(cyl(0.05, 0.05, 2.8, 6), '#c9ccd0', { x: 1.8, y: 1.4 }));
    local.push(part(box(0.06, 0.5, 0.5), '#d23b2c', { x: 1.8, y: 2.6 }));
    local.push(part(box(0.065, 0.3, 0.42), '#f4f3ee', { x: 1.8, y: 2.62 }));
    if (b.shelter) {
      local.push(part(box(2.8, 0.15, 1.6), '#55606a', { y: 2.35 }));
      local.push(part(box(2.8, 2.2, 0.08), '#a9c3cc', { y: 1.1, z: -side * 0.75 }));
      local.push(part(box(0.08, 2.2, 1.5), '#a9c3cc', { x: -1.36, y: 1.1 }));
      local.push(part(box(0.08, 2.2, 1.5), '#a9c3cc', { x: 1.36, y: 1.1 }));
      local.push(part(box(2.2, 0.08, 0.4), '#6d5a45', { y: 0.55, z: -side * 0.45 }));
    }
    const g = merge(local);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, f.y, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.heading + Math.PI / 2),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    parts.push(g);
  }
  const m = new THREE.Mesh(merge(parts), mat);
  m.castShadow = true;
  return m;
}

// ---- Signs -----------------------------------------------------------------------
function signTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const limitTex = {};
function limitTexture(n) {
  if (!limitTex[n])
    limitTex[n] = signTexture((x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.beginPath();
      x.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      x.fillStyle = '#d6232a';
      x.fill();
      x.beginPath();
      x.arc(w / 2, h / 2, w / 2 - 34, 0, Math.PI * 2);
      x.fillStyle = '#fff';
      x.fill();
      x.fillStyle = '#111';
      x.font = 'bold 120px "Arial Narrow", Arial, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(n), w / 2, h / 2 + 6);
    });
  return limitTex[n];
}

function nslTexture() {
  return signTexture((x, w, h) => {
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    x.fillStyle = '#fff';
    x.fill();
    x.lineWidth = 6;
    x.strokeStyle = '#222';
    x.stroke();
    x.save();
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    x.clip();
    x.translate(w / 2, h / 2);
    x.rotate(-Math.PI / 4);
    x.fillStyle = '#111';
    x.fillRect(-w, -18, w * 2, 36);
    x.restore();
  });
}

function nameTexture(lines, sub) {
  return signTexture(
    (x, w, h) => {
      x.fillStyle = '#fff';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#111';
      x.lineWidth = 10;
      x.strokeRect(10, 10, w - 20, h - 20);
      x.fillStyle = '#111';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = 'bold 74px "Arial Narrow", Arial, sans-serif';
      x.fillText(lines, w / 2, sub ? h * 0.4 : h / 2);
      if (sub) {
        x.font = '40px "Arial Narrow", Arial, sans-serif';
        x.fillText(sub, w / 2, h * 0.74);
      }
    },
    512,
    220,
  );
}

function fingerTexture(text) {
  return signTexture(
    (x, w, h) => {
      x.fillStyle = '#fff';
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(w - 50, 0);
      x.lineTo(w, h / 2);
      x.lineTo(w - 50, h);
      x.lineTo(0, h);
      x.closePath();
      x.fill();
      x.fillStyle = '#111';
      x.font = 'bold 56px "Arial Narrow", Arial, sans-serif';
      x.textBaseline = 'middle';
      x.fillText(text, 24, h / 2 + 2);
    },
    512,
    96,
  );
}

function signPost(road, s, side, tex, w, h, postH = 1.6) {
  const g = new THREE.Group();
  const f = road.frame(s, {});
  const p = road.pos(s, side * (ROAD.halfWidth + 1.6), {});
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, postH + h / 2, 6), new THREE.MeshLambertMaterial({ color: '#9aa0a6' }));
  post.position.y = (postH + h / 2) / 2;
  g.add(post);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }),
  );
  plate.position.y = postH + h / 2;
  g.add(plate);
  g.position.set(p.x, f.y, p.z);
  // Face drivers travelling in +s (sign faces -tangent)
  g.rotation.y = f.heading + Math.PI;
  return g;
}

function signs(road, data) {
  const group = new THREE.Group();
  const v = road.village;
  if (v.start != null) {
    // Entering the 50 (southbound), and the national limit after.
    group.add(signPost(road, v.start - 4, -1, limitTexture(50), 1.0, 1.0));
    group.add(signPost(road, v.start - 4, 1, limitTexture(50), 1.0, 1.0));
    group.add(signPost(road, v.start + 8, -1, nameTexture('Cunningsburgh', 'Please drive carefully'), 2.4, 1.03, 1.0));
    group.add(signPost(road, v.end + 4, -1, nslTexture(), 1.0, 1.0));
    group.add(signPost(road, v.end + 4, 1, nslTexture(), 1.0, 1.0));
    group.add(signPost(road, v.end - 40, -1, nameTexture('Mail'), 1.8, 0.77, 1.0));
  }
  for (const j of data.junctions || []) {
    if (j.name === 'Aithsetter') {
      const sign = signPost(road, j.s - 18, j.side, fingerTexture('Aithsetter'), 2.0, 0.38, 1.7);
      group.add(sign);
    }
  }
  const hall = (data.landmarks || []).find((l) => l.name === 'Cunningsburgh Hall');
  if (hall) group.add(signPost(road, hall.s - 30, Math.sign(hall.d) || 1, nameTexture('Cunningsburgh Hall'), 2.2, 0.95, 0.9));
  // The finish: Mousa Sound lay-by
  group.add(signPost(road, road.routeEnd - 60, -1, nameTexture('P  Lay-by', 'Mousa Sound viewpoint'), 2.2, 0.95, 1.0));
  return group;
}

// ---- Sheep -------------------------------------------------------------------------
function sheepGeometry() {
  return merge([
    part(ico(0.55, 0), '#f1efe6', { y: 0.75, sx: 1.25, sy: 0.85, sz: 0.85 }),
    part(box(0.3, 0.32, 0.42), '#262626', { y: 0.92, z: 0.72 }),
    part(box(0.36, 0.08, 0.12), '#262626', { y: 1.02, z: 0.62 }),
    part(box(0.1, 0.45, 0.1), '#262626', { x: 0.25, y: 0.22, z: 0.3 }),
    part(box(0.1, 0.45, 0.1), '#262626', { x: -0.25, y: 0.22, z: 0.3 }),
    part(box(0.1, 0.45, 0.1), '#262626', { x: 0.25, y: 0.22, z: -0.3 }),
    part(box(0.1, 0.45, 0.1), '#262626', { x: -0.25, y: 0.22, z: -0.3 }),
  ]);
}

function flock(road, terrain, rng, obstacles, mat) {
  const spots = [];
  const g = sheepGeometry();
  // Flocks in the fields either side of the road
  for (let k = 0; k < 34; k++) {
    const s = rng.range(100, road.length - 100);
    const side = rng.chance(0.5) ? 1 : -1;
    const off = rng.range(14, 320);
    const c = road.pos(s, side * off, {});
    const n = rng.int(2, 7);
    for (let i = 0; i < n; i++) {
      const x = c.x + rng.range(-14, 14);
      const z = c.z + rng.range(-14, 14);
      const y = terrain.heightAt(x, z);
      if (y < 2) continue;
      if (road.project(x, z, s).dist < ROAD.halfWidth + 6) continue;
      if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
      spots.push({ x, z, y, rot: rng.range(0, Math.PI * 2), phase: rng.range(0, 10) });
    }
  }
  // A few verge-grazers right by the road, as is tradition
  for (let k = 0; k < 7; k++) {
    const s = rng.range(road.routeStart + 200, road.routeEnd - 100);
    const side = rng.chance(0.7) ? -1 : 1;
    const p = road.pos(s, side * rng.range(4.6, 6), {});
    const y = terrain.heightAt(p.x, p.z);
    if (y < 2) continue;
    spots.push({ x: p.x, z: p.z, y: Math.max(y, road.heightAt(s) - 0.2), rot: rng.range(0, Math.PI * 2), phase: rng.range(0, 10) });
  }
  const im = new THREE.InstancedMesh(g, mat, spots.length);
  im.castShadow = true;
  const dummy = new THREE.Object3D();
  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.userData.spots = spots;
  return im;
}

// ---- Tussocks --------------------------------------------------------------------
// Clumps of rough grass and rushes along the verges and into the fields, so the
// ground near the road isn't one flat green. One instanced draw, no shadows.
const TUSSOCK_COLOURS = ['#6f8f45', '#7d9a4c', '#8f9f55', '#5f7d3f', '#6a8a3e', '#8f9f55', '#a7a463', '#b5ab72'];

function tussockGeometry() {
  const blade = (h, rx, rz, x, z) => part(new THREE.ConeGeometry(0.09, h, 3, 1, true), '#ffffff', { x, y: h / 2, z, rx, rz });
  return merge([
    blade(0.55, 0, 0, 0, 0),
    blade(0.45, 0.35, 0.1, 0.05, 0.08),
    blade(0.42, -0.3, 0.25, -0.06, -0.04),
    blade(0.38, 0.1, -0.4, 0.08, -0.06),
    blade(0.35, -0.15, -0.3, -0.07, 0.07),
  ]);
}

function tussocks(road, terrain, data, rng, obstacles) {
  // Keep off side roads, lay-bys and bus stops
  const keepOut = [];
  for (const sr of data.sideRoads || []) {
    for (let i = 1; i < sr.pts.length; i++) {
      const [x0, z0] = sr.pts[i - 1];
      const [x1, z1] = sr.pts[i];
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
      for (let k = 0; k <= n; k++) keepOut.push({ x: x0 + ((x1 - x0) * k) / n, z: z0 + ((z1 - z0) * k) / n, r: sr.width / 2 + 1.2 });
    }
  }
  for (const l of [...(data.laybys || []), ...(data.busStops || [])]) {
    for (let ds = -40; ds <= 40; ds += 4) {
      const p = road.pos(l.s + ds, l.d, {});
      keepOut.push({ x: p.x, z: p.z, r: 7 });
    }
  }
  const CELL = 12;
  const grid = new Map();
  for (const o of keepOut) {
    const key = `${Math.floor(o.x / CELL)},${Math.floor(o.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(o);
  }
  const blocked = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = grid.get(`${cx + i},${cz + j}`);
        if (list && list.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) return true;
      }
    }
    return obstacles.some((o) => Math.abs(o.x - x) < o.r && Math.abs(o.z - z) < o.r && Math.hypot(o.x - x, o.z - z) < o.r);
  };

  const spots = [];
  const s0 = Math.max(0, road.routeStart - 150);
  const s1 = Math.min(road.length, road.routeEnd + 150);
  for (let s = s0; s < s1; s += 1.2) {
    for (const side of [-1, 1]) {
      // Dense on the verge, thinning out into the field
      const off = ROAD.halfWidth + 0.9 + Math.pow(rng.next(), 1.8) * 34;
      if (rng.next() > 0.85) continue;
      const p = road.pos(s + rng.range(-0.8, 0.8), side * off, {});
      if (blocked(p.x, p.z)) continue;
      let y = terrain.heightAt(p.x, p.z);
      if (y < 2) continue;
      // The verge is graded to the road; don't leave clumps hanging off a cutting
      if (off < 7) y = Math.max(y, road.heightAt(s) - 0.25);
      spots.push({ x: p.x, y: y - 0.05, z: p.z, rot: rng.range(0, Math.PI * 2), sc: rng.range(0.9, 1.7), sy: rng.range(0.75, 1.3), col: rng.pick(TUSSOCK_COLOURS) });
    }
  }
  const im = new THREE.InstancedMesh(tussockGeometry(), lambert(), spots.length);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.sc, p.sc * p.sy, p.sc);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    im.setColorAt(i, c.set(p.col));
  });
  im.receiveShadow = true;
  im.matrixAutoUpdate = false;
  return im;
}

// Gentle grazing animation: only a handful nudge each frame.
export function animateSheep(im, t) {
  const spots = im.userData.spots;
  if (!spots) return;
  const dummy = animateSheep.dummy || (animateSheep.dummy = new THREE.Object3D());
  const k0 = Math.floor(t * 7) % spots.length;
  for (let k = 0; k < 6; k++) {
    const i = (k0 + k * 17) % spots.length;
    const p = spots[i];
    dummy.position.set(p.x, p.y + Math.max(0, Math.sin(t * 3 + p.phase)) * 0.04, p.z);
    dummy.rotation.set(0, p.rot + Math.sin(t * 0.2 + p.phase) * 0.6, 0);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
}
