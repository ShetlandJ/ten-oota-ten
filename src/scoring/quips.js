// Daniel's verdicts. Picked deterministically from (seed, overtake index) so a
// replayed run gets the same lines.
//
// CATCHPHRASES: swap these for Daniel's real ones. They're slotted into the
// quips below wherever {cp} appears, and used on the title and share screens.
export const CATCHPHRASES = [
  '10 oota 10',
  'Scholars on bicycles only want one thing',
  "I'm unstoppable",
  'Now reaching a bigger crowd',
];

import { Rng } from '../util/rng.js';

const Q = {
  perfect: [
    'TEN. OOTA. TEN. Frame it. Hang it in da hall. Tell your grandbairns.',
    'Scholars on bicycles only want one thing, and du just gave it to me. 10 oota 10.',
    "Three seconds of indicator, two metres of road, cancelled like a professional. I'm welling up. 10 oota 10.",
    'Perfect. I had to check the helmet cam twice. 10 oota 10, and I never say that.',
  ],
  nine: [
    "Nine. So close I could taste it. Like a Tunnock's just oot o' reach.",
    "That's a nine. One wee thing off a ten. Du kens what du did.",
    'Proper driving, that. A nine, and a nod from the saddle.',
    'Nine oota ten. My mam would be proud of you. Not proud proud. But proud.',
    'Lovely stuff. A nine. The sheep applauded, I heard them.',
  ],
  eight: [
    'An eight. Solid. Would be overtaken by again.',
    "Eight. Good, but I've seen better from a Sumburgh taxi.",
    "That's a tidy eight. Polish the details and we'll talk.",
    'Eight oota ten. Nearly textbook. The textbook has a few more pages though.',
  ],
  good: [
    "Fine. Perfectly fine. That's the problem.",
    'Not bad. The Highway Code is free online, by the way.',
    "Not bad, not memorable. Like a Tuesday in Cunningsburgh.",
    "I've had worse. I've had a lot worse. Still, though.",
    'Decent enough that I won\'t put it in a reel.',
    "Middle of the road, which is more than I can say for your car.",
  ],
  poor: [
    "I'll be honest, I've been passed better by the school bus.",
    "Was that an overtake or an audition for Shetland Traffic Cops?",
    'Somewhere a driving instructor felt a disturbance.',
    "I'm not angry. I'm just going to post it.",
  ],
  bad: [
    'That was less an overtake and more a near-death experience with a soundtrack.',
    "I've filmed it. The reel writes itself.",
    "Du passed me like I owed dee money.",
    "I'd go lower but I'm in a good mood. I was, anyway.",
    "Peerie bit o' advice: the other lane has cars in it.",
  ],
  noIndicateOut: [
    "Indicator? Never heard of her, apparently.",
    'No indicator. Psychic, are we? Because I\'m not.',
    'Du pulled oot wi\' no indicator. The stalk is the thing by your left hand, for future reference.',
    "Not a blink. Not a flicker. I've had more warning from the weather.",
  ],
  wrongIndicator: [
    'Indicated LEFT, went RIGHT. Bold. Wrong, but bold.',
    'Left indicator to overtake? Were you planning to go through me?',
  ],
  noCancel: [
    "Still ticking. Still. Ticking. You'll be indicating into Lerwick.",
    "Left your indicator on. Every driver behind you now thinks you're turning at Fladdabister.",
    "Tick tock tick tock. Cancel your indicator, it's not a metronome.",
    'Good pass, then you left it blinking like a Christmas jumper.',
  ],
  cutIn: [
    'Cut in that early and I could read your tax disc. If they still had tax discs.',
    "Back in before you'd passed me. My front wheel nearly met your bumper.",
    "You cut in so tight I'm now technically your passenger.",
    "Mirror, signal, manoeuvre. Not manoeuvre, manoeuvre, manoeuvre.",
  ],
  closePass: [
    'Close pass. I could smell your air freshener. Pine, was it?',
    "One point five metres. It's in the Highway Code. That was not it.",
    "I've had closer shaves, but only from a barber.",
    'That close? We should exchange numbers.',
  ],
  speeding: [
    'Doing that speed past me? In this economy?',
    "The limit's a limit, no' a target. Specially past a bicycle.",
    'Du went past me like da Northlink was leaving withoot dee.',
  ],
  unsafe: [
    "Overtaking on a blind bend. Brave. I'd say stupid, but I'm on camera.",
    "There was a lorry coming. A LORRY. They're quite big.",
    'Solid white line means no overtaking. Not "overtake faster".',
    'The oncoming driver and I made eye contact. We were both praying.',
  ],
  tailgate: [
    'You were so close behind me I could hear your radio. Was that Radio Shetland?',
    "Two-second gap. TWO. You gave me about a half.",
    "Sat on my back wheel the whole way. I'm a cyclist, no' a tow truck.",
  ],
  horn: [
    "Beeped at me? I'm on a bike, no' deaf.",
    "The horn. Classic. Ten points to Gryffindor, minus a lot to you.",
    "A wee toot. How charming. How unnecessary.",
  ],
  crawl: [
    'You crawled past so slowly I aged. Look at my beard.',
    "Alongside me for that long? We should've had a chat.",
  ],
  jerky: [
    'Smooth like crunchy peanut butter, that.',
    "Steering like you were fighting the wheel for the last biscuit.",
  ],
  patient: [
    "Waited for a proper gap. Patient. I like that in a driver.",
    'You waited. You actually waited. Shetland thanks you.',
  ],
  hitDaniel: [
    'You TOUCHED my BIKE. Zero oota ten.',
    "Contact. Actual contact. The helmet cam's filed a complaint.",
    "We're close, you and me. But no' that close.",
    "Zero. I've been nudged by sheep with more respect.",
    "That's my pannier you just met. It's got my piece in it.",
    'Did du think I was a speed bump? Zero.',
  ],
  headOn: [
    'Head-on. Zero. That poor driver was only going to the Co-op.',
    "Zero. I've seen safer overtakes in Mario Kart.",
  ],
  neverPassed: [
    "Followed me the whole way. Patience of a saint, but I'm no' a convoy leader.",
    "Never overtook. Respect, I suppose. Or fear. Mostly fear.",
  ],
};

