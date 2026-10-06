// All sound is synthesised with WebAudio (no assets), except optional voice
// clips dropped into public/audio/ (see CLIPS below).
import { load, save } from '../util/storage.js';

// Optional recordings of Daniel. Drop files into public/audio/ with these
// names (mp3, m4a or wav) and they'll be used; missing files are ignored.
const CLIPS = {
  tenOotaTen: 'ten-oota-ten',
  rightOfWay: 'right-of-way', // "Do You Have The Right Of Way?" - title/end screen loop
};
const EXTS = ['mp3', 'm4a', 'wav', 'ogg'];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = load('muted', false);
    this.clips = {};
  }

  // Must be called from a user gesture (iOS).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    this.noise = this._noiseBuffer();

    // Engine: two detuned oscillators through a lowpass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engA = ctx.createOscillator();
    this.engA.type = 'sawtooth';
    this.engB = ctx.createOscillator();
    this.engB.type = 'square';
    this.engA.connect(lp);
    this.engB.connect(lp);
    lp.connect(this.engGain).connect(this.master);
    this.engA.start();
    this.engB.start();
    this.engLp = lp;

    // Wind / road noise
    const wn = ctx.createBufferSource();
    wn.buffer = this.noise;
    wn.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 600;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wn.connect(wf).connect(this.windGain).connect(this.master);
    wn.start();

    this.clipsReady = this._loadClips();
    if (this.pendingMusic) this.playMusic(this.pendingMusic);
  }

  // Each clip loads independently so the song isn't stuck behind missing files.
  _loadClips() {
    this.clipLoads = {};
    for (const [key, base] of Object.entries(CLIPS)) {
      this.clipLoads[key] = (async () => {
        for (const ext of EXTS) {
          try {
            const res = await fetch(`${import.meta.env.BASE_URL}audio/${base}.${ext}`);
            if (!res.ok || !(res.headers.get('content-type') || '').match(/audio|octet/)) continue;
            this.clips[key] = await this.ctx.decodeAudioData(await res.arrayBuffer());
            return;
          } catch {
            /* not there, that's fine */
          }
        }
      })();
    }
    return Promise.all(Object.values(this.clipLoads));
  }

  // Loop a clip as music. Safe to call before unlock: it starts as soon as
  // audio is unlocked and the clip has loaded. With fadeOutAfter, the music
  // (already playing or about to start) fades out that many seconds in.
  async playMusic(key, { volume = 0.55, fadeOutAfter = null, fadeOut = 4 } = {}) {
    this.pendingMusic = key;
    if (!this.ctx) return;
    await this.clipLoads[key];
    if (this.pendingMusic !== key || !this.clips[key]) return;
    if (this.music?.key !== key) {
      this._endMusic(0.1);
      const src = this.ctx.createBufferSource();
      src.buffer = this.clips[key];
      src.loop = true;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.4);
      src.connect(g).connect(this.master);
      src.start();
      this.music = { key, src, g, volume };
    }
    if (fadeOutAfter != null) this.stopMusic(fadeOut, fadeOutAfter);
  }

  stopMusic(fade = 0.6, delay = 0) {
    this.pendingMusic = null;
    this._endMusic(fade, delay);
  }

  // Fades out whatever is playing without cancelling a pending playMusic.
  _endMusic(fade, delay = 0) {
    if (!this.music || !this.ctx) return;
    const { src, g, volume } = this.music;
    const t = this.ctx.currentTime + delay;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(delay ? volume : g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.05);
    this.music = null;
  }

  hasClip(key) {
    return !!this.clips[key];
  }

  playClip(key) {
    if (!this.ctx || !this.clips[key]) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = this.clips[key];
    src.connect(this.master);
    src.start();
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    save('muted', this.muted);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let x = 1234567;
    for (let i = 0; i < len; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (x / 0x7fffffff) * 2 - 1;
    }
    return b;
  }

  engine(speed, throttle, running = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // fake gearbox
    const gears = [0, 7, 13, 19, 25, 40];
    let g = 1;
    while (g < gears.length - 1 && speed > gears[g]) g++;
    const lo = gears[g - 1];
    const hi = gears[g];
    const rpm = 0.25 + (0.75 * (speed - lo)) / (hi - lo);
    const f = 38 + rpm * 70 + throttle * 6;
    this.engA.frequency.setTargetAtTime(f, t, 0.05);
    this.engB.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.05);
    this.engLp.frequency.setTargetAtTime(300 + throttle * 500 + rpm * 300, t, 0.08);
    this.engGain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.04 : 0, t, 0.1);
    this.windGain.gain.setTargetAtTime(running ? Math.min(0.12, speed * 0.004) : 0, t, 0.2);
  }

  // Indicator relay: a bright tick when the lamp lights, a duller tock when it goes out.
  tick(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = on ? 2600 : 1700;
    bp.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(on ? 0.9 : 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.04);
  }

  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornNodes) {
      const g = this.ctx.createGain();
      g.gain.value = 0.12;
      const a = this.ctx.createOscillator();
      const b = this.ctx.createOscillator();
      a.type = b.type = 'square';
      a.frequency.value = 415;
      b.frequency.value = 520;
      const lp = this.ctx.createBiquadFilter();
      lp.frequency.value = 1800;
      a.connect(lp);
      b.connect(lp);
      lp.connect(g).connect(this.master);
      a.start();
      b.start();
      this.hornNodes = { a, b, g };
    } else if (!on && this.hornNodes) {
      const { a, b, g } = this.hornNodes;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      a.stop(this.ctx.currentTime + 0.1);
      b.stop(this.ctx.currentTime + 0.1);
      this.hornNodes = null;
    }
  }

  // Oncoming driver leaning on their horn
  farHorn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.03);
    g.gain.setValueAtTime(0.07, t + 0.7);
    g.gain.linearRampToValueAtTime(0, t + 0.8);
    for (const f of [350, 440]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.85);
    }
    g.connect(this.master);
  }

  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [dt, f] of [
      [0, 2100],
      [0.18, 2100],
    ]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = f * 2.76;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.15, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.6);
      o.connect(g);
      o2.connect(g);
      g.connect(this.master);
      o.start(t + dt);
      o2.start(t + dt);
      o.stop(t + dt + 0.7);
      o2.stop(t + dt + 0.7);
    }
  }

  // Comic "boing" when you touch Daniel's bike, then his bell.
  bonk() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
    setTimeout(() => this.bell(), 350);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.5);
  }

  rumble() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.frequency.value = 180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
  }

  ding(good) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = good ? [660, 880, 1320] : [440, 330];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.4);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.45);
    });
  }
}
