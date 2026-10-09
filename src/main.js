import * as THREE from 'three';
import { Road } from './world/road.js';
import { Terrain } from './world/terrain.js';
import { buildRoad } from './world/roadMesh.js';
import { buildScenery } from './world/scenery.js';
import { Sky } from './world/sky.js';
import { Input, bindTouch } from './input/input.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { Game } from './game.js';
import { avatarCanvas } from './ui/avatar.js';
import { renderShareImage, shareImage } from './ui/share.js';
import { dailySeed, randomSeed } from './util/rng.js';
import { load, save } from './util/storage.js';
import { CATCHPHRASES } from './scoring/quips.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || /[?&]touch/.test(location.search);
document.body.classList.toggle('touch', isTouch);
const lowPower = isTouch || (navigator.hardwareConcurrency || 8) <= 4;

// ---- Renderer --------------------------------------------------------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower || devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 3200);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Load & build the world ------------------------------------------------
const res = await fetch(`${import.meta.env.BASE_URL}data/route.json`);
if (!res.ok) throw new Error(`The road data didn't download (${res.status}).`);
const data = await res.json();
const road = new Road(data);
const terrain = new Terrain(data);
scene.add(terrain.buildMesh());
scene.add(terrain.buildSea());
scene.add(terrain.buildLochs(data.lochs || []));
scene.add(buildRoad(road, terrain, data));
const scenery = buildScenery(road, terrain, data);
scene.add(scenery.group);
const sky = new Sky(scene, 'a970', { shadows: true, shadowSize: lowPower ? 1024 : 2048 });

const world = { data, road, terrain, sky, sheep: scenery.sheep };
const input = new Input();
bindTouch(input, $('touch'));
const audio = new Audio();
const hud = new Hud();

const game = new Game({
  renderer,
  scene,
  camera,
  world,
  input,
  audio,
  hud,
  isTouch,
  onEnd: showEnd,
});

// ---- Title -------------------------------------------------------------------
$('title-avatar').appendChild(avatarCanvas(150));
function showTitle() {
  for (const id of ['hud', 'touch', 'screen-end', 'screen-pause', 'card', 'bonk']) $(id).hidden = true;
  $('screen-title').hidden = false;
  const pb = load('pb');
  const tens = load('tens', 0);
  $('title-pb').textContent = pb
    ? `Personal best: ${pb.average.toFixed(1)} average${tens ? ` · ${tens} perfect 10${tens > 1 ? 's' : ''} all-time` : ''}`
    : `"${CATCHPHRASES[1]}…"`;
  game.state = 'idle';
  attract();
}

// Gentle fly-along behind the start while on the title screen
let attractT = 0;
function attract() {
  if (!game.player) {
    game.start('attract');
    game.state = 'idle';
  }
}