// Order matters: the first fault that applies decides the line.
const FAULT_ORDER = ['hitDaniel', 'headOn', 'cutIn', 'noIndicateOut', 'wrongIndicator', 'closePass', 'noCancel', 'unsafe', 'nearMiss', 'speeding', 'tailgate', 'horn', 'crawl', 'jerky'];

export function quipFor(result, seed) {
  const rng = new Rng(`${seed}:quip:${result.index}`);
  const has = (f) => result.flags.includes(f);
  let pool;
  let category;
  if (result.perfect) category = 'perfect';
  else {
    const fault = FAULT_ORDER.find((f) => has(f));
    // Big faults always get called out; small ones only when the score is middling or worse.
    const bigFault = ['hitDaniel', 'headOn', 'cutIn', 'noIndicateOut', 'wrongIndicator', 'closePass', 'noCancel'].includes(fault);
    if (fault && (bigFault || result.display <= 7)) category = fault === 'nearMiss' ? 'unsafe' : fault;
    else if (has('patient') && result.display >= 7) category = 'patient';
    else category = band(result.display);
  }
  pool = Q[category] || Q[band(result.display)];
  const text = rng.pick(pool).replace('{cp}', rng.pick(CATCHPHRASES));
  return { text, category };
}

export function neverPassedQuip(seed, index) {
  const rng = new Rng(`${seed}:never:${index}`);
  return rng.pick(Q.neverPassed);
}

function band(n) {
  if (n >= 10) return 'perfect';
  if (n === 9) return 'nine';
  if (n === 8) return 'eight';
  if (n >= 6) return 'good';
  if (n >= 4) return 'poor';
  return 'bad';
}

export const QUIP_COUNT = Object.values(Q).reduce((s, a) => s + a.length, 0);
