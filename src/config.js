// Shared physical constants. Scoring thresholds live in scoring/config.js.

export const MPH = 0.44704; // m/s per mph
export const toMph = (ms) => ms / MPH;

export const SIM_DT = 1 / 120; // fixed simulation step (deterministic)

export const ROAD = {
  halfWidth: 3.3, // A970 here is ~6.6m wide
  laneCentre: 1.65,
  edgeLine: 3.2,
  verge: 4.2,
};

// Lateral offset d: metres from the centreline, positive = right of travel.
// We drive on the left, so our lane centre is at d = -ROAD.laneCentre.
export const OWN_LANE = -ROAD.laneCentre;
export const ONCOMING_LANE = ROAD.laneCentre;

export const CAR = { length: 4.3, width: 1.8 };
export const BIKE = { length: 1.8, width: 0.65 };

export const DANIEL = {
  cruise: 7.6, // m/s (~17mph) on the flat
  lanePos: -2.35, // bike centre, ~0.95m in from the edge
};

export const ROUTE_ENCOUNTERS = 5;
