// Tracks one overtake of Daniel as a sequence of phases and scores it.
// Pure and deterministic: feed it the same frames, get the same result.
// No three.js, no DOM, no clocks.
//
// Frame shape (built by the game every fixed sim step):
// {
//   t, dt,
//   car:  { s, d, v, latAccel, longAccel, length, width, throttle, brake },
//   bike: { s, d, v, length, width },
//   indicator: 'left' | 'right' | null,
//   horn: boolean,          // horn pressed this step
//   limitMph: 50 | 60,
//   hazard: 0..4,           // restriction at the car's position (see road.js HAZARD)
//   hazardAhead: boolean,   // any restriction in the next ~150m
//   oncoming: [{ id, s, v, length, alarmed }],
//   crash: null | 'cyclist' | 'oncoming',
// }

import { SCORING as C, DEDUCT as X, requiredClearance, SCORING_VERSION } from './config.js';

const MPH = 0.44704;
const HAZARD_NAMES = ['', 'bend', 'crest', 'junction', 'bus stop'];

export const PHASES = [
  { key: 'approach', label: 'Approach' },
  { key: 'indicateOut', label: 'Indicate out' },
  { key: 'safe', label: 'Safe moment' },
  { key: 'clearance', label: 'Clearance' },
  { key: 'speed', label: 'Speed' },
  { key: 'indicateIn', label: 'Indicate in' },
  { key: 'moveIn', label: 'Move back in' },
  { key: 'cancel', label: 'Cancel indicator' },
  { key: 'smooth', label: 'Smoothness' },
];

