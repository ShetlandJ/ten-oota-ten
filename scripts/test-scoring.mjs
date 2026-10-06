// Headless checks: drive the real car + Daniel physics with a scripted driver
// through the overtake scorer and assert the verdicts make sense.
//   node scripts/test-scoring.mjs
import assert from 'node:assert/strict';
import { PlayerCar } from '../src/vehicles/player.js';
import { Cyclist } from '../src/vehicles/cyclist.js';
import { createOvertakeTracker } from '../src/scoring/overtake.js';
import { SIM_DT } from '../src/config.js';

const flatRoad = { gradeAt: () => 0 };
const calmWind = { push: () => 0 };

function drive(opts = {}) {
  const o = {
    indicateOutAt: 1.0,
    moveOutAfter: 3.4, // seconds after indicating
    outD: 1.2,
    passRel: 6, // m/s faster than Daniel
    reenterGap: 12,
    indicateInLead: 1.4,
    cancelAfter: 1.0,
    indicateOut: 'right',
    indicateIn: true,
    cancel: true,
    oncoming: [],
    horn: false,
    keyboardYank: false,
    ...opts,
  };
  const bike = new Cyclist(100, calmWind);
  const car = new PlayerCar(100 - 25, 7.6 + 0.6);
  const tracker = createOvertakeTracker(0);
  let t = 0;
  let indicator = null;
  let mode = 'follow';
  let modeT = 0;
  let reenterT = null;
  let inSignalT = null;
  while (t < 90 && tracker.state !== 'done') {
    const input = { steer: 0, steerAnalog: false, throttle: 0, brake: 0 };
    const gapAhead = bike.s - bike.length / 2 - (car.s + car.length / 2);
    if (mode === 'follow') {
      const vt = bike.v;
      if (car.v < vt - 0.1) input.throttle = 1;
      if (t >= o.indicateOutAt && t < o.indicateOutAt + 0.1) indicator = o.indicateOut;
      if (o.horn && t > 1 && t < 1.05) input.horn = true;
      if (t >= o.indicateOutAt + o.moveOutAfter) {
        mode = 'out';
        modeT = t;
      }
    } else if (mode === 'out') {
      if (car.d < o.outD - (o.keyboardYank ? 0 : 0.9)) input.steer = 1;
      if (car.v < bike.v + o.passRel) input.throttle = 1;
      const ahead = car.s - car.length / 2 - (bike.s + bike.length / 2);
      if (o.indicateIn && ahead > o.reenterGap - 4 && inSignalT == null) {
        indicator = 'left';
        inSignalT = t;
      }
      const ready = o.indicateIn ? inSignalT != null && t - inSignalT >= o.indicateInLead && ahead >= o.reenterGap : ahead >= o.reenterGap;
      if (ready) {
        if (!o.indicateIn) indicator = indicator === 'right' ? indicator : null;
        mode = 'in';
        modeT = t;
      }
    } else if (mode === 'in') {
      if (car.d > -1.65 + (o.keyboardYank ? 0 : 0.9)) input.steer = -1;
      if (car.v < bike.v + o.passRel) input.throttle = 1;
      if (car.d < -0.6 && reenterT == null) reenterT = t;
      if (o.cancel && reenterT != null && t - reenterT >= o.cancelAfter) indicator = null;
    }
    car.step(SIM_DT, input, flatRoad);
    bike.step(SIM_DT, flatRoad);
    t += SIM_DT;
    const latGap = car.d - car.width / 2 - (bike.d + bike.width / 2);
    const overlap = Math.abs(car.s - bike.s) < (car.length + bike.length) / 2;
    const crash = overlap && latGap < 0 ? 'cyclist' : null;
    tracker.step({
      t,
      dt: SIM_DT,
      car: { s: car.s, d: car.d, v: car.v, latAccel: car.latAccel, longAccel: car.longAccel, length: car.length, width: car.width, throttle: car.throttle, brake: car.brake },
      bike: { s: bike.s, d: bike.d, v: bike.v, length: bike.length, width: bike.width },
      indicator,
      horn: !!input.horn,
      limitMph: 60,
      hazard: 0,
      hazardAhead: false,
      oncoming: o.oncoming.map((x) => ({ ...x, s: x.s0 - x.v * t })),
      crash,
    });
    void gapAhead;
  }
  return tracker.result();
}

