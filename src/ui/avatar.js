// Comic-book Daniel for the cards and share image, drawn in 2D canvas:
// helmet (with the fluffy mic), round shades, big beard, hi-vis collar.

const INK = '#16140f';
const YELLOW = '#f5cf1d';
const YELLOW_DEEP = '#d9a90e';

export function drawDaniel(ctx, cx, cy, r, { burst = true } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = r / 100;
  ctx.scale(s, s);

  // Background disc with halftone + rays
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = YELLOW;
  ctx.fillRect(-100, -100, 200, 200);
  if (burst) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
      ctx.lineTo(Math.cos(a) * 140, Math.sin(a) * 140);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = -100; y <= 100; y += 7) {
    for (let x = -100 + ((y / 7) % 2) * 3.5; x <= 100; x += 7) {
      const d = Math.hypot(x, y) / 100;
      const rr = 0.6 + d * 1.6;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;

  // Shoulders + hi-vis collar
  ctx.fillStyle = '#d6ee2a';
  ctx.beginPath();
  ctx.moveTo(-95, 110);
  ctx.quadraticCurveTo(-80, 52, -30, 48);
  ctx.lineTo(30, 48);
  ctx.quadraticCurveTo(80, 52, 95, 110);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c3c7c4';
  ctx.fillRect(-90, 82, 180, 8);
  ctx.strokeRect(-90, 82, 180, 8);

  // Face
  ctx.fillStyle = '#f1c78f';
  ctx.beginPath();
  ctx.ellipse(0, -2, 36, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ears
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 36, 0, 7, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Beard: big, square-ish, ginger-brown with hatching
  ctx.fillStyle = '#8a5428';
  ctx.beginPath();
  ctx.moveTo(-37, -2);
  ctx.quadraticCurveTo(-42, 40, -22, 58);
  ctx.quadraticCurveTo(0, 72, 22, 58);
  ctx.quadraticCurveTo(42, 40, 37, -2);
  ctx.quadraticCurveTo(30, 18, 14, 16);
  ctx.quadraticCurveTo(0, 10, -14, 16);
  ctx.quadraticCurveTo(-30, 18, -37, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let i = -26; i <= 26; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 24 + Math.abs(i) * 0.1);
    ctx.lineTo(i * 0.9, 50 - Math.abs(i) * 0.4);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  // moustache + mouth
  ctx.fillStyle = '#7a4a22';
  ctx.beginPath();
  ctx.moveTo(-22, 22);
  ctx.quadraticCurveTo(0, 8, 22, 22);
  ctx.quadraticCurveTo(0, 18, -22, 22);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 30);
  ctx.quadraticCurveTo(0, 33, 8, 30);
  ctx.stroke();
  // nose
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.quadraticCurveTo(-8, 10, 2, 12);
  ctx.stroke();

  // Round sunglasses: gold rims, dark lenses, glint
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(sx * 16, -10, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#c9a24a';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx * 16 - 3, -13, 6, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.quadraticCurveTo(0, -15, 4, -12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-29, -12);
  ctx.lineTo(-37, -8);
  ctx.moveTo(29, -12);
  ctx.lineTo(37, -8);
  ctx.stroke();

  // Helmet: black shell with vents, peak
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.fillStyle = '#23272b';
  ctx.beginPath();
  ctx.moveTo(-46, -22);
  ctx.quadraticCurveTo(-50, -78, 0, -82);
  ctx.quadraticCurveTo(50, -78, 46, -22);
  ctx.quadraticCurveTo(0, -36, -46, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a5157';
  for (const vx of [-20, 0, 20]) {
    ctx.beginPath();
    ctx.ellipse(vx, -60, 5, 12, vx * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#555c62';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-40, -32);
  ctx.quadraticCurveTo(0, -44, 40, -32);
  ctx.stroke();
  // helmet cam
  ctx.fillStyle = '#111';
  ctx.fillRect(-9, -94, 18, 13);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(-9, -94, 18, 13);
  // Fluffy mic (dead cat) on the side
  ctx.fillStyle = '#a58c69';
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
    const rr = 15 + (Math.floor(a * 10) % 2 ? 4 : 0);
    ctx.lineTo(-50 + Math.cos(a) * rr, -46 + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Rim
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// The "10 oota 10" comic badge text.
export function drawBadge(ctx, x, y, size, text = '10 oota 10', align = 'center') {
  ctx.save();
  ctx.font = `italic 900 ${size}px "Arial Black", Impact, "Helvetica Neue", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = YELLOW;
  ctx.fillText(text, x, y);
  ctx.lineWidth = size * 0.04;
  ctx.strokeStyle = YELLOW_DEEP;
  ctx.strokeText(text, x, y);
  ctx.restore();
}

export function avatarCanvas(size = 160) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawDaniel(ctx, size / 2, size / 2, size / 2 - 3);
  return c;
}
