// Low-poly terrain from the baked DEM grid, plus sea and lochs.
import * as THREE from 'three';
import { fbm, valueNoise, smoothstep, clamp } from '../util/math.js';
import { Rng } from '../util/rng.js';

const COLORS = {
  grassA: new THREE.Color('#86ad5c'),
  grassB: new THREE.Color('#739f4f'),
  field: new THREE.Color('#9cc06a'),
  verge: new THREE.Color('#93b866'),
  moor: new THREE.Color('#8a8a55'),
  peat: new THREE.Color('#6b5a40'),
  heather: new THREE.Color('#7d6f55'),
  rock: new THREE.Color('#8d8c84'),
  sand: new THREE.Color('#d6caa0'),
  seabed: new THREE.Color('#5d7f7a'),
};

const DETAIL_TILE = 16; // m per repeat of the grass detail texture

// Tileable grass mottling, multiplied over the vertex colours: soft lush/dry
// patches plus short blade strokes. Greyscale-ish (<= 1) so it only darkens
// and warms; mipmapping fades it to an even tone in the distance.
function grassDetail() {
  const N = 256;
  const rng = new Rng('grass-detail');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  // Periodic value noise so the tile wraps without seams
  const lattice = (period) => {
    const v = Array.from({ length: period * period }, () => rng.next());
    return (x, y) => {
      const fx = (x / N) * period;
      const fy = (y / N) * period;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smoothstep(0, 1, fx - x0), ty = smoothstep(0, 1, fy - y0);
      const at = (i, j) => v[((j % period) * period) + (i % period)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    };
  };
  const big = lattice(4);
  const mid = lattice(12);
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dry = smoothstep(0.45, 0.8, big(x, y) * 0.65 + mid(x, y) * 0.35);
      const shade = 0.86 + mid(x, y) * 0.1 + (rng.next() - 0.5) * 0.05;
      const i = (y * N + x) * 4;
      img.data[i] = 255 * Math.min(1, shade * (0.93 + dry * 0.07));
      img.data[i + 1] = 255 * Math.min(1, shade * (0.97 - dry * 0.03));
      img.data[i + 2] = 255 * Math.min(1, shade * (0.9 - dry * 0.14));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Blade strokes: dark and light, drawn wrapped across the edges
  ctx.lineWidth = 1;
  for (let k = 0; k < 2200; k++) {
    const x = rng.range(0, N), y = rng.range(0, N);
    const len = rng.range(2, 6);
    const lean = rng.range(-0.6, 0.6);
    ctx.strokeStyle = rng.chance(0.6) ? `rgba(40,60,20,${rng.range(0.12, 0.28)})` : `rgba(255,250,215,${rng.range(0.1, 0.22)})`;
    for (const ox of [-N, 0, N]) {
      for (const oy of [-N, 0, N]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + lean * len, y + oy - len);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Terrain {
  constructor(data) {
    const t = data.terrain;
    this.minX = t.minX;
    this.minZ = t.minZ;
    this.cell = t.cell;
    this.cols = t.cols;
    this.rows = t.rows;
    this.h = Float32Array.from(t.h);
    this.roadDist = t.roadDist;
  }

  // Must match the bake's triangulation: diagonal from (c, r+1) to (c+1, r).
  heightAt(x, z) {
    const fc = (x - this.minX) / this.cell;
    const fr = (z - this.minZ) / this.cell;
    const c = clamp(Math.floor(fc), 0, this.cols - 2);
    const r = clamp(Math.floor(fr), 0, this.rows - 2);
    const fx = clamp(fc - c, 0, 1);
    const fz = clamp(fr - r, 0, 1);
    const H = this.h;
    const A = H[r * this.cols + c];
    const B = H[(r + 1) * this.cols + c];
    const C = H[(r + 1) * this.cols + c + 1];
    const D = H[r * this.cols + c + 1];
    if (fx + fz <= 1) return A * (1 - fx - fz) + D * fx + B * fz;
    return C * (fx + fz - 1) + B * (1 - fx) + D * (1 - fz);
  }

  roadDistAt(x, z) {
    const c = clamp(Math.round((x - this.minX) / this.cell), 0, this.cols - 1);
    const r = clamp(Math.round((z - this.minZ) / this.cell), 0, this.rows - 1);
    return this.roadDist[r * this.cols + c];
  }

  buildMesh() {
    const { cols, rows, cell, minX, minZ, h } = this;
    const tris = (cols - 1) * (rows - 1) * 2;
    const pos = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    let p = 0;
    const tmp = new THREE.Color();
    const vx = (c) => minX + c * cell;
    const vz = (r) => minZ + r * cell;
    const X = (c) => vx(c);
    const Z = (c, r) => vz(r);

    const pushTri = (a, b, c) => {
      for (const v of [a, b, c]) {
        pos[p] = X(v[0], v[1]);
        pos[p + 1] = h[v[1] * cols + v[0]];
        pos[p + 2] = Z(v[0], v[1]);
        p += 3;
      }
      // Colour per face
      const i0 = p - 9;
      const cx = (pos[i0] + pos[i0 + 3] + pos[i0 + 6]) / 3;
      const cy = (pos[i0 + 1] + pos[i0 + 4] + pos[i0 + 7]) / 3;
      const cz = (pos[i0 + 2] + pos[i0 + 5] + pos[i0 + 8]) / 3;
      const ux = pos[i0 + 3] - pos[i0], uy = pos[i0 + 4] - pos[i0 + 1], uz = pos[i0 + 5] - pos[i0 + 2];
      const wx = pos[i0 + 6] - pos[i0], wy = pos[i0 + 7] - pos[i0 + 1], wz = pos[i0 + 8] - pos[i0 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const slope = 1 - Math.abs(ny) / Math.hypot(nx, ny, nz);
      const rd = this.roadDist[a[1] * cols + a[0]];
      this._faceColour(tmp, cx, cy, cz, slope, rd);
      for (let k = 0; k < 3; k++) {
        col[i0 + k * 3] = tmp.r;
        col[i0 + k * 3 + 1] = tmp.g;
        col[i0 + k * 3 + 2] = tmp.b;
      }
    };

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        // A=(c,r) B=(c,r+1) C=(c+1,r+1) D=(c+1,r)
        pushTri([c, r], [c, r + 1], [c + 1, r]);
        pushTri([c, r + 1], [c + 1, r + 1], [c + 1, r]);
      }
    }
    // World-space UVs for the tiled grass detail
    const uv = new Float32Array((p / 3) * 2);
    for (let i = 0, j = 0; i < p; i += 3, j += 2) {
      uv[j] = pos[i] / DETAIL_TILE;
      uv[j + 1] = pos[i + 2] / DETAIL_TILE;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, p), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, p), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: grassDetail() }),
    );
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  _faceColour(out, x, y, z, slope, roadDist) {
    const n = fbm(x * 0.004, z * 0.004, 3);
    const n2 = valueNoise(x * 0.02, z * 0.02);
    if (y < 0.4) return out.copy(COLORS.seabed).lerp(COLORS.sand, smoothstep(-4, 0.4, y));
    if (y < 2.2) return out.copy(COLORS.sand).lerp(COLORS.grassA, smoothstep(1.2, 2.2, y));
    // Low ground: grass with croft fields; uplands: moor, heather, peat
    out.copy(COLORS.grassA).lerp(COLORS.grassB, n2);
    // Patchwork in-bye fields near the road
    if (roadDist < 450 && y < 70) {
      const fx = Math.floor((x + 400) / 85);
      const fz = Math.floor((z + 300) / 60);
      const f = valueNoise(fx * 3.1, fz * 2.7);
      if (f > 0.55) out.lerp(COLORS.field, 0.55);
      else if (f < 0.2) out.lerp(COLORS.grassB, 0.6);
    }
    const upland = smoothstep(45, 110, y + (n - 0.5) * 50);
    out.lerp(COLORS.moor, upland * 0.85);
    if (upland > 0.4 && n2 > 0.62) out.lerp(COLORS.peat, 0.65);
    else if (upland > 0.5 && n > 0.55) out.lerp(COLORS.heather, 0.5);
    if (slope > 0.32) out.lerp(COLORS.rock, smoothstep(0.32, 0.55, slope) * 0.8);
    if (roadDist < 14) out.lerp(COLORS.verge, 0.6);
    return out;
  }

  buildSea() {
    const w = (this.cols - 1) * this.cell + 6000;
    const d = (this.rows - 1) * this.cell + 6000;
    const g = new THREE.PlaneGeometry(w, d, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: '#4f8494' });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(this.minX + ((this.cols - 1) * this.cell) / 2, 0.05, this.minZ + ((this.rows - 1) * this.cell) / 2);
    mesh.receiveShadow = true;
    return mesh;
  }

  buildLochs(lochs) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: '#5b8796' });
    for (const l of lochs) {
      const shape = new THREE.Shape(l.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.y = l.y + 0.15;
      group.add(m);
    }
    return group;
  }
}
