// Helpers for building flat-shaded, vertex-coloured low-poly geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();

export function paint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  _c.set(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}

export function part(geometry, hex, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = paint(geometry, hex);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const ico = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);

// Triangular prism roof: ridge along x, width w (x), depth d (z), height h.
export function gable(w, d, h, overhang = 0.3) {
  const W = w / 2 + overhang;
  const D = d / 2 + overhang;
  const p = [
    // two slopes
    -W, 0, -D, W, 0, -D, W, h, 0,
    -W, 0, -D, W, h, 0, -W, h, 0,
    W, 0, D, -W, 0, D, -W, h, 0,
    W, 0, D, -W, h, 0, W, h, 0,
    // gable ends
    -W, 0, D, -W, 0, -D, -W, h, 0,
    W, 0, -D, W, 0, D, W, h, 0,
    // underside
    -W, 0, -D, -W, 0, D, W, 0, D,
    -W, 0, -D, W, 0, D, W, 0, -D,
  ];
  return outward(p, [0, h / 3, 0]);
}

// Build a geometry from a triangle soup, flipping any triangle whose normal
// points back towards `centre` (convex shapes only).
export function outward(p, centre) {
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const ux = p[i + 3] - ax, uy = p[i + 4] - ay, uz = p[i + 5] - az;
    const vx = p[i + 6] - ax, vy = p[i + 7] - ay, vz = p[i + 8] - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const cx = (ax + p[i + 3] + p[i + 6]) / 3 - centre[0];
    const cy = (ay + p[i + 4] + p[i + 7]) / 3 - centre[1];
    const cz = (az + p[i + 5] + p[i + 8]) / 3 - centre[2];
    if (nx * cx + ny * cy + nz * cz < 0) {
      for (let k = 0; k < 3; k++) {
        const t = p[i + 3 + k];
        p[i + 3 + k] = p[i + 6 + k];
        p[i + 6 + k] = t;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

export function lambert(opts = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
}
