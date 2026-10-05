// 1080x1920 story-sized share image, drawn in 2D canvas.
import { drawDaniel, drawBadge } from './avatar.js';

const W = 1080;
const H = 1920;

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderShareImage(run, { personalBest = null, isNewPb = false } = {}) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const s = run.summary;

  // Story gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ff9a1f');
  g.addColorStop(0.55, '#ff4a2e');
  g.addColorStop(1, '#ff2f6e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // soft light blob
  const rg = ctx.createRadialGradient(W * 0.75, H * 0.25, 10, W * 0.75, H * 0.25, 700);
  rg.addColorStop(0, 'rgba(255,255,255,0.25)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.font = '600 44px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText('I overtook Daniel on the A970', 80, 170);
  ctx.font = '800 150px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText(`${s.average.toFixed(1)}`, 80, 340);
  ctx.font = '600 44px system-ui, -apple-system, Roboto, sans-serif';
  const avgW = (() => {
    ctx.font = '800 150px system-ui, -apple-system, Roboto, sans-serif';
    return ctx.measureText(`${s.average.toFixed(1)}`).width;
  })();
  ctx.font = '700 60px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText('/10 average', 100 + avgW, 330);

  ctx.font = '600 40px system-ui, -apple-system, Roboto, sans-serif';
  const tens = s.perfectTens;
  ctx.fillText(`${s.count} overtakes · ${tens} perfect 10${tens === 1 ? '' : 's'}${s.crashes ? ` · ${s.crashes} crash${s.crashes > 1 ? 'es' : ''}` : ''}`, 80, 420);
  if (personalBest != null) ctx.fillText(isNewPb ? 'New personal best!' : `Personal best ${personalBest.toFixed(1)}`, 80, 480);

  // Daniel
  drawDaniel(ctx, W / 2, 900, 290);
  drawBadge(ctx, W / 2, 1255, 120, tens ? '10 oota 10' : `${Math.floor(s.average)} oota 10`);

  // Caption card with best quip
  const best = run.overtakes.find((o) => o.index === s.best) || run.overtakes[0];
  if (best) {
    ctx.font = '64px "Times New Roman", Georgia, serif';
    const lines = wrap(ctx, best.quip, W - 260).slice(0, 4);
    const lh = 70;
    const bh = lines.length * lh + 60;
    const by = 1400;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#fff';
    roundRect(ctx, 100, by, W - 200, bh, 22);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, by + 30 + lh * (i + 0.8)));
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 36px system-ui, -apple-system, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Cunningsburgh, Shetland · run ${run.seed}`, W / 2, H - 120);
  ctx.textAlign = 'left';
  return c;
}

export async function shareImage(canvas, text) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], '10-oota-10.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '10-oota-10.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