export function createOvertakeTracker(index = 0) {
  const st = {
    index,
    state: 'approach', // approach | out | passed | in | done
    startT: null,
    t: 0,
    // indicator timing
    ind: null,
    indSince: 0,
    // approach
    minFollowHeadway: Infinity,
    tailgateTime: 0,
    tooClose: false,
    hotClose: false,
    horns: 0,
    revTime: 0,
    revved: false,
    waitTime: 0,
    aborts: 0,
    // move out
    moveOutT: null,
    outRightFor: 0,
    outLeftOn: false,
    // out
    minTtc: Infinity,
    minTtcType: null,
    oncomingBraked: false,
    alarmedSeen: new Set(),
    hazardMetres: [0, 0, 0, 0, 0],
    minMargin: Infinity,
    gapAtMin: null,
    reqAtMin: null,
    mphAtMin: null,
    maxOver: -Infinity,
    maxMph: 0,
    limitAtMax: 60,
    relSum: 0,
    relTime: 0,
    // passed / in
    passT: null,
    reenterT: null,
    inLeftFor: 0,
    inRightOn: false,
    cutGap: null,
    cancelT: null,
    stayedOut: false,
    // smoothness
    latHold: 0,
    brakeHold: 0,
    harshSteer: 0,
    harshBrake: 0,
    lastHarshSteerT: -9,
    lastHarshBrakeT: -9,
    crash: null,
    prevHorn: false,
  };

  function indicatorFor(side) {
    return st.ind === side ? st.t - st.indSince : 0;
  }

  function step(f) {
    if (st.state === 'done') return st.state;
    st.t = f.t;
    if (st.startT == null) st.startT = f.t;
    if (f.indicator !== st.ind) {
      st.ind = f.indicator;
      st.indSince = f.t;
    }

    const car = f.car;
    const bike = f.bike;
    const carFront = car.s + car.length / 2;
    const carRear = car.s - car.length / 2;
    const bikeFront = bike.s + bike.length / 2;
    const bikeRear = bike.s - bike.length / 2;
    const latGap = car.d - car.width / 2 - (bike.d + bike.width / 2);
    const behind = carFront < bikeRear;
    const alongside = carFront >= bikeRear - 1 && carRear <= bikeFront + 1;
    const passed = carRear > bikeFront;

    if (f.crash) {
      st.crash = f.crash;
      st.state = 'done';
      return st.state;
    }

    // ---- Smoothness (whole encounter)
    if (Math.abs(car.latAccel) > C.harshLat) st.latHold += f.dt;
    else st.latHold = 0;
    if (st.latHold >= C.harshLatHold && f.t - st.lastHarshSteerT > 1) {
      st.harshSteer++;
      st.lastHarshSteerT = f.t;
    }
    if (-car.longAccel > C.harshBrake) st.brakeHold += f.dt;
    else st.brakeHold = 0;
    if (st.brakeHold >= C.harshBrakeHold && f.t - st.lastHarshBrakeT > 1.5) {
      st.harshBrake++;
      st.lastHarshBrakeT = f.t;
    }
    if (f.horn && !st.prevHorn && st.state !== 'in') st.horns++;
    st.prevHorn = f.horn;

    const outThreshold = -1.65 + C.moveOutOffset;

    if (st.state === 'approach') {
      const inLane = car.d < outThreshold;
      const gap = bikeRear - carFront;
      if (behind && inLane && gap < C.followRange) {
        const headway = gap / Math.max(car.v, 0.5);
        const closing = car.v - bike.v;
        if (Math.abs(closing) < C.matchedSpeed) {
          st.minFollowHeadway = Math.min(st.minFollowHeadway, headway);
          if (headway < C.safeHeadway) st.tailgateTime += f.dt;
        }
        if (gap < C.tooClose && car.v > 3) st.tooClose = true;
        if (closing > 0.5 && gap / closing < C.hotCloseTtc && gap < C.hotCloseGap) st.hotClose = true;
        if (car.throttle > 0.5 && car.brake > 0.3) st.revTime += f.dt;
        else st.revTime = 0;
        if (st.revTime > C.revHold) st.revved = true;
        // Patience: hanging back while it genuinely isn't safe to go.
        if (headway >= C.safeHeadway * 0.95 && !overtakeWindowOpen(f)) st.waitTime += f.dt;
      }
      if (!inLane && !passed) {
        st.state = 'out';
        st.moveOutT = f.t;
        st.outRightFor = indicatorFor('right');
        st.outLeftOn = st.ind === 'left';
      }
      if (passed && inLane) {
        // Somehow got past without moving out (squeezed by): treat as move out now.
        st.state = 'out';
        st.moveOutT = f.t;
        st.outRightFor = indicatorFor('right');
        st.outLeftOn = st.ind === 'left';
      }
    }

    if (st.state === 'out' || st.state === 'passed') {
      trackOut(f, car, bike, latGap, alongside);
      if (st.state === 'out') {
        if (passed) {
          st.state = 'passed';
          st.passT = f.t;
        } else if (car.d < outThreshold - 0.1 && behind) {
          // Thought better of it. Fine, start again.
          st.aborts++;
          resetOut();
          st.state = 'approach';
        }
      }
      if (st.state === 'passed') {
        if (car.d < C.reenterD) {
          st.state = 'in';
          st.reenterT = f.t;
          st.inLeftFor = indicatorFor('left');
          st.inRightOn = st.ind === 'right';
          st.cutGap = carRear - bikeFront;
        } else if (f.t - st.passT > C.maxOutAfterPass) {
          st.stayedOut = true;
          st.state = 'done';
        }
      }
    } else if (st.state === 'in') {
      // Still check clearance in case they swing back into him.
      if (alongside) trackClearance(car, latGap);
      if (st.ind == null && st.cancelT == null) st.cancelT = f.t;
      if (st.ind != null) st.cancelT = null;
      const since = f.t - st.reenterT;
      if ((st.cancelT != null && since >= 2.0) || since >= 8.0) st.state = 'done';
    }
    return st.state;
  }

  function overtakeWindowOpen(f) {
    if (f.hazardAhead) return false;
    for (const o of f.oncoming) {
      const gap = o.s - f.car.s;
      if (gap < 0 || gap > 600) continue;
      const tta = gap / Math.max(1, o.v + f.car.v);
      if (tta < C.patienceOncomingTta) return false;
    }
    return true;
  }

  function trackClearance(car, latGap) {
    const mph = car.v / MPH;
    const req = requiredClearance(mph);
    const margin = latGap - req;
    if (margin < st.minMargin) {
      st.minMargin = margin;
      st.gapAtMin = latGap;
      st.reqAtMin = req;
      st.mphAtMin = mph;
    }
  }

  function trackOut(f, car, bike, latGap, alongside) {
    const overLine = car.d + car.width / 2 > C.overLineD;
    if (overLine) {
      for (const o of f.oncoming) {
        const gap = o.s - car.s - (car.length + o.length) / 2;
        if (gap < -1) continue;
        const ttc = Math.max(0, gap) / Math.max(0.5, car.v + o.v);
        if (ttc < st.minTtc) {
          st.minTtc = ttc;
          st.minTtcType = o.type || 'car';
        }
      }
      if (f.hazard) st.hazardMetres[f.hazard] += car.v * f.dt;
    }
    for (const o of f.oncoming) {
      if (o.alarmed && !st.alarmedSeen.has(o.id)) {
        st.alarmedSeen.add(o.id);
        if (overLine) st.oncomingBraked = true;
      }
    }
    if (alongside) {
      trackClearance(car, latGap);
      st.relSum += (car.v - bike.v) * f.dt;
      st.relTime += f.dt;
    }
    const mph = car.v / MPH;
    if (mph - f.limitMph > st.maxOver) {
      st.maxOver = mph - f.limitMph;
      st.limitAtMax = f.limitMph;
    }
    st.maxMph = Math.max(st.maxMph, mph);
  }

  function resetOut() {
    st.moveOutT = null;
    st.minTtc = Infinity;
    st.hazardMetres = [0, 0, 0, 0, 0];
    st.minMargin = Infinity;
    st.maxOver = -Infinity;
    st.maxMph = 0;
    st.relSum = 0;
    st.relTime = 0;
    st.oncomingBraked = false;
  }

  return {
    step,
    get state() {
      return st.state;
    },
    get phase() {
      return livePhase(st);
    },
    get started() {
      return st.moveOutT != null;
    },
    get raw() {
      return st;
    },
    result: () => scoreOvertake(st),
  };
}

