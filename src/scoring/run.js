// A run's result as a plain, serialisable object: ready to POST to a
// leaderboard later without touching the game code.
import { SCORING_VERSION } from './config.js';

export function createRun({ seed, routeId, startedAt = Date.now() }) {
  const run = {
    schema: 1,
    scoringVersion: SCORING_VERSION,
    seed: String(seed),
    routeId,
    startedAt,
    finishedAt: null,
    durationS: 0,
    overtakes: [],
    skipped: [],
    summary: null,
  };

  return {
    data: run,
    addOvertake(result, quip, meta = {}) {
      run.overtakes.push({
        index: result.index,
        score: result.score,
        display: result.display,
        perfect: result.perfect,
        crash: result.crash,
        flags: result.flags,
        bonus: result.bonus,
        phases: result.phases.map((p) => ({ key: p.key, pass: p.pass, deduction: p.deduction, note: p.note })),
        quip: quip.text,
        quipCategory: quip.category,
        atS: Math.round(meta.s ?? 0),
        atT: Math.round((meta.t ?? 0) * 100) / 100,
      });
    },
    addSkipped(index, reason, quip) {
      run.skipped.push({ index, reason, quip });
    },
    finish(durationS) {
      run.finishedAt = Date.now();
      run.durationS = Math.round(durationS * 10) / 10;
      run.summary = summarise(run.overtakes);
      return JSON.parse(JSON.stringify(run));
    },
  };
}

export function summarise(overtakes) {
  if (!overtakes.length) return { count: 0, average: 0, best: null, worst: null, perfectTens: 0, crashes: 0 };
  const avg = overtakes.reduce((s, o) => s + o.score, 0) / overtakes.length;
  const byScore = [...overtakes].sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    count: overtakes.length,
    average: Math.floor(avg * 10) / 10, // never round up
    best: byScore[0].index,
    worst: byScore[byScore.length - 1].index,
    perfectTens: overtakes.filter((o) => o.perfect).length,
    crashes: overtakes.filter((o) => o.crash).length,
  };
}
