// Every scoring threshold in one place. Changing anything here changes what a
// "10" means, so bump SCORING_VERSION when you do (leaderboards will key on it).

export const SCORING_VERSION = 1;

export const SCORING = {
  // Geometry thresholds (metres, from road centreline, positive = right)
  moveOutOffset: 0.5, // car centre this far right of its lane centre = "moved out"
  reenterD: -0.6, // car centre back below this = "moved back in"
  overLineD: 0.0, // car's right edge past the centre line

  // Approach
  safeHeadway: 2.0, // seconds
  matchedSpeed: 3.0, // m/s: "following" rather than closing
  followRange: 60, // metres
  tooClose: 6, // metres, at any speed
  hotCloseTtc: 1.5, // seconds to rear-ending him while still in lane
  hotCloseGap: 25,
  revHold: 0.3, // throttle + brake together for this long = revving

  // Indicating
  indicateOutFull: 3.0, // seconds before moving across
  indicateInFull: 1.0,
  cancelWithin: 3.0,
  cancelLate: 6.0,

  // Safe moment
  oncomingTtcGood: 6.0,
  oncomingTtcOk: 4.0,
  oncomingTtcNearMiss: 2.0,

  // Clearance (Highway Code rule 163): 1.5m up to 30mph, more above.
  clearanceAt30: 1.5,
  clearancePerMph: 0.025, // +0.5m by 50mph
  clearanceMax: 2.5,

  // Speed while passing
  crawlRel: 3.5, // m/s faster than Daniel, average while alongside
  brisk: 13.4, // ~30mph faster
  blast: 15.6, // ~35mph faster

  // Moving back in
  cutInClear: 9.0, // metres between car rear and bike front (car length + margin)
  cutInSnug: 5.0,

  // Smoothness
  harshLat: 3.6, // m/s^2
  harshLatHold: 0.12,
  harshBrake: 5.0, // m/s^2 deceleration
  harshBrakeHold: 0.2,

  // Patience
  patienceMin: 3.0, // seconds waiting at a safe distance while it wasn't safe
  patienceLookahead: 150, // metres of road ahead that must be clear of hazards
  patienceOncomingTta: 9.0, // seconds until next oncoming arrives

  // Stayed out forever
  maxOutAfterPass: 20,
};

// Deduction tables. 10 minus deductions (+ patience bonus) is the raw score.
export const DEDUCT = {
  tailgateBase: 0.5,
  tailgatePerSecond: 0.75,
  tailgateMax: 1.5,
  tooClose: 1.25,
  hotClose: 1.0,
  horn: 1.0,
  hornMax: 2.0,
  rev: 0.5,

  indicateOutMissing: 3.0,
  indicateOutWrong: 3.5,
  indicateOutLate: 1.75, // 0.5s – 1.5s
  indicateOutBitLate: [0.25, 1.0], // 1.5s – 3s, scaled

  nearMiss: 3.0,
  oncomingClose: 1.5,
  oncomingTight: 0.5,
  oncomingBraked: 1.0,
  hazardMajor: 1.5, // bend, crest
  hazardMinor: 1.0, // junction, bus stop
  hazardBrief: 0.5, // under 10m of it
  stayedOut: 2.0,

  clearance: [
    [0.2, 0.6],
    [0.5, 1.5],
    [1.0, 3.0],
    [Infinity, 5.0],
  ],

  speedingSlight: 0.5, // up to 3mph over
  speeding: 1.5, // up to 8mph over
  speedingBad: 3.0,
  crawl: 0.75,
  brisk: 0.4,
  blast: 1.0,

  indicateInMissing: 1.0,
  indicateInWrong: 1.25,
  indicateInLate: 0.4,

  cutInSnug: 1.0,
  cutIn: 2.5,
  cutUp: 4.0,

  cancelLate: 0.5,
  cancelNever: 1.25,

  harshSteer: 0.4,
  harshBrake: 0.5,
  smoothMax: 1.5,

  patienceBase: 0.15,
  patiencePerSecond: 0.03,
  patienceMax: 0.6,
};

export function requiredClearance(mph) {
  if (mph <= 30) return SCORING.clearanceAt30;
  return Math.min(SCORING.clearanceMax, SCORING.clearanceAt30 + (mph - 30) * SCORING.clearancePerMph);
}
