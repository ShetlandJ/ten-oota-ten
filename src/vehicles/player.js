// Player car physics in road coordinates. Arcade, but smoothness-aware:
// steering sets a target lateral velocity, pedals ramp like real pressure,
// so a gentle hand scores well and a yank shows up as a harsh event.
import { ROAD, OWN_LANE, CAR, MPH } from '../config.js';
import { clamp, approach } from '../util/math.js';

const MAX_SPEED = 34; // ~76mph
const BRAKE_MAX = 8.5;
const STEER_RAMP = 1.1; // per second, keyboard build-up
const STEER_RETURN = 1.25; // per second, back to centre on release
const STEER_REVERSE = 3.2; // per second, flicking the other way (harsh)

export class PlayerCar {
  constructor(s, v = 20) {
    this.s = s;
    this.d = OWN_LANE;
    this.v = v;
    this.vd = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.latAccel = 0;
    this.longAccel = 0;
    this.offRoad = 0;
    this.length = CAR.length;
    this.width = CAR.width;
    this.frozen = false;
  }

  // input: { steer: -1..1 (analog or digital), steerAnalog: bool, throttle: 0/1, brake: 0/1 }
  step(dt, input, road) {
    if (this.frozen) {
      this.latAccel = 0;
      this.longAccel = 0;
      return;
    }
    // --- Steering
    const target = clamp(input.steer, -1, 1);
    if (input.steerAnalog) {
      // Thumb on a slider: follow closely but not instantly.
      this.steer += (target - this.steer) * Math.min(1, dt / 0.12);
    } else {
      let rate;
      if (target === 0) rate = STEER_RETURN;
      else if (Math.sign(target) !== Math.sign(this.steer) && Math.abs(this.steer) > 0.05) rate = STEER_REVERSE;
      else rate = STEER_RAMP;
      this.steer = approach(this.steer, target, rate * dt);
    }

    // --- Pedals (pressure builds while held)
    this.throttle = approach(this.throttle, input.throttle ? 1 : 0, (input.throttle ? 2.2 : 4) * dt);
    this.brake = approach(this.brake, input.brake ? 1 : 0, (input.brake ? 1.05 : 5) * dt);

    // --- Longitudinal
    const v = this.v;
    const drive = this.throttle * Math.min(3.4, 62 / Math.max(v, 6));
    const drag = 0.00042 * v * v + (v > 0.1 ? 0.12 : 0);
    const engineBrake = this.throttle < 0.05 && v > 1 ? 0.35 : 0;
    const grade = road.gradeAt(this.s);
    const gravity = 9.81 * grade * 0.55;
    const brakeDecel = this.brake * BRAKE_MAX;
    let a = drive - drag - engineBrake - gravity - brakeDecel;
    // Off the tarmac: grass drags hard.
    const edge = Math.abs(this.d) - ROAD.halfWidth;
    this.offRoad = edge > 0.3 ? Math.min(1, (edge - 0.3) / 1.2) : 0;
    if (this.offRoad) a -= this.offRoad * (1.5 + v * 0.12);
    let nv = clamp(v + a * dt, 0, MAX_SPEED);
    this.longAccel = (nv - v) / dt;
    this.v = nv;

    // --- Lateral
    const vdMax = Math.min(2.7, 0.19 * this.v);
    const vdTarget = this.steer * vdMax;
    const prevVd = this.vd;
    this.vd += (vdTarget - this.vd) * Math.min(1, dt / 0.22);
    // physical limit on lateral grip
    const maxDv = 7.5 * dt;
    this.vd = clamp(this.vd, prevVd - maxDv, prevVd + maxDv);
    const rawLat = (this.vd - prevVd) / dt;
    this.latAccel += (rawLat - this.latAccel) * Math.min(1, dt / 0.08);
    this.d += this.vd * dt;
    // Walls/ditches stop you leaving the road entirely.
    const lim = ROAD.halfWidth + 2.6;
    if (Math.abs(this.d) > lim) {
      this.d = Math.sign(this.d) * lim;
      this.vd = 0;
      this.v *= 1 - 1.5 * dt;
    }

    this.s += this.v * dt;
  }

  get mph() {
    return this.v / MPH;
  }

  get heading() {
    return Math.atan2(this.vd, Math.max(this.v, 0.5));
  }
}
