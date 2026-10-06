// The A970 centreline as a queryable path in road coordinates (s along, d across).
// Pure data: no three.js, so scoring and tests can use it in node.

import { clamp } from '../util/math.js';

export const HAZARD = {
  NONE: 0,
  BEND: 1,
  CREST: 2,
  JUNCTION: 3,
  BUS_STOP: 4,
};
export const HAZARD_LABEL = ['', 'bend', 'crest', 'junction', 'bus stop'];

// Forward sight needed to overtake (a game-tuned take on overtaking sight distance).
const SIGHT_NEEDED = { 60: 205, 50: 170 };
const EYE = 1.1;
const TARGET = 1.05;
const CLEAR_OFFSET = 8.5; // hedgeless, but banks/walls/houses block beyond this

export class Road {
  constructor(data) {
    const r = data.road;
    this.step = r.step;
    this.n = r.x.length;
    this.x = Float32Array.from(r.x);
    this.z = Float32Array.from(r.z);
    this.y = Float32Array.from(r.y);
    this.length = (this.n - 1) * this.step;
    this.routeStart = data.route.start;
    this.routeEnd = data.route.end;
    this.village = data.village;

    // Tangents / right normals / curvature per sample
    const n = this.n;
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.curv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const L = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / L;
      this.tz[i] = dz / L;
      this.heading[i] = Math.atan2(this.tx[i], this.tz[i]);
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3);
      const b = Math.min(n - 1, i + 3);
      let dh = this.heading[b] - this.heading[a];
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.curv[i] = dh / ((b - a) * this.step);
    }

    this.limit = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      const inVillage = this.village.start != null && s >= this.village.start && s <= this.village.end;
      this.limit[i] = inVillage ? 50 : 60;
    }

    this.busStops = data.busStops || [];
    this.junctions = data.junctions || [];
    this._computeSight();
    this._computeHazards();
  }

  idx(s) {
    return clamp(s / this.step, 0, this.n - 1.0001);
  }

  // Interpolated frame at distance s. Writes into `out` to avoid allocation.
  frame(s, out = {}) {
    const f = this.idx(s);
    const i = Math.floor(f);
    const t = f - i;
    const j = i + 1;
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t;
    let tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const L = Math.hypot(tx, tz) || 1;
    tx /= L;
    tz /= L;
    out.tx = tx;
    out.tz = tz;
    out.nx = -tz; // right-hand normal
    out.nz = tx;
    out.heading = Math.atan2(tx, tz);
    out.grade = (this.y[j] - this.y[i]) / this.step;
    return out;
  }

  // World position of road coordinate (s, d); y is road surface height.
  pos(s, d, out = {}) {
    const f = this.frame(s, out);
    out.x = f.x + f.nx * d;
    out.z = f.z + f.nz * d;
    return out;
  }

  heightAt(s) {
    const f = this.idx(s);
    const i = Math.floor(f);
    return this.y[i] + (this.y[i + 1] - this.y[i]) * (f - i);
  }

  gradeAt(s) {
    const i = Math.floor(this.idx(s));
    return (this.y[i + 1] - this.y[i]) / this.step;
  }

  curvatureAt(s) {
    return this.curv[Math.round(this.idx(s))];
  }

  limitAt(s) {
    return this.limit[Math.round(this.idx(s))];
  }

  hazardAt(s) {
    return this.hazard[Math.round(this.idx(s))];
  }

  solidAt(s) {
    return this.solid[Math.round(this.idx(s))] === 1;
  }

  sightAt(s) {
    return this.sight[Math.round(this.idx(s))];
  }

  // Nearest road coordinate for a world point (coarse search + refine).
  project(x, z, hintS = null) {
    let best = 0;
    let bd = Infinity;
    const lo = hintS == null ? 0 : Math.max(0, Math.floor(hintS / this.step) - 80);
    const hi = hintS == null ? this.n : Math.min(this.n, Math.floor(hintS / this.step) + 80);
    for (let i = lo; i < hi; i++) {
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const s = best * this.step;
    const dd = (x - this.x[best]) * -this.tz[best] + (z - this.z[best]) * this.tx[best];
    return { s, d: dd, dist: Math.sqrt(bd) };
  }

  // Forward (direction of travel) sight distance at each sample: limited by
  // bends (chord leaves the clear corridor) or crests (road surface blocks
  // the eye-to-oncoming-car line).
  _computeSight() {
    const n = this.n;
    const step = this.step;
    const maxLook = Math.ceil(330 / step);
    this.sight = new Float32Array(n);
    this.sightReason = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const eye = this.y[i] + EYE;
      let maxSlope = -Infinity;
      let sight = maxLook * step;
      let reason = HAZARD.NONE;
      for (let k = 1; k <= maxLook; k++) {
        const j = i + k;
        if (j >= n) {
          sight = (n - 1 - i) * step;
          break;
        }
        const ds = k * step;
        // Vertical
        const tSlope = (this.y[j] + TARGET - eye) / ds;
        if (tSlope < maxSlope) {
          sight = ds;
          reason = HAZARD.CREST;
          break;
        }
        maxSlope = Math.max(maxSlope, (this.y[j] - eye) / ds);
        // Horizontal: every intermediate point must stay near the chord
        const cx = this.x[j] - this.x[i];
        const cz = this.z[j] - this.z[i];
        const cl = Math.hypot(cx, cz) || 1;
        let blocked = false;
        for (let m = i + 2; m < j; m += 2) {
          const dev = Math.abs(((this.x[m] - this.x[i]) * cz - (this.z[m] - this.z[i]) * cx) / cl);
          if (dev > CLEAR_OFFSET) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          sight = ds;
          reason = HAZARD.BEND;
          break;
        }
      }
      this.sight[i] = sight;
      this.sightReason[i] = reason;
    }
  }

  _computeHazards() {
    const n = this.n;
    const step = this.step;
    const hz = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (this.sight[i] < SIGHT_NEEDED[this.limit[i]]) hz[i] = this.sightReason[i] || HAZARD.BEND;
    }
    const mark = (s, before, after, code) => {
      const a = Math.max(0, Math.floor((s - before) / step));
      const b = Math.min(n - 1, Math.ceil((s + after) / step));
      for (let i = a; i <= b; i++) hz[i] = code;
    };
    for (const j of this.junctions) {
      if (j.kind === 'unclassified' || j.kind === 'tertiary') mark(j.s, 40, 15, HAZARD.JUNCTION);
      else if (j.kind === 'residential') mark(j.s, 15, 8, HAZARD.JUNCTION);
    }
    for (const b of this.busStops) mark(b.s, 20, 10, HAZARD.BUS_STOP);

    // Fill short gaps so markings don't flicker between solid and dashed.
    const minGap = Math.round(30 / step);
    let lastHz = -Infinity;
    for (let i = 0; i < n; i++) {
      if (hz[i]) {
        if (i - lastHz > 1 && i - lastHz <= minGap) for (let k = lastHz + 1; k < i; k++) hz[k] = hz[lastHz];
        lastHz = i;
      }
    }
    this.hazard = hz;
    this.solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.solid[i] = hz[i] ? 1 : 0;
    // Distance to the next restricted sample (and which kind), for "hazard ahead" checks.
    this.nextHz = new Float32Array(n);
    this.nextHzCode = new Uint8Array(n);
    let next = Infinity;
    let code = 0;
    for (let i = n - 1; i >= 0; i--) {
      if (hz[i]) {
        next = i * step;
        code = hz[i];
      }
      this.nextHz[i] = next - i * step;
      this.nextHzCode[i] = code;
    }
  }

  // Restriction within `dist` metres ahead of s: returns its code or 0.
  hazardWithin(s, dist) {
    const i = Math.round(this.idx(s));
    return this.nextHz[i] <= dist ? this.nextHzCode[i] : 0;
  }

  // Unrestricted stretches of at least minLen metres inside the route: [{ start, end }].
  clearWindows(minLen) {
    const out = [];
    const end = Math.floor(this.routeEnd / this.step);
    let i = Math.ceil(this.routeStart / this.step);
    while (i < end) {
      if (this.solid[i]) {
        i++;
        continue;
      }
      const a = i;
      while (i < end && !this.solid[i]) i++;
      if ((i - a) * this.step >= minLen) out.push({ start: a * this.step, end: i * this.step });
    }
    return out;
  }

  // Fraction of the route where overtaking is restricted (for tuning/debug).
  restrictedFraction() {
    let c = 0;
    let t = 0;
    for (let i = Math.floor(this.routeStart / this.step); i < this.routeEnd / this.step; i++) {
      t++;
      if (this.solid[i]) c++;
    }
    return c / t;
  }
}