// Which of the seven phases the driver is in, for the HUD.
function livePhase(st) {
  switch (st.state) {
    case 'approach':
      return st.ind === 'right' ? 'indicate out' : 'approach';
    case 'out':
      return 'pass';
    case 'passed':
      return st.ind === 'left' ? 'move in' : 'indicate in';
    case 'in':
      return st.ind ? 'cancel' : 'done';
    default:
      return 'done';
  }
}

// ---- Scoring ------------------------------------------------------------------
export function scoreOvertake(st) {
  const phases = {};
  const add = (key, deduction, note, extra = {}) => {
    phases[key] = { key, deduction: round2(deduction), pass: deduction <= 0, note, ...extra };
  };

  if (st.crash) {
    for (const p of PHASES) add(p.key, 0, '');
    return finalise(st, phases, 0, {
      crash: st.crash,
      flags: [st.crash === 'cyclist' ? 'hitDaniel' : 'headOn'],
    });
  }

  const flags = [];

  // Approach
  {
    let d = 0;
    const notes = [];
    if (st.tailgateTime > 0.25) {
      const h = st.minFollowHeadway;
      d += Math.min(X.tailgateMax, X.tailgateBase + Math.max(0, C.safeHeadway - h) * X.tailgatePerSecond);
      notes.push(`tailgated at ${h.toFixed(1)}s`);
      flags.push('tailgate');
    }
    if (st.tooClose) {
      d += X.tooClose;
      notes.push('right up his back wheel');
      flags.push('tailgate');
    }
    if (st.hotClose) {
      d += X.hotClose;
      notes.push('came in far too hot');
      flags.push('hot');
    }
    if (st.horns) {
      d += Math.min(X.hornMax, st.horns * X.horn);
      notes.push(st.horns > 1 ? `horn x${st.horns}` : 'used the horn');
      flags.push('horn');
    }
    if (st.revved) {
      d += X.rev;
      notes.push('revving');
      flags.push('rev');
    }
    const h = Number.isFinite(st.minFollowHeadway) ? `${st.minFollowHeadway.toFixed(1)}s gap` : 'clean approach';
    add('approach', d, notes.length ? notes.join(', ') : `${h}, no pressure`);
  }

  // Indicate out
  {
    const t = st.outRightFor;
    let d = 0;
    let note;
    if (st.outLeftOn) {
      d = X.indicateOutWrong;
      note = 'indicated LEFT to pull out right';
      flags.push('wrongIndicator');
    } else if (t < 0.5) {
      d = X.indicateOutMissing;
      note = 'no indicator';
      flags.push('noIndicateOut');
    } else if (t < 1.5) {
      d = X.indicateOutLate;
      note = `only ${t.toFixed(1)}s before moving`;
      flags.push('lateIndicateOut');
    } else if (t < C.indicateOutFull) {
      const [lo, hi] = X.indicateOutBitLate;
      d = lo + ((C.indicateOutFull - t) / (C.indicateOutFull - 1.5)) * (hi - lo);
      note = `${t.toFixed(1)}s (needs ${C.indicateOutFull.toFixed(0)}s)`;
      flags.push('lateIndicateOut');
    } else note = `${t.toFixed(1)}s before moving across`;
    add('indicateOut', d, note, { seconds: round2(t) });
  }

  // Safe moment
  {
    let d = 0;
    const notes = [];
    const ttc = st.minTtc;
    if (ttc < C.oncomingTtcNearMiss) {
      d += X.nearMiss;
      notes.push(`near miss with a ${st.minTtcType}`);
      flags.push('nearMiss');
    } else if (ttc < C.oncomingTtcOk) {
      d += X.oncomingClose;
      notes.push(`oncoming ${ttc.toFixed(1)}s away`);
      flags.push('unsafe');
    } else if (ttc < C.oncomingTtcGood) {
      d += X.oncomingTight;
      notes.push(`tight: oncoming ${ttc.toFixed(1)}s away`);
      flags.push('unsafe');
    }
    if (st.oncomingBraked) {
      d += X.oncomingBraked;
      notes.push('oncoming had to brake');
      flags.push('unsafe');
    }
    for (let code = 1; code <= 4; code++) {
      const m = st.hazardMetres[code];
      if (m <= 0.5) continue;
      const major = code <= 2;
      d += m < 10 ? X.hazardBrief : major ? X.hazardMajor : X.hazardMinor;
      notes.push(`out on a ${HAZARD_NAMES[code]}${major ? ' (solid line)' : ''}`);
      flags.push('unsafe');
    }
    if (st.stayedOut) {
      d += X.stayedOut;
      notes.push('stayed on the wrong side');
      flags.push('unsafe');
    }
    add('safe', d, notes.length ? notes.join(', ') : Number.isFinite(ttc) ? `clear road, nearest ${ttc.toFixed(1)}s` : 'clear road');
  }

  // Clearance
  {
    let d = 0;
    let note;
    if (!Number.isFinite(st.minMargin)) {
      note = 'n/a';
    } else {
      const deficit = -st.minMargin;
      if (deficit > 0) {
        for (const [upTo, ded] of X.clearance) {
          if (deficit <= upTo) {
            d = ded;
            break;
          }
        }
        flags.push(deficit > 0.5 ? 'closePass' : 'bitClose');
      }
      note = `${st.gapAtMin.toFixed(2)}m at ${Math.round(st.mphAtMin)}mph (needs ${st.reqAtMin.toFixed(2)}m)`;
    }
    add('clearance', d, note, { metres: st.gapAtMin == null ? null : round2(st.gapAtMin), required: st.reqAtMin == null ? null : round2(st.reqAtMin) });
  }

  // Speed
  {
    let d = 0;
    const notes = [];
    const over = st.maxOver;
    if (over > 8) d += X.speedingBad;
    else if (over > 3) d += X.speeding;
    else if (over > 0) d += X.speedingSlight;
    if (over > 0) {
      notes.push(`${Math.round(st.maxMph)}mph in a ${st.limitAtMax}`);
      flags.push(over > 3 ? 'speeding' : 'slightSpeeding');
    }
    const rel = st.relTime > 0 ? st.relSum / st.relTime : null;
    if (rel != null) {
      if (rel < C.crawlRel) {
        d += X.crawl;
        notes.push(`crawled past (+${Math.round(rel / MPH)}mph)`);
        flags.push('crawl');
      } else if (rel > C.blast) {
        d += X.blast;
        notes.push(`blasted past (+${Math.round(rel / MPH)}mph)`);
        flags.push('blast');
      } else if (rel > C.brisk) {
        d += X.brisk;
        notes.push(`brisk (+${Math.round(rel / MPH)}mph)`);
        flags.push('blast');
      }
    }
    add('speed', d, notes.length ? notes.join(', ') : `${Math.round(st.maxMph)}mph, +${Math.round((rel || 0) / MPH)}mph on him`);
  }

  // Indicate in
  {
    let d = 0;
    let note;
    if (st.reenterT == null) {
      d = X.indicateInMissing;
      note = 'never came back in';
    } else if (st.inRightOn) {
      d = X.indicateInWrong;
      note = 'still indicating right';
      flags.push('noIndicateIn');
    } else if (st.inLeftFor <= 0) {
      d = X.indicateInMissing;
      note = 'no left indicator';
      flags.push('noIndicateIn');
    } else if (st.inLeftFor < C.indicateInFull) {
      d = X.indicateInLate;
      note = `left on just ${st.inLeftFor.toFixed(1)}s`;
      flags.push('noIndicateIn');
    } else note = `left on ${st.inLeftFor.toFixed(1)}s before moving in`;
    add('indicateIn', d, note);
  }

  // Move back in
  {
    let d = 0;
    let note;
    const g = st.cutGap;
    if (g == null) note = 'n/a';
    else {
      if (g < 0) {
        d = X.cutUp;
        flags.push('cutIn');
      } else if (g < C.cutInSnug) {
        d = X.cutIn;
        flags.push('cutIn');
      } else if (g < C.cutInClear) {
        d = X.cutInSnug;
        flags.push('snug');
      }
      note = g < 0 ? 'cut across him' : `back in ${g.toFixed(1)}m ahead (needs ${C.cutInClear.toFixed(0)}m)`;
    }
    add('moveIn', d, note, { metres: g == null ? null : round2(g) });
  }

  // Cancel
  {
    let d = 0;
    let note;
    if (st.reenterT == null) note = 'n/a';
    else if (st.cancelT == null) {
      d = X.cancelNever;
      note = 'left it ticking';
      flags.push('noCancel');
    } else {
      const t = Math.max(0, st.cancelT - st.reenterT);
      if (t > C.cancelLate) {
        d = X.cancelNever;
        flags.push('noCancel');
      } else if (t > C.cancelWithin) {
        d = X.cancelLate;
        flags.push('lateCancel');
      }
      note = `cancelled after ${t.toFixed(1)}s`;
    }
    add('cancel', d, note);
  }

  // Smoothness
  {
    const d = Math.min(X.smoothMax, st.harshSteer * X.harshSteer + st.harshBrake * X.harshBrake);
    const notes = [];
    if (st.harshSteer) notes.push(st.harshSteer > 1 ? `${st.harshSteer} yanks of the wheel` : 'one yank of the wheel');
    if (st.harshBrake) notes.push(st.harshBrake > 1 ? `${st.harshBrake} stamps on the brake` : 'stamped on the brake');
    if (d > 0) flags.push('jerky');
    add('smooth', d, notes.length ? notes.join(', ') : 'silky');
  }

  const deductions = Object.values(phases).reduce((s, p) => s + p.deduction, 0);
  const safeClean = phases.safe.pass;
  let bonus = 0;
  if (st.waitTime >= C.patienceMin && safeClean) {
    bonus = Math.min(X.patienceMax, X.patienceBase + st.waitTime * X.patiencePerSecond);
    flags.push('patient');
  }
  return finalise(st, phases, 10 - deductions + bonus, { flags, bonus: round2(bonus), waited: round2(st.waitTime) });
}

function finalise(st, phases, raw, extra) {
  const perfect = !st.crash && Object.values(phases).every((p) => p.pass);
  let score = Math.max(0, Math.min(10, raw));
  if (!perfect) score = Math.min(score, 9.95);
  if (st.crash) score = 0;
  return {
    version: SCORING_VERSION,
    index: st.index,
    score: round2(score),
    display: perfect ? 10 : Math.floor(score), // never rounds up
    perfect,
    crash: extra.crash || null,
    flags: [...new Set(extra.flags || [])],
    bonus: extra.bonus || 0,
    waited: extra.waited || 0,
    aborts: st.aborts,
    phases: PHASES.map((p) => ({ ...phases[p.key], label: p.label })),
  };
}

const round2 = (v) => Math.round(v * 100) / 100;
