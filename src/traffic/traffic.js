// Oncoming traffic from a seeded schedule. Vehicles enter at the far end of the
// road at fixed times, so two runs with the same seed see the same traffic.
import { Rng } from '../util/rng.js';
import { MPH, ONCOMING_LANE } from '../config.js';

const TYPES = [
  { type: 'car', weight: 60, cruise: 1.0, max: 60 },
  { type: 'van', weight: 20, cruise: 0.95, max: 58 },
  { type: 'lorry', weight: 12, cruise: 0.85, max: 50 },
  { type: 'tractor', weight: 8, cruise: 1, max: 22 },
];
const DIMS = { car: [4.2, 1.8], van: [5.2, 2.0], lorry: [9.5, 2.5], tractor: [4.0, 2.2] };

export class Traffic {
  constructor(seed, road) {
    this.road = road;
    this.rng = new Rng(`${seed}:traffic`);
    this.vehicles = [];
    this.nextId = 1;
    this.t = 0;
    // Schedule: alternating platoons and proper gaps, the way the A970 actually flows.
    this.schedule = [];
    let t = -420;
    while (t < 1200) {
      const kind = this.rng.weighted(TYPES);
      this.schedule.push({ t, kind, jitter: this.rng.range(0.9, 1.04), seed: this.rng.next() });
      const r = this.rng.next();
      t += r < 0.45 ? this.rng.range(2.5, 7) : r < 0.75 ? this.rng.range(9, 18) : this.rng.range(22, 42);
    }
    this.cursor = 0;
    // Warm up so the road is already populated at t=0.
    this.t = -420;
    const warm = 1 / 20;
    while (this.t < 0) this._step(warm, null);
    this.t = 0;
  }

  _spawnDue() {
    while (this.cursor < this.schedule.length && this.schedule[this.cursor].t <= this.t) {
      const e = this.schedule[this.cursor++];
      const [length, width] = DIMS[e.kind.type];
      this.vehicles.push({
        id: this.nextId++,
        type: e.kind.type,
        kind: e.kind,
        jitter: e.jitter,
        seed: e.seed,
        s: this.road.length - 5,
        d: ONCOMING_LANE + 0.05,
        v: e.kind.type === 'tractor' ? 9 : 24,
        length,
        width,
        braking: false,
        alarmed: false,
        flash: 0,
      });
    }
  }

  // player: { s, d, v, length, width } or null during warm-up
  _step(dt, player) {
    this.t += dt;
    this._spawnDue();
    const vs = this.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const o = vs[i];
      const limit = this.road.limitAt(o.s);
      let target = Math.min(o.kind.max, limit) * MPH * o.kind.cruise * o.jitter;
      // Ease off for tight bends
      const k = Math.abs(this.road.curvatureAt(o.s - 20));
      if (k > 0.004) target = Math.min(target, Math.sqrt(2.6 / k));
      // Keep a gap to the vehicle in front (lower s, since they travel towards s=0)
      for (let j = 0; j < vs.length; j++) {
        if (j === i) continue;
        const ahead = vs[j];
        const gap = o.s - ahead.s - (o.length + ahead.length) / 2;
        if (gap > 0 && gap < Math.max(12, o.v * 1.6)) target = Math.min(target, ahead.v * (gap < 8 ? 0.8 : 1));
      }
      o.braking = false;
      if (player) {
        // Is the player's car in our lane and heading for us?
        const inLane = player.d + player.width / 2 > 0.15;
        const gap = o.s - player.s - (o.length + player.length) / 2;
        const closing = o.v + player.v;
        if (inLane && gap > -2 && closing > 0.5) {
          const ttc = gap / closing;
          if (ttc < 3.2) {
            target = 0;
            o.braking = true;
            if (!o.alarmed) {
              o.alarmed = true;
              o.flash = 1.2;
            }
          }
        }
      }
      if (target > o.v) o.v = Math.min(target, o.v + 1.4 * dt);
      else o.v = Math.max(target, o.v - (o.braking ? 7 : 2.5) * dt);
      o.s -= o.v * dt;
      if (o.flash > 0) o.flash -= dt;
    }
    // Despawn behind the start
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i].s < -20) vs.splice(i, 1);
  }

  step(dt, player) {
    this._step(dt, player);
  }

  // Vehicles within a window of s (for rendering and scoring).
  near(s, behind = 60, ahead = 900) {
    return this.vehicles.filter((o) => o.s > s - behind && o.s < s + ahead);
  }

  remove(id) {
    const i = this.vehicles.findIndex((o) => o.id === id);
    if (i >= 0) this.vehicles.splice(i, 1);
  }
}