function startRun(seed) {
  audio.unlock();
  if (isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  for (const id of ['screen-title', 'screen-end', 'screen-pause', 'card', 'bonk']) $(id).hidden = true;
  hud.show(true);
  $('touch').hidden = !isTouch;
  game.start(seed);
  currentSeed = seed;
}
let currentSeed = null;

// ---- End ---------------------------------------------------------------------
let lastRun = null;
function showEnd(run) {
  lastRun = run;
  hud.show(false);
  $('touch').hidden = true;
  const s = run.summary;
  const pb = load('pb');
  const eligible = s.count >= 3;
  const isNewPb = eligible && (!pb || s.average > pb.average);
  if (isNewPb) save('pb', { average: s.average, seed: run.seed, at: run.finishedAt, perfectTens: s.perfectTens });
  save('tens', load('tens', 0) + s.perfectTens);
  const runs = load('runs', []);
  runs.unshift(run);
  save('runs', runs.slice(0, 10));

  $('end-stats').innerHTML = [
    stat(s.count ? s.average.toFixed(1) : '–', 'average /10', isNewPb),
    stat(s.perfectTens, `perfect 10${s.perfectTens === 1 ? '' : 's'}`),
    stat(s.count, 'overtakes'),
    stat(isNewPb ? 'NEW' : pb ? pb.average.toFixed(1) : '–', 'personal best', isNewPb),
  ].join('');
  const rows = [];
  const byIdx = (i) => run.overtakes.find((o) => o.index === i);
  if (s.count) {
    const best = byIdx(s.best);
    const worst = byIdx(s.worst);
    rows.push(row('Best', best));
    if (worst !== best) rows.push(row('Worst', worst));
  }
  for (const sk of run.skipped) rows.push(`<div class="row"><b>–</b> Overtake ${sk.index + 1}: never passed. "${esc(sk.quip)}"</div>`);
  if (!s.count) rows.push(`<div class="row">No overtakes scored. Daniel is still waiting.</div>`);
  $('end-best').innerHTML = rows.join('');
  const img = renderShareImage(run, { personalBest: pb ? pb.average : null, isNewPb });
  lastShare = img;
  const preview = new Image();
  preview.src = img.toDataURL('image/png');
  preview.alt = 'Share image';
  $('share-preview').innerHTML = '';
  $('share-preview').appendChild(preview);
  $('screen-end').hidden = false;
  console.info('[10oota10] run result', run);
}
let lastShare = null;

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stat = (v, label, hi = false) => `<div class="stat${hi ? ' pb-new' : ''}"><b>${v}</b><span>${label}</span></div>`;
const row = (label, o) => `<div class="row"><b>${label}</b> ${o.perfect ? '10 oota 10' : `${o.display}/10`}: "${esc(o.quip)}"</div>`;

// ---- Buttons -----------------------------------------------------------------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  audio.unlock();
  if (a === 'start-daily') startRun(dailySeed());
  else if (a === 'start-random') startRun(randomSeed());
  else if (a === 'again-same') startRun(currentSeed);
  else if (a === 'again-new') startRun(randomSeed());
  else if (a === 'quit') showTitle();
  else if (a === 'camera') game.toggleCamera();
  else if (a === 'mute') btn.classList.toggle('muted', audio.toggleMute());
  else if (a === 'pause') togglePause(true);
  else if (a === 'resume') togglePause(false);
  else if (a === 'share' && lastShare) {
    const s = lastRun.summary;
    const r = await shareImage(lastShare, `I averaged ${s.average.toFixed(1)}/10 overtaking Daniel on the A970. ${s.perfectTens ? `${s.perfectTens}x 10 oota 10.` : 'No tens. Yet.'}`);
    if (r === 'downloaded') btn.textContent = 'Saved image';
  }
});
document.querySelector('[data-action="mute"]').classList.toggle('muted', audio.muted);
input.on('mute', () => document.querySelector('[data-action="mute"]').classList.toggle('muted', audio.toggleMute()));
input.on('pause', () => togglePause(game.state === 'playing'));

function togglePause(on) {
  if (on && game.state !== 'playing') return;
  if (!on && game.state !== 'paused') return;
  game.pause(on);
  $('screen-pause').hidden = !on;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) togglePause(true);
});

// ---- Loop --------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game.state === 'idle' && game.player) {
    // Title backdrop: drift along the road slowly
    attractT += dt;
    game.player.s = road.routeStart + 40 + attractT * 9;
    if (game.player.s > road.routeEnd) attractT = 0;
    game.player.v = 9;
  }
  game.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Splash: one tap (or key) unlocks audio, then the menu appears.
attract();
requestAnimationFrame(frame);
$('splash-avatar').appendChild(avatarCanvas(120));
$('loading-text').hidden = true;
$('loading-slow')?.remove();
$('splash-start').hidden = false;
$('splash-hint').hidden = false;
const begin = (e) => {
  if (e.type === 'keydown' && ['Tab', 'Shift', 'Meta', 'Alt', 'Control'].includes(e.key)) return;
  e.preventDefault();
  $('screen-loading').removeEventListener('pointerdown', begin);
  window.removeEventListener('keydown', begin);
  audio.unlock();
  $('screen-loading').hidden = true;
  showTitle();
};
$('screen-loading').addEventListener('pointerdown', begin);
window.addEventListener('keydown', begin);

// Debug hook for testing in the console
window.__game = game;