const show = (name, r) => {
  console.log(`\n${name}: ${r.display}/10 (raw ${r.score}) flags=${r.flags.join(',') || '-'}`);
  for (const p of r.phases) console.log(`  ${p.pass ? '✓' : '✗'} ${p.label.padEnd(17)} -${p.deduction.toFixed(2)}  ${p.note}`);
};

const perfect = drive();
show('textbook', perfect);
assert.equal(perfect.display, 10, 'a textbook overtake should be a 10');
assert.ok(perfect.perfect);

const noInd = drive({ indicateOut: null });
show('no indicator out', noInd);
assert.ok(noInd.flags.includes('noIndicateOut'));
assert.ok(noInd.display <= 7);

const wrong = drive({ indicateOut: 'left' });
show('wrong indicator', wrong);
assert.ok(wrong.flags.includes('wrongIndicator'));

const late = drive({ moveOutAfter: 2.0 });
show('indicated 2s', late);
assert.ok(late.display === 9 || late.display === 8, 'slightly late indicator should cost the 10 but not much');

const cut = drive({ reenterGap: -3, indicateInLead: 0.2, keyboardYank: true });
show('cut in', cut);
assert.ok(cut.flags.includes('cutIn') || cut.flags.includes('snug') || cut.crash);
assert.ok(!cut.perfect);

const ticking = drive({ cancel: false });
show('left indicator on', ticking);
assert.ok(ticking.flags.includes('noCancel'));

const close = drive({ outD: -0.3 });
show('close pass', close);
assert.ok(close.flags.includes('closePass') || close.flags.includes('bitClose'));
assert.ok(close.display < 9);

const yank = drive({ keyboardYank: true, passRel: 7 });
show('yanky steering', yank);

const lorry = drive({ oncoming: [{ id: 1, s0: 260, v: 22, length: 9.5, type: 'lorry', alarmed: false }] });
show('oncoming lorry', lorry);
assert.ok(lorry.flags.includes('unsafe') || lorry.flags.includes('nearMiss'));

const horn = drive({ horn: true });
show('horn', horn);
assert.ok(horn.flags.includes('horn'));

// Keyboard feel: a held lane change (~1s) stays smooth, a left-right flick is harsh.
function keyboardLat(script, v = 14) {
  const car = new PlayerCar(0, v);
  car.d = -1.65;
  let peak = 0;
  let hold = 0;
  let harsh = false;
  for (let t = 0; t < 5; t += SIM_DT) {
    car.step(SIM_DT, { steer: script(t), steerAnalog: false, throttle: 0, brake: 0 }, flatRoad);
    car.v = v;
    peak = Math.max(peak, Math.abs(car.latAccel));
    hold = Math.abs(car.latAccel) > 3.6 ? hold + SIM_DT : 0;
    if (hold >= 0.12) harsh = true;
  }
  return { peak, harsh, d: car.d };
}
const laneChange = keyboardLat((t) => (t < 1.0 ? 1 : 0));
console.log(`\nkeyboard lane change (1.0s hold): ${(laneChange.d + 1.65).toFixed(2)}m across, peak ${laneChange.peak.toFixed(2)} m/s²`);
assert.ok(laneChange.d > 1.4, 'a 1s hold should reach the other lane');
assert.ok(!laneChange.harsh);
const flick = keyboardLat((t) => (t < 0.5 ? 1 : t < 1 ? -1 : 0));
console.log(`keyboard flick (0.5s right, 0.5s left): peak ${flick.peak.toFixed(2)} m/s²`);
assert.ok(flick.harsh, 'a left-right flick should count as harsh');

// Determinism: same inputs, same output
assert.deepEqual(drive(), perfect);

console.log('\nAll scoring checks passed.');
