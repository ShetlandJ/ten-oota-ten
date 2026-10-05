// Daniel. Steady cadence, slows on the climbs, flies down the hills,
// and gets shoved about by Shetland gusts.
import { DANIEL, BIKE } from '../config.js';
import { clamp } from '../util/math.js';

export class Cyclist {
  constructor(s, wind) {
    this.s = s;
    this.d = DANIEL.lanePos;
    this.v = DANIEL.cruise;
    this.vd = 0;
    this.wind = wind;
    this.t = 0;
    this.crank = 0;
    this.lean = 0;
    this.length = BIKE.length;
    this.width = BIKE.width;
    this.crashed = false;
    this.crashT = 0;
  }

  step(dt, road) {
    this.t += dt;
    if (this.crashed) {
      this.crashT += dt;
      this.v = Math.max(0, this.v - 6 * dt);
      this.s += this.v * dt;
      return;
    }
    const grade = road.gradeAt(this.s + 4);
    const target = clamp(DANIEL.cruise - grade * 70, 4.4, 11.5);
    this.v += (target - this.v) * Math.min(1, dt / 3);
    this.s += this.v * dt;

    // Lateral: gentle wander + gusts (wind pushes, Daniel corrects).
    const wander = Math.sin(this.t * 0.7) * 0.06 + Math.sin(this.t * 1.9 + 1.3) * 0.03;
    const gust = this.wind.push(this.t);
    const targetD = DANIEL.lanePos + wander + gust;
    const prev = this.d;
    this.d += (targetD - this.d) * Math.min(1, dt / 0.35);
    this.vd = (this.d - prev) / dt;
    this.lean = clamp(-this.vd * 0.25 + gust * 0.12, -0.25, 0.25);
    // Cadence: ~80rpm at cruise, freewheel when quick downhill
    const cadence = this.v > 10 ? 0.3 : (this.v / DANIEL.cruise) * 8.4;
    this.crank += cadence * dt;
  }

  crash() {
    this.crashed = true;
    this.crashT = 0;
  }
}
