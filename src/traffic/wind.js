// Seeded gust schedule. Gusts push Daniel towards the crown of the road,
// which is exactly why 1.5m is a minimum and not a target.
import { Rng } from '../util/rng.js';

export class Wind {
  constructor(seed) {
    const rng = new Rng(`${seed}:wind`);
    this.gusts = [];
    let t = rng.range(4, 9);
    while (t < 900) {
      const dur = rng.range(1.2, 2.4);
      const strength = rng.range(0.22, 0.55) * (rng.chance(0.8) ? 1 : -0.5);
      this.gusts.push({ t, dur, strength });
      t += dur + rng.range(5, 16);
    }
  }

  // Lateral displacement in metres (positive = towards the centre line) at time t.
  push(t) {
    // binary search for the last gust starting before t
    let lo = 0;
    let hi = this.gusts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.gusts[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    const g = this.gusts[lo];
    if (!g || t < g.t || t > g.t + g.dur) return 0;
    const u = (t - g.t) / g.dur;
    return Math.sin(u * Math.PI) ** 2 * g.strength;
  }

  active(t) {
    return Math.abs(this.push(t)) > 0.08;
  }
}
