// Keyboard + touch input. Indicators latch on and only cancel when you press
// the same side again (or X). No auto-cancel, ever.
import { clamp } from '../util/math.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.indicator = null; // 'left' | 'right' | null
    this.touchSteer = 0;
    this.touchSteerActive = false;
    this.touchThrottle = false;
    this.touchBrake = false;
    this.hornHeld = false;
    this.listeners = {};
    this.enabled = true;

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchThrottle = this.touchBrake = this.touchSteerActive = false;
      this.touchSteer = 0;
    });
  }

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
  }

  emit(evt, ...args) {
    for (const fn of this.listeners[evt] || []) fn(...args);
  }

  _key(e, down) {
    const k = e.code;
    const game = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    if (game.includes(k)) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyQ' || k === 'Comma') this.stalk('left');
      if (k === 'KeyE' || k === 'Period') this.stalk('right');
      if (k === 'KeyX') this.cancelIndicator();
      if (k === 'KeyC') this.emit('camera');
      if (k === 'KeyP' || k === 'Escape') this.emit('pause');
      if (k === 'KeyM') this.emit('mute');
      if (k === 'Enter' || k === 'Space') this.emit('confirm');
    } else {
      this.keys.delete(k);
    }
  }

  // Same side again cancels; the other side switches straight over.
  stalk(side) {
    if (!this.enabled) return;
    this.indicator = this.indicator === side ? null : side;
    this.emit('indicator', this.indicator);
  }

  cancelIndicator() {
    if (this.indicator) {
      this.indicator = null;
      this.emit('indicator', null);
    }
  }

  reset() {
    this.indicator = null;
    this.touchSteer = 0;
    this.touchSteerActive = false;
    this.touchThrottle = this.touchBrake = false;
  }

  read() {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    let steer = 0;
    let analog = false;
    if (this.touchSteerActive) {
      steer = this.touchSteer;
      analog = true;
    } else {
      steer = (right ? 1 : 0) - (left ? 1 : 0);
    }
    return {
      steer: clamp(steer, -1, 1),
      steerAnalog: analog,
      throttle: k.has('KeyW') || k.has('ArrowUp') || this.touchThrottle,
      brake: k.has('KeyS') || k.has('ArrowDown') || this.touchBrake,
      horn: k.has('KeyH') || this.hornHeld,
    };
  }
}

// Wires the on-screen controls in #touch to an Input instance.
export function bindTouch(input, root) {
  const steerPad = root.querySelector('[data-steer]');
  const knob = root.querySelector('[data-knob]');
  const bindHold = (el, set) => {
    const down = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('held');
      set(true);
    };
    const up = (e) => {
      e.preventDefault();
      el.classList.remove('held');
      set(false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  };
  bindHold(root.querySelector('[data-gas]'), (v) => (input.touchThrottle = v));
  bindHold(root.querySelector('[data-brake]'), (v) => (input.touchBrake = v));
  bindHold(root.querySelector('[data-horn]'), (v) => (input.hornHeld = v));

  for (const el of root.querySelectorAll('[data-ind]')) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.stalk(el.dataset.ind);
    });
  }

  let steerId = null;
  const steerTo = (e) => {
    const r = steerPad.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 28);
    input.touchSteer = clamp(x, -1, 1);
    knob.style.transform = `translateX(${input.touchSteer * (r.width / 2 - 28)}px)`;
  };
  steerPad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    steerId = e.pointerId;
    steerPad.setPointerCapture?.(e.pointerId);
    input.touchSteerActive = true;
    steerTo(e);
  });
  steerPad.addEventListener('pointermove', (e) => {
    if (e.pointerId === steerId) steerTo(e);
  });
  const release = (e) => {
    if (e.pointerId !== steerId) return;
    steerId = null;
    input.touchSteer = 0;
    input.touchSteerActive = true; // keep analog mode so the return is smoothed
    knob.style.transform = 'translateX(0px)';
    setTimeout(() => {
      if (steerId == null) input.touchSteerActive = false;
    }, 400);
  };
  steerPad.addEventListener('pointerup', release);
  steerPad.addEventListener('pointercancel', release);
}
