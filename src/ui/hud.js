// Heads-up display. Writes to the DOM only when values change.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      root: $('hud'),
      speed: $('speed'),
      speedBox: document.querySelector('.speed'),
      limit: $('limit'),
      indL: $('ind-left'),
      indR: $('ind-right'),
      phase: $('phase-chip'),
      hazard: $('hazard-chip'),
      gap: $('gap-chip'),
      gust: $('gust-chip'),
      clr: $('clearance'),
      clrVal: $('clearance-val'),
      clrFill: $('clearance-fill'),
      clrNeed: $('clearance-need'),
      clrFoot: $('clearance-foot'),
      toast: $('toast'),
      progFill: $('progress-fill'),
      progDots: $('progress-dots'),
      progCount: $('progress-count'),
      touchInd: [...document.querySelectorAll('[data-ind]')],
    };
    this.cache = {};
    this.toastTimer = 0;
  }

  show(on) {
    this.el.root.hidden = !on;
  }

  set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  setEncounters(total, positions) {
    this.el.progDots.innerHTML = positions.map((p, i) => `<div class="dot" data-i="${i}" style="left:${(p * 100).toFixed(1)}%">${i + 1}</div>`).join('');
    this.total = total;
  }

  markEncounter(i) {
    const d = this.el.progDots.querySelector(`[data-i="${i}"]`);
    if (d) d.classList.add('done');
  }

  toast(text, seconds = 2.5) {
    this.el.toast.textContent = text;
    this.el.toast.hidden = false;
    // restart animation
    this.el.toast.style.animation = 'none';
    void this.el.toast.offsetWidth;
    this.el.toast.style.animation = '';
    this.toastTimer = seconds;
  }

  update(dt, s) {
    const e = this.el;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) e.toast.hidden = true;
    }
    this.set('speed', Math.round(s.mph), (v) => (e.speed.textContent = v));
    this.set('over', s.mph > s.limit + 0.5, (v) => e.speedBox.classList.toggle('over', v));
    this.set('limit', s.limit, (v) => (e.limit.textContent = v));
    const litL = s.indicator === 'left' && s.blinkOn;
    const litR = s.indicator === 'right' && s.blinkOn;
    this.set('indL', litL, (v) => e.indL.classList.toggle('on', v));
    this.set('indR', litR, (v) => e.indR.classList.toggle('on', v));
    this.set('tind', s.indicator, (v) => e.touchInd.forEach((b) => b.classList.toggle('on', b.dataset.ind === v)));

    this.set('phase', s.phase || '', (v) => {
      e.phase.hidden = !v;
      e.phase.innerHTML = v;
    });
    this.set('hazard', s.hazard || '', (v) => {
      e.hazard.hidden = !v;
      e.hazard.textContent = v;
    });
    const gapKey = s.headway == null ? '' : s.headway.toFixed(1);
    this.set('gap', gapKey, (v) => {
      e.gap.hidden = !v;
      if (!v) return;
      const h = +v;
      e.gap.textContent = `Gap ${h >= 9.9 ? '9.9+' : v}s`;
      e.gap.className = `chip gap ${h >= 2 ? 'good' : h >= 1.2 ? 'warn' : 'bad'}`;
    });
    this.set('gust', !!s.gust, (v) => (e.gust.hidden = !v));

    const clrKey = s.clearance ? `${s.clearance.gap.toFixed(2)}|${s.clearance.req.toFixed(2)}` : '';
    this.set('clr', clrKey, () => {
      e.clr.hidden = !s.clearance;
      if (!s.clearance) return;
      const { gap, req } = s.clearance;
      const max = 3.5;
      const g = Math.max(0, gap);
      e.clrVal.textContent = `${g.toFixed(1)}m`;
      e.clrFill.style.width = `${Math.min(100, (g / max) * 100)}%`;
      e.clrFill.className = `clearance-fill ${g >= req ? '' : g >= req - 0.3 ? 'warn' : 'bad'}`;
      e.clrNeed.style.left = `${(req / max) * 100}%`;
      e.clrFoot.textContent = `needs ${req.toFixed(1)}m at this speed`;
    });

    this.set('prog', Math.round(s.progress * 400), (v) => (e.progFill.style.width = `${v / 4}%`));
    this.set('count', s.encounterText, (v) => (e.progCount.textContent = v));
  }
}
