// Chunky low-poly vehicles and Daniel. All models face +z, origin on the ground.
import * as THREE from 'three';
import { part, merge, box, cyl, ico, lambert } from '../util/geo.js';

const sharedMat = lambert();

function lamp(color, emissive) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0 });
}

function lampMesh(mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function wheels(list, r, w) {
  const parts = [];
  for (const [x, z] of list) {
    parts.push(part(cyl(r, r, w, 10), '#1f2124', { x, y: r, z, rz: Math.PI / 2 }));
    parts.push(part(cyl(r * 0.5, r * 0.5, w + 0.02, 8), '#b9bdc2', { x, y: r, z, rz: Math.PI / 2 }));
  }
  return parts;
}

// Indicator lamps get their own materials so they can blink independently.
function addIndicators(group, spots) {
  const left = lamp('#a8650f', '#ffad1f');
  const right = lamp('#a8650f', '#ffad1f');
  for (const [x, y, z, w = 0.16, h = 0.1, d = 0.06] of spots) {
    group.add(lampMesh(x < 0 ? right : left, w, h, d, x, y, z));
  }
  return { left, right };
}

export function playerCar(colour = '#d8432f') {
  const g = new THREE.Group();
  const body = merge([
    part(box(1.8, 0.62, 4.3), colour, { y: 0.56 }),
    part(box(1.62, 0.56, 2.3), '#28343d', { y: 1.15, z: -0.25 }),
    part(box(1.66, 0.1, 2.05), colour, { y: 1.47, z: -0.3 }),
    part(box(0.12, 0.5, 0.12), colour, { x: 0.78, y: 1.17, z: 0.88 }),
    part(box(0.12, 0.5, 0.12), colour, { x: -0.78, y: 1.17, z: 0.88 }),
    part(box(1.84, 0.22, 0.25), '#2d3035', { y: 0.36, z: 2.12 }),
    part(box(1.84, 0.22, 0.25), '#2d3035', { y: 0.36, z: -2.12 }),
    part(box(1.1, 0.16, 0.06), '#22262a', { y: 0.62, z: 2.16 }),
    part(box(0.22, 0.14, 0.2), colour, { x: 0.98, y: 1.0, z: 0.75 }),
    part(box(0.22, 0.14, 0.2), colour, { x: -0.98, y: 1.0, z: 0.75 }),
    ...wheels(
      [
        [0.82, 1.35],
        [-0.82, 1.35],
        [0.82, -1.35],
        [-0.82, -1.35],
      ],
      0.34,
      0.26,
    ),
  ]);
  const mesh = new THREE.Mesh(body, sharedMat);
  mesh.castShadow = true;
  g.add(mesh);
  const head = lamp('#fff3c4', '#fff3c4');
  head.emissiveIntensity = 0.4;
  g.add(lampMesh(head, 0.34, 0.16, 0.05, 0.62, 0.72, 2.16));
  g.add(lampMesh(head, 0.34, 0.16, 0.05, -0.62, 0.72, 2.16));
  const brake = lamp('#7a1410', '#ff2a1a');
  g.add(lampMesh(brake, 0.32, 0.16, 0.05, 0.6, 0.8, -2.16));
  g.add(lampMesh(brake, 0.32, 0.16, 0.05, -0.6, 0.8, -2.16));
  const ind = addIndicators(g, [
    [0.84, 0.72, 2.16, 0.12],
    [-0.84, 0.72, 2.16, 0.12],
    [0.84, 0.8, -2.16, 0.12],
    [-0.84, 0.8, -2.16, 0.12],
    [1.1, 1.0, 0.75, 0.04, 0.08, 0.16],
    [-1.1, 1.0, 0.75, 0.04, 0.08, 0.16],
  ]);
  return { group: g, indicators: ind, brake, length: 4.3, width: 1.8 };
}

const CAR_COLOURS = ['#e9e9e4', '#b8bcc0', '#22262b', '#24426b', '#a8302a', '#e3b23c', '#3f6b4a', '#d9cdb0', '#5b6770', '#c9562d'];

export function oncomingModel(type, rng) {
  const g = new THREE.Group();
  let parts;
  let length;
  let width;
  let lightY = 0.72;
  let front;
  if (type === 'van') {
    const c = rng.pick(['#f1f1ee', '#e9e9e4', '#c7ccd1', '#b7322a', '#2d4f7c']);
    length = 5.2;
    width = 2.0;
    front = 2.6;
    parts = [
      part(box(2.0, 1.9, 4.0), c, { y: 1.25, z: -0.6 }),
      part(box(2.0, 0.9, 1.2), c, { y: 0.75, z: 2.0 }),
      part(box(1.9, 0.6, 0.6), '#28343d', { y: 1.55, z: 1.25 }),
      part(box(2.04, 0.22, 0.25), '#2d3035', { y: 0.38, z: 2.55 }),
      ...wheels([[0.9, 1.7], [-0.9, 1.7], [0.9, -1.7], [-0.9, -1.7]], 0.36, 0.28),
    ];
    lightY = 0.85;
  } else if (type === 'lorry') {
    // Milk tanker, like the one in the reel.
    length = 9.5;
    width = 2.5;
    front = 4.75;
    lightY = 0.95;
    parts = [
      part(box(2.45, 2.2, 2.0), '#f2f2ee', { y: 1.75, z: 3.6 }),
      part(box(2.3, 0.8, 0.08), '#28343d', { y: 2.3, z: 4.62 }),
      part(box(2.5, 0.3, 0.3), '#2d3035', { y: 0.55, z: 4.6 }),
      part(box(1.4, 0.4, 7.0), '#3a3d42', { y: 0.75, z: -1.0 }),
      part(cyl(1.15, 1.15, 6.4, 12), '#d9dde0', { y: 2.15, z: -1.4, rx: Math.PI / 2 }),
      part(cyl(1.17, 1.17, 1.2, 12), '#24426b', { y: 2.15, z: -1.4, rx: Math.PI / 2 }),
      part(box(2.4, 1.2, 0.8), '#c8ccd0', { y: 1.4, z: -4.6 }),
      ...wheels([[1.0, 3.4], [-1.0, 3.4], [1.0, -2.6], [-1.0, -2.6], [1.0, -3.8], [-1.0, -3.8]], 0.52, 0.42),
    ];
  } else if (type === 'tractor') {
    const c = rng.pick(['#b8272b', '#3a7d32', '#2f5d9b']);
    length = 4.0;
    width = 2.2;
    front = 2.0;
    lightY = 1.3;
    parts = [
      part(box(1.0, 1.0, 2.2), c, { y: 1.25, z: 0.7 }),
      part(box(1.6, 1.4, 1.4), '#2a2f33', { y: 2.2, z: -0.7 }),
      part(box(1.7, 0.12, 1.6), c, { y: 2.95, z: -0.7 }),
      part(box(1.4, 0.2, 0.2), '#555', { y: 1.9, z: 1.7 }),
      part(cyl(0.09, 0.09, 0.9, 6), '#333', { x: 0.3, y: 2.1, z: 1.2 }),
      part(cyl(0.75, 0.75, 0.5, 12), '#1f2124', { x: 0.95, y: 0.75, z: -0.8, rz: Math.PI / 2 }),
      part(cyl(0.75, 0.75, 0.5, 12), '#1f2124', { x: -0.95, y: 0.75, z: -0.8, rz: Math.PI / 2 }),
      part(cyl(0.38, 0.38, 0.6, 10), c, { x: 0.95, y: 0.75, z: -0.8, rz: Math.PI / 2 }),
      part(cyl(0.38, 0.38, 0.6, 10), c, { x: -0.95, y: 0.75, z: -0.8, rz: Math.PI / 2 }),
      part(cyl(0.42, 0.42, 0.3, 10), '#1f2124', { x: 0.75, y: 0.42, z: 1.5, rz: Math.PI / 2 }),
      part(cyl(0.42, 0.42, 0.3, 10), '#1f2124', { x: -0.75, y: 0.42, z: 1.5, rz: Math.PI / 2 }),
    ];
  } else {
    const c = rng.pick(CAR_COLOURS);
    length = 4.2;
    width = 1.8;
    front = 2.1;
    const estate = rng.chance(0.4);
    parts = [
      part(box(1.78, 0.6, 4.2), c, { y: 0.55 }),
      part(box(1.6, 0.52, estate ? 2.7 : 2.1), '#28343d', { y: 1.11, z: estate ? -0.4 : -0.15 }),
      part(box(1.64, 0.1, estate ? 2.5 : 1.85), c, { y: 1.41, z: estate ? -0.45 : -0.2 }),
      part(box(1.82, 0.22, 0.25), '#2d3035', { y: 0.36, z: 2.08 }),
      part(box(1.82, 0.22, 0.25), '#2d3035', { y: 0.36, z: -2.08 }),
      ...wheels([[0.8, 1.3], [-0.8, 1.3], [0.8, -1.3], [-0.8, -1.3]], 0.33, 0.24),
    ];
  }
  const mesh = new THREE.Mesh(merge(parts), sharedMat);
  mesh.castShadow = true;
  g.add(mesh);
  const head = lamp('#fff3c4', '#fff6d8');
  head.emissiveIntensity = 0.5;
  const hx = width / 2 - 0.35;
  g.add(lampMesh(head, 0.32, 0.16, 0.05, hx, lightY, front + 0.03));
  g.add(lampMesh(head, 0.32, 0.16, 0.05, -hx, lightY, front + 0.03));
  if (type === 'tractor') {
    const beacon = lamp('#b86a00', '#ffae00');
    g.add(lampMesh(beacon, 0.25, 0.2, 0.25, 0, 3.12, -0.7));
    g.userData.beacon = beacon;
  }
  return { group: g, head, length, width };
}

// ---- Daniel -------------------------------------------------------------------------
// Black helmet with a fluffy mic, round shades, big beard, hi-vis jacket.
function rod(a, b, t, colour) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = part(box(t, t, len), colour);
  const m = new THREE.Matrix4().lookAt(A, B, new THREE.Vector3(0, 1, 0));
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

const HIVIS = '#d4ee2a';
const SKIN = '#efc19d';
const BEARD = '#8a5428';
const TROUSERS = '#25282c';
const FRAME = '#2b3138';

export function danielModel() {
  const root = new THREE.Group();
  const lean = new THREE.Group(); // whole bike + rider lean/wobble
  root.add(lean);

  // Bike
  const wheelGeo = merge([
    part(new THREE.TorusGeometry(0.33, 0.035, 5, 14), '#1c1d1f', { ry: Math.PI / 2 }),
    part(cyl(0.04, 0.04, 0.1, 6), '#9aa0a6', { rz: Math.PI / 2 }),
    part(box(0.01, 0.62, 0.02), '#9aa0a6'),
    part(box(0.01, 0.02, 0.62), '#9aa0a6'),
  ]);
  const frontWheel = new THREE.Mesh(wheelGeo, sharedMat);
  frontWheel.position.set(0, 0.34, 0.53);
  const rearWheel = new THREE.Mesh(wheelGeo, sharedMat);
  rearWheel.position.set(0, 0.34, -0.5);
  lean.add(frontWheel, rearWheel);

  const frame = merge([
    rod([0, 0.34, -0.5], [0, 0.32, 0.02], 0.05, FRAME), // chainstay
    rod([0, 0.34, -0.5], [0, 0.86, -0.16], 0.045, FRAME), // seatstay
    rod([0, 0.32, 0.02], [0, 0.88, -0.17], 0.06, FRAME), // seat tube
    rod([0, 0.88, -0.17], [0, 0.92, 0.4], 0.06, FRAME), // top tube
    rod([0, 0.32, 0.02], [0, 0.86, 0.4], 0.065, FRAME), // down tube
    rod([0, 0.34, 0.53], [0, 1.02, 0.38], 0.05, FRAME), // fork + head tube
    rod([0, 0.88, -0.17], [0, 0.99, -0.2], 0.03, '#888'), // seat post
    part(box(0.13, 0.05, 0.27), '#1c1d1f', { y: 1.01, z: -0.19 }), // saddle
    part(box(0.48, 0.035, 0.035), '#1c1d1f', { y: 1.05, z: 0.38 }), // bars
    part(box(0.03, 0.07, 0.14), '#1c1d1f', { x: 0.22, y: 1.05, z: 0.44 }),
    part(box(0.03, 0.07, 0.14), '#1c1d1f', { x: -0.22, y: 1.05, z: 0.44 }),
    part(box(0.16, 0.05, 0.42), '#1c1d1f', { y: 0.72, z: -0.48 }), // rack / mudguard
    part(box(0.26, 0.28, 0.36), '#2d3a2f', { x: 0.16, y: 0.6, z: -0.48 }), // pannier
  ]);
  const frameMesh = new THREE.Mesh(frame, sharedMat);
  frameMesh.castShadow = true;
  lean.add(frameMesh);
  const rearLight = lamp('#6b0f0b', '#ff2a1a');
  rearLight.emissiveIntensity = 1;
  lean.add(lampMesh(rearLight, 0.07, 0.05, 0.03, 0, 0.78, -0.7));

  // Cranks
  const crank = new THREE.Group();
  crank.position.set(0, 0.32, 0.02);
  crank.add(new THREE.Mesh(merge([part(box(0.03, 0.34, 0.03), '#555', { x: 0.07 }), part(box(0.03, 0.34, 0.03), '#555', { x: -0.07 })]), sharedMat));
  lean.add(crank);

  // Rider
  const rider = new THREE.Group();
  lean.add(rider);
  const torso = new THREE.Group();
  torso.position.set(0, 1.06, -0.18);
  torso.rotation.x = 0.55;
  rider.add(torso);
  const torsoMesh = new THREE.Mesh(
    merge([
      part(box(0.44, 0.62, 0.27), HIVIS, { y: 0.31 }),
      part(box(0.46, 0.06, 0.29), '#c6cbc9', { y: 0.12 }),
      part(box(0.46, 0.06, 0.29), '#c6cbc9', { y: 0.3 }),
      part(box(0.04, 0.6, 0.02), '#2f3a28', { y: 0.31, z: 0.14 }), // zip
      part(box(0.34, 0.12, 0.3), HIVIS, { y: 0.64 }), // collar
      // arms (upper + fore) reaching to the bars
      rod([0.21, 0.56, 0.02], [0.24, 0.3, 0.48], 0.11, HIVIS),
      rod([-0.21, 0.56, 0.02], [-0.24, 0.3, 0.48], 0.11, HIVIS),
      part(box(0.09, 0.09, 0.1), '#1d1f22', { x: 0.24, y: 0.3, z: 0.52 }),
      part(box(0.09, 0.09, 0.1), '#1d1f22', { x: -0.24, y: 0.3, z: 0.52 }),
    ]),
    sharedMat,
  );
  torsoMesh.castShadow = true;
  torso.add(torsoMesh);

  // Head pivot sits atop the torso; counter-rotated so he looks ahead.
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.04);
  head.rotation.x = -0.45;
  torso.add(head);
  const helmet = new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const headMesh = new THREE.Mesh(
    merge([
      part(ico(0.125, 1), SKIN, { y: 0.1, sx: 0.95, sy: 1.08 }), // head
      part(box(0.05, 0.07, 0.04), SKIN, { x: 0.125, y: 0.1 }), // ears
      part(box(0.05, 0.07, 0.04), SKIN, { x: -0.125, y: 0.1 }),
      // Beard: full, square, ginger-brown, very much the point
      part(box(0.25, 0.17, 0.12), BEARD, { y: 0.0, z: 0.07 }),
      part(box(0.21, 0.1, 0.1), BEARD, { y: -0.09, z: 0.08 }),
      part(box(0.27, 0.12, 0.1), BEARD, { y: 0.04, z: 0.01 }),
      part(box(0.12, 0.035, 0.03), BEARD, { y: 0.075, z: 0.125 }), // tache
      part(box(0.28, 0.06, 0.2), '#7a4a22', { y: 0.16, z: -0.04 }), // hair under helmet
      // Round sunglasses: dark lenses, gold rims, bridge
      part(cyl(0.045, 0.045, 0.02, 10), '#c9a24a', { x: 0.052, y: 0.13, z: 0.118, rx: Math.PI / 2 }),
      part(cyl(0.045, 0.045, 0.02, 10), '#c9a24a', { x: -0.052, y: 0.13, z: 0.118, rx: Math.PI / 2 }),
      part(cyl(0.037, 0.037, 0.025, 10), '#141414', { x: 0.052, y: 0.13, z: 0.124, rx: Math.PI / 2 }),
      part(cyl(0.037, 0.037, 0.025, 10), '#141414', { x: -0.052, y: 0.13, z: 0.124, rx: Math.PI / 2 }),
      part(box(0.03, 0.01, 0.01), '#c9a24a', { y: 0.14, z: 0.125 }),
      part(box(0.01, 0.01, 0.12), '#c9a24a', { x: 0.1, y: 0.13, z: 0.06 }),
      part(box(0.01, 0.01, 0.12), '#c9a24a', { x: -0.1, y: 0.13, z: 0.06 }),
      // Helmet: black shell, peak, vents, camera, and the fluffy mic
      part(helmet, '#1f2326', { y: 0.16, sx: 1.0, sy: 1.05, sz: 1.22 }),
      part(box(0.3, 0.025, 0.08), '#1f2326', { y: 0.165, z: 0.19 }),
      part(box(0.03, 0.02, 0.26), '#3a4045', { x: 0.05, y: 0.33, z: -0.02 }),
      part(box(0.03, 0.02, 0.26), '#3a4045', { x: -0.05, y: 0.33, z: -0.02 }),
      part(box(0.06, 0.06, 0.09), '#111', { y: 0.34, z: 0.1 }), // helmet cam: he films everything
      part(cyl(0.02, 0.02, 0.03, 8), '#333', { y: 0.34, z: 0.16, rx: Math.PI / 2 }),
      part(box(0.03, 0.02, 0.1), '#333', { x: 0.17, y: 0.2, z: 0.0 }), // mic arm
      part(ico(0.075, 1), '#a08b6c', { x: 0.21, y: 0.21, z: 0.05 }), // dead cat
      // chin strap
      part(box(0.01, 0.12, 0.015), '#222', { x: 0.115, y: 0.07, z: 0.03 }),
      part(box(0.01, 0.12, 0.015), '#222', { x: -0.115, y: 0.07, z: 0.03 }),
    ]),
    sharedMat,
  );
  headMesh.castShadow = true;
  head.add(headMesh);

  // Legs: thigh pivots at the hip, shin pivots at the knee.
  const legs = [];
  for (const side of [1, -1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.1, 1.04, -0.17);
    rider.add(thigh);
    thigh.add(new THREE.Mesh(merge([part(box(0.14, 0.14, 0.44), TROUSERS, { z: 0.22 })]), sharedMat));
    const shin = new THREE.Group();
    shin.position.set(0, 0, 0.44);
    thigh.add(shin);
    shin.add(
      new THREE.Mesh(
        merge([part(box(0.12, 0.44, 0.12), TROUSERS, { y: -0.22 }), part(box(0.11, 0.08, 0.24), '#1a1a1a', { y: -0.46, z: 0.05 })]),
        sharedMat,
      ),
    );
    legs.push({ thigh, shin, side });
    thigh.children[0].castShadow = true;
  }

  return { group: root, lean, rider, torso, head, legs, crank, frontWheel, rearWheel, rearLight };
}

// Simple pedalling animation from crank angle (solved approximately per leg).
export function poseDaniel(m, crankAngle, lookYaw = 0) {
  m.crank.rotation.x = crankAngle;
  m.frontWheel.rotation.x = crankAngle * 2.6;
  m.rearWheel.rotation.x = crankAngle * 2.6;
  for (const L of m.legs) {
    const a = crankAngle + (L.side > 0 ? 0 : Math.PI);
    // pedal position relative to hip, in the bike's y/z plane
    const px = 0.02 + Math.sin(a) * 0.17;
    const py = 0.32 - Math.cos(a) * 0.17;
    const hz = -0.17;
    const hy = 1.04;
    const dz = px - hz;
    const dy = py - hy;
    const d = Math.min(0.87, Math.hypot(dz, dy));
    const l1 = 0.44;
    const l2 = 0.46;
    const base = Math.atan2(dy, dz); // angle from +z axis toward y
    const k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const thighAng = base + k; // knee bends up/forward
    L.thigh.rotation.x = -thighAng;
    const kneeAng = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
    L.shin.rotation.x = Math.PI / 2 - kneeAng;
  }
  m.head.rotation.y = lookYaw;
}
