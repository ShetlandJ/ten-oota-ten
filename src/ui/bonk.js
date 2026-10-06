// The "you touched my bike" pop-up: big comic Daniel slams in and shouts.
import { drawDaniel } from './avatar.js';
import { Rng } from '../util/rng.js';

const SHOUTS = ['OI!', 'WHOA!', 'HEY!', 'EH?!', 'MY BIKE!'];
const HOLD_MS = 2600;

export function showBonk(quip, seed, index, onDone) {
  const root = document.getElementById('bonk');
  const face = document.getElementById('bonk-face');
  const size = Math.round(Math.min(window.innerWidth * 0.62, window.innerHeight * 0.48, 340));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawDaniel(ctx, size / 2, size / 2, size / 2 - 4);
  face.innerHTML = '';
  face.appendChild(c);

  document.getElementById('bonk-shout').textContent = new Rng(`${seed}:shout:${index}`).pick(SHOUTS);
  document.getElementById('bonk-quip').textContent = quip.text;

  // Restart the slam animation each time
  root.classList.remove('go');
  void root.offsetWidth;
  root.classList.add('go');
  root.hidden = false;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    root.removeEventListener('pointerdown', finish);
    window.removeEventListener('keydown', key);
    root.hidden = true;
    onDone();
  };
  const key = (e) => {
    if (e.code === 'Enter' || e.code === 'Space') finish();
  };
  const timer = setTimeout(finish, HOLD_MS);
  // Let it land before it can be skipped
  setTimeout(() => {
    if (finished) return;
    root.addEventListener('pointerdown', finish);
    window.addEventListener('keydown', key);
  }, 700);
}
