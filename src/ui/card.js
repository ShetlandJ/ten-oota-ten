// Daniel's verdict card, styled like a reel caption.
import { avatarCanvas } from './avatar.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function showCard(result, quip, { index, total, onContinue }) {
  const root = $('card');
  const card = root.querySelector('.card');
  card.classList.toggle('perfect', !!result.perfect);
  card.classList.toggle('crash', !!result.crash);
  const av = $('card-avatar');
  av.innerHTML = '';
  av.appendChild(avatarCanvas(44));
  $('card-sub').textContent = `Overtake ${index + 1} of ${total}`;

  const score = $('card-score');
  if (result.perfect) {
    score.className = 'card-score badge';
    score.textContent = '10 oota 10';
  } else {
    score.className = 'card-score';
    score.innerHTML = `${result.display}<small>/10</small>`;
  }
  $('card-quip').textContent = quip.text;

  const list = $('card-breakdown');
  if (result.crash) {
    list.innerHTML = `<li><span class="mark">✗</span><span class="label">${result.crash === 'cyclist' ? "You touched Daniel's bike" : 'Head-on collision'}</span><span class="ded">0</span></li>`;
  } else {
    const rows = result.phases.map(
      (p) =>
        `<li><span class="mark">${p.pass ? '✓' : '✗'}</span><span class="label">${esc(p.label)}</span><span class="ded">${p.pass ? '' : `−${p.deduction.toFixed(1)}`}</span><span class="note">${esc(p.note || '')}</span></li>`,
    );
    if (result.bonus > 0)
      rows.push(`<li><span class="mark">+</span><span class="label">Patience bonus</span><span class="ded">+${result.bonus.toFixed(1)}</span><span class="note">waited ${result.waited.toFixed(0)}s for a safe gap</span></li>`);
    list.innerHTML = rows.join('');
  }
  root.hidden = false;
  const btn = root.querySelector('[data-action="card-continue"]');
  btn.textContent = index + 1 >= total ? 'Finish the run' : 'Keep driving';
  const done = () => {
    root.hidden = true;
    btn.removeEventListener('click', done);
    window.removeEventListener('keydown', key);
    onContinue();
  };
  const key = (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      done();
    }
  };
  btn.addEventListener('click', done);
  // Small delay so a held key from driving doesn't instantly dismiss it
  setTimeout(() => window.addEventListener('keydown', key), 600);
}
