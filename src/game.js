// Game orchestration: fixed-step simulation, encounters with Daniel, scoring,
// crash handling, and syncing the 3D scene + HUD.
import * as THREE from 'three';
import { SIM_DT, OWN_LANE, ROUTE_ENCOUNTERS } from './config.js';
import { HAZARD_LABEL } from './world/road.js';
import { PlayerCar } from './vehicles/player.js';
import { Cyclist } from './vehicles/cyclist.js';
import { playerCar, oncomingModel, danielModel, poseDaniel } from './vehicles/models.js';
import { Traffic } from './traffic/traffic.js';
import { Wind } from './traffic/wind.js';
import { createOvertakeTracker } from './scoring/overtake.js';
import { requiredClearance } from './scoring/config.js';
import { quipFor, neverPassedQuip } from './scoring/quips.js';
import { createRun } from './scoring/run.js';
import { Rng } from './util/rng.js';
import { damp, clamp } from './util/math.js';
import { animateSheep } from './world/scenery.js';
import { showCard } from './ui/card.js';
import { showBonk } from './ui/bonk.js';

const BLINK_PERIOD = 0.75; // ~80 flashes a minute
const ENCOUNTER_TRIGGERS = [60, 1260, 2460, 3560]; // metres after the route start
const SPAWN_AHEAD = 270;

export class Game {
  constructor({ renderer, scene, camera, world, input, audio, hud, onEnd, isTouch }) {
    Object.assign(this, { renderer, scene, camera, world, input, audio, hud, onEnd, isTouch });
    this.road = world.road;
    this.state = 'idle';
    this.camMode = 'chase';
    this.timeScale = 1;
    this.acc = 0;
    this.tmp = {};
    this.tmpV = new THREE.Vector3();

    // Player model
    this.car = playerCar();
    scene.add(this.car.group);
    // Daniel model (one Daniel, reused for each encounter)
    this.dan = danielModel();
    this.dan.group.visible = false;
    scene.add(this.dan.group);
    this.oncomingMeshes = new Map();

    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();

    input.on('indicator', () => {
      this.blinkT = 0;
      this.blinkOn = !!this.input.indicator;
      if (this.input.indicator) this.audio.tick(true);
    });
    input.on('camera', () => this.toggleCamera());
  }

  toggleCamera() {
    this.camMode = this.camMode === 'chase' ? 'bonnet' : 'chase';
    this.car.group.visible = true;
    this._snapCamera = true;
  }

  start(seed) {
    this.seed = String(seed);
    const road = this.road;
    this.t = 0;
    this.player = new PlayerCar(road.routeStart, 20);
    this.traffic = new Traffic(this.seed, road);
    this.wind = new Wind(this.seed);
    this.run = createRun({ seed: this.seed, routeId: this.world.data.id });
    this.encounters = [];
    this.encounterIndex = 0;
    this.active = null;
    this.input.reset();
    this.blinkT = 0;
    this.blinkOn = false;
    this.hornWas = false;
    this.timeScale = 1;
    this.crash = null;
    this.bonked = false;
    this.acc = 0;
    for (const m of this.oncomingMeshes.values()) this.scene.remove(m.group);
    this.oncomingMeshes.clear();
    this.dan.group.visible = false;
    this.car.group.visible = true;
    this.state = 'playing';
    this._snapCamera = true;
    const L = road.routeEnd - road.routeStart;
    this.hud.setEncounters(
      ROUTE_ENCOUNTERS,
      ENCOUNTER_TRIGGERS.map((t) => (t + SPAWN_AHEAD + 200) / L),
    );
    this.hud.toast('Southbound on the A970. Daniel\'s out on his bike somewhere ahead.', 3.5);
  }

  pause(on) {
    if (this.state === 'playing' && on) this.state = 'paused';
    else if (this.state === 'paused' && !on) this.state = 'playing';
    this.audio.engine(0, 0, this.state === 'playing');
    this.audio.horn(false);
  }

  // ---------------------------------------------------------------------------
  update(realDt) {
    const dt = Math.min(realDt, 0.1);
    if (this.state === 'playing' || this.state === 'crash') {
      if (this.state === 'crash') this._updateCrash(dt);
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 24) {
        this._step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
        if (this.state !== 'playing' && this.state !== 'crash') break;
      }
    }
    if (this.player) this._render(dt);
  }

  _step(dt) {
    const p = this.player;
    const road = this.road;
    this.t += dt;
    const input = this.state === 'playing' ? this.input.read() : { steer: 0, throttle: false, brake: false, horn: false };
    p.step(dt, input, road);
    this.traffic.step(dt, p);

    // Indicator blink (sim time so it's deterministic and pauses with the game)
    if (this.input.indicator) {
      this.blinkT += dt;
      if (this.blinkT >= BLINK_PERIOD / 2) {
        this.blinkT -= BLINK_PERIOD / 2;
        this.blinkOn = !this.blinkOn;
        this.audio.tick(this.blinkOn);
      }
    } else this.blinkOn = false;

    if (input.horn !== this.hornWas) {
      this.audio.horn(input.horn);
      this.hornWas = input.horn;
    }

    // Spawn encounters
    const rs = p.s - road.routeStart;
    if (!this.active && this.encounterIndex < ROUTE_ENCOUNTERS) {
      const trig = ENCOUNTER_TRIGGERS[this.encounterIndex];
      if (rs >= trig) {
        const spawnS = p.s + SPAWN_AHEAD;
        if (spawnS < road.routeEnd - 450) this._spawnEncounter(spawnS);
        else this.encounterIndex = ROUTE_ENCOUNTERS; // out of road
      }
    }
    const enc = this.active;
    if (enc) enc.daniel.step(dt, road);
    else if (this.lastDaniel) this.lastDaniel.step(dt, road);

    // Oncoming alarms -> horn + flash
    for (const o of this.traffic.vehicles) {
      if (o.alarmed && !o.honked) {
        o.honked = true;
        this.audio.farHorn();
      }
    }

    // Collisions
    let crash = null;
    let crashWith = null;
    const carL = p.d - p.width / 2;
    const carR = p.d + p.width / 2;
    if (enc) {
      const b = enc.daniel;
      if (Math.abs(p.s - b.s) < (p.length + b.length) / 2 - 0.15 && carL < b.d + b.width / 2 && carR > b.d - b.width / 2 && p.v > 0.5) {
        crash = 'cyclist';
      }
    }
    for (const o of this.traffic.vehicles) {
      if (Math.abs(p.s - o.s) < (p.length + o.length) / 2 - 0.2 && carR > o.d - o.width / 2 && carL < o.d + o.width / 2) {
        crash = crash || 'oncoming';
        crashWith = o;
      }
    }

    // Score
    if (enc && enc.tracker.state !== 'done' && this.state === 'playing') {
      const b = enc.daniel;
      const frame = this._frame(dt, input, crash);
      enc.tracker.step(frame);
      // Daniel rings his bell at a close pass, or at a horn.
      const latGap = carL - (b.d + b.width / 2);
      const alongside = Math.abs(p.s - b.s) < (p.length + b.length) / 2 + 1;
      if (alongside && latGap < requiredClearance(p.mph) - 0.25 && !enc.rang) {
        enc.rang = true;
        this.audio.bell();
      }
      if (input.horn && !enc.hornRang && p.s < b.s && b.s - p.s < 60) {
        enc.hornRang = true;
        setTimeout(() => this.audio.bell(), 500);
      }
      if (enc.tracker.state === 'done' && !crash) this._finishEncounter(enc);
    }

    if (crash === 'cyclist' && this.state === 'playing') this._bonk(enc);
    else if (crash && this.state === 'playing') this._startCrash(crash, crashWith);

    // End of the route
    if (this.state === 'playing' && p.s >= road.routeEnd) this._endRun();
  }

  _frame(dt, input, crash) {
    const p = this.player;
    const b = this.active.daniel;
    const road = this.road;
    return {
      t: this.t,
      dt,
      car: { s: p.s, d: p.d, v: p.v, latAccel: p.latAccel, longAccel: p.longAccel, length: p.length, width: p.width, throttle: p.throttle, brake: p.brake },
      bike: { s: b.s, d: b.d, v: b.v, length: b.length, width: b.width },
      indicator: this.input.indicator,
      horn: !!input.horn,
      limitMph: road.limitAt(p.s),
      hazard: road.hazardAt(p.s),
      hazardAhead: !!road.hazardWithin(p.s, 150),
      oncoming: this.traffic.near(p.s, 20, 700).map((o) => ({ id: o.id, s: o.s, v: o.v, length: o.length, alarmed: o.alarmed, type: o.type })),
      crash,
    };
  }

  _spawnEncounter(s) {
    const daniel = new Cyclist(s, this.wind);
    daniel.t = this.t; // gusts on the shared clock
    this.active = {
      index: this.encounterIndex,
      daniel,
      tracker: createOvertakeTracker(this.encounterIndex),
      spawnT: this.t,
    };
    this.lastDaniel = null;
    this.dan.group.visible = true;
    this.dan.group.rotation.set(0, 0, 0);
    const lines = ['Daniel ahead. Helmet cam rolling.', "He's back. Of course he's back.", 'Hi-vis on the horizon. Daniel again.', 'One more go. Make it count.'];
    this.hud.toast(lines[this.encounterIndex] || lines[0], 2.5);
  }

  _finishEncounter(enc) {
    const result = enc.tracker.result();
    const quip = quipFor(result, this.seed);
    this.run.addOvertake(result, quip, { s: this.player.s, t: this.t });
    this.hud.markEncounter(enc.index);
    this.encounterIndex++;
    this.lastDaniel = enc.daniel;
    this.active = null;
    this._showCard(result, quip, enc.index);
  }

  _showCard(result, quip, index) {
    this.state = 'card';
    this.audio.engine(0, 0, false);
    this.audio.horn(false);
    if (result.perfect) {
      if (!this.audio.playClip('tenOotaTen')) this.audio.ding(true);
    } else this.audio.ding(result.display >= 7);
    showCard(result, quip, {
      index,
      total: ROUTE_ENCOUNTERS,
      onContinue: () => {
        if (this.crash) this._recoverFromCrash();
        if (this.bonked) this._recoverFromBonk();
        this.state = 'playing';
        this.acc = 0;
        if (this.player.s >= this.road.routeEnd - 30) this._endRun();
      },
    });
  }

  // Touching Daniel freezes the game and he pops up to tell you off. No
  // knocking him over: he's a real person and this goes to his followers.
  _bonk(enc) {
    this.state = 'bonk';
    this.audio.engine(0, 0, false);
    this.audio.horn(false);
    this.audio.bonk();
    const result = enc.tracker.result();
    const quip = quipFor(result, this.seed);
    this.run.addOvertake(result, quip, { s: this.player.s, t: this.t });
    this.hud.markEncounter(enc.index);
    this.encounterIndex++;
    this.lastDaniel = enc.daniel;
    this.active = null;
    this.bonked = true;
    showBonk(quip, this.seed, enc.index, () => this._showCard(result, quip, enc.index));
  }

  _recoverFromBonk() {
    this.bonked = false;
    const p = this.player;
    const b = this.lastDaniel;
    // He drops back, dusts himself off and carries on behind you.
    if (b) {
      b.s = p.s - 30;
      b.d = OWN_LANE - 0.7;
    }
    p.d = OWN_LANE;
    p.vd = 0;
    p.steer = 0;
    p.v = clamp(p.v, 8, 15);
    this.input.reset();
    this.hud.toast("Daniel's back on the bike. Drive on.", 2.5);
  }

  _startCrash(kind, other) {
    this.state = 'crash';
    this.crash = { kind, other, t: 0, at: this.player.s };
    this.timeScale = 0.12;
    this.audio.crash();
    this.audio.horn(false);
    this.player.v *= 0.35;
    if (other) other.v *= 0.3;
  }

  _updateCrash(dt) {
    this.crash.t += dt;
    if (this.crash.t > 2.6 && !this.crash.carded) {
      this.crash.carded = true;
      this.timeScale = 0;
      const enc = this.active;
      if (enc) {
        // Finalise the tracker with the crash
        enc.tracker.step({ ...this._frame(0, {}, this.crash.kind) });
        const result = enc.tracker.result();
        const quip = quipFor(result, this.seed);
        this.run.addOvertake(result, quip, { s: this.player.s, t: this.t });
        this.hud.markEncounter(enc.index);
        this.encounterIndex++;
        this.active = null;
        this.dan.group.visible = false;
        this._showCard(result, quip, enc.index);
      } else {
        // Head-on with no Daniel about: no card, just a word from the verge.
        this.hud.toast('Head-on. Daniel heard that from Sandwick.', 3);
        this._recoverFromCrash();
        this.state = 'playing';
      }
    }
  }

  _recoverFromCrash() {
    const c = this.crash;
    if (c.other) this.traffic.remove(c.other.id);
    const p = this.player;
    p.d = OWN_LANE;
    p.vd = 0;
    p.v = 8;
    p.steer = 0;
    this.input.reset();
    this.crash = null;
    this.timeScale = 1;
    this.lastDaniel = null;
    this.dan.group.visible = false;
    // Clear oncoming right in front so we don't instantly crash again
    for (const o of [...this.traffic.vehicles]) if (Math.abs(o.s - p.s) < 40) this.traffic.remove(o.id);
  }

  _endRun() {
    if (this.state === 'ended') return;
    if (this.active) {
      const enc = this.active;
      if (enc.tracker.started && enc.tracker.state !== 'approach') {
        const result = enc.tracker.result();
        this.run.addOvertake(result, quipFor(result, this.seed), { s: this.player.s, t: this.t });
      } else this.run.addSkipped(enc.index, 'never passed', neverPassedQuip(this.seed, enc.index));
      this.active = null;
    }
    this.state = 'ended';
    this.audio.engine(0, 0, false);
    this.audio.horn(false);
    const data = this.run.finish(this.t);
    this.onEnd(data);
  }

  // ---------------------------------------------------------------------------
  _render(dt) {
    const road = this.road;
    const p = this.player;
    const f = road.frame(p.s, this.tmp);
    const pos = road.pos(p.s, p.d, {});
    const y = road.heightAt(p.s) + 0.06 - p.offRoad * 0.25;
    const g = this.car.group;
    g.position.set(pos.x, y, pos.z);
    g.rotation.order = 'YXZ';
    g.rotation.y = f.heading - Math.atan2(p.vd, Math.max(p.v, 1));
    g.rotation.x = -Math.atan(f.grade) - clamp(p.longAccel, -8, 4) * 0.006;
    g.rotation.z = clamp(-p.latAccel * 0.012, -0.06, 0.06);
    if (p.offRoad) g.position.y += Math.sin(this.t * 40) * 0.03 * p.offRoad;

    // Lamps
    const ind = this.input.indicator;
    this.car.indicators.left.emissiveIntensity = ind === 'left' && this.blinkOn ? 2.2 : 0;
    this.car.indicators.right.emissiveIntensity = ind === 'right' && this.blinkOn ? 2.2 : 0;
    this.car.brake.emissiveIntensity = p.brake > 0.05 ? 1.6 : 0.15;

    // Daniel
    const b = this.active ? this.active.daniel : this.lastDaniel;
    if (b && this.dan.group.visible) {
      const bp = road.pos(b.s, b.d, {});
      const bf = road.frame(b.s, {});
      const dg = this.dan.group;
      dg.position.set(bp.x, road.heightAt(b.s) + 0.06, bp.z);
      dg.rotation.order = 'YXZ';
      dg.rotation.y = bf.heading - Math.atan2(b.vd, Math.max(b.v, 1));
      dg.rotation.x = -Math.atan(bf.grade);
      this.dan.lean.rotation.z = b.lean;
      // Turn to look at the car when it's alongside
      const rel = p.s - b.s;
      const look = Math.abs(rel) < 9 && p.d > b.d ? -0.9 : 0;
      this.danLook = damp(this.danLook || 0, look, 4, dt);
      poseDaniel(this.dan, b.crank, this.danLook || 0);
      this.dan.rearLight.emissiveIntensity = Math.sin(this.t * 9) > 0 ? 1.8 : 0.1;
      if (!this.active && b.s < p.s - 250) this.dan.group.visible = false;
    }

    this._syncOncoming();
    this._updateCamera(dt, pos, y, f);
    this.world.sky.update(this.t, this.car.group.position, dt);
    animateSheep(this.world.sheep, this.t);

    if (this.state === 'playing') this.audio.engine(p.v, p.throttle, true);
    this._updateHud(dt);
  }

  _syncOncoming() {
    const p = this.player;
    const seen = new Set();
    for (const o of this.traffic.vehicles) {
      if (o.s < p.s - 80 || o.s > p.s + 1000) continue;
      seen.add(o.id);
      let m = this.oncomingMeshes.get(o.id);
      if (!m) {
        m = oncomingModel(o.type, new Rng(o.seed));
        this.oncomingMeshes.set(o.id, m);
        this.scene.add(m.group);
      }
      const pos = this.road.pos(o.s, o.d, {});
      const f = this.road.frame(o.s, {});
      m.group.position.set(pos.x, this.road.heightAt(o.s) + 0.06, pos.z);
      m.group.rotation.order = 'YXZ';
      m.group.rotation.y = f.heading + Math.PI;
      m.group.rotation.x = Math.atan(f.grade);
      m.head.emissiveIntensity = o.flash > 0 ? (Math.sin(o.flash * 20) > 0 ? 3 : 0.4) : 0.5;
      if (m.group.userData.beacon) m.group.userData.beacon.emissiveIntensity = Math.sin(this.t * 8) > 0.3 ? 2 : 0;
    }
    for (const [id, m] of this.oncomingMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(m.group);
        m.group.traverse((c) => c.isMesh && c.geometry.dispose());
        this.oncomingMeshes.delete(id);
      }
    }
  }

  _updateCamera(dt, pos, y, f) {
    if (this.debugCam) return;
    const cam = this.camera;
    const portrait = cam.aspect < 1;
    const p = this.player;
    const heading = this.car.group.rotation.y;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let wantPos;
    let wantLook;
    let fov;
    if (this.crash) {
      const a = this.crash.t * 0.6 + 0.6;
      wantPos = this.tmpV.set(pos.x + Math.sin(f.heading + a) * 9, y + 3.2, pos.z + Math.cos(f.heading + a) * 9);
      wantLook = new THREE.Vector3(pos.x, y + 0.8, pos.z);
      fov = 55;
    } else if (this.camMode === 'bonnet') {
      // Right-hand drive: driver sits right of centre
      const rx = -fz;
      const rz = fx;
      wantPos = this.tmpV.set(pos.x + fx * 0.2 + rx * -0.38, y + 1.22, pos.z + fz * 0.2 + rz * -0.38);
      const lf = this.road.frame(p.s + 30, {});
      const lp = this.road.pos(p.s + 30, p.d * 0.6 + OWN_LANE * 0.4, {});
      wantLook = new THREE.Vector3(lp.x, lf.y + 1.0, lp.z);
      fov = portrait ? 74 : 62;
    } else {
      const back = portrait ? 8.6 : 7.4;
      const up = portrait ? 3.7 : 2.9;
      // Look along the road a bit ahead so bends read early
      const af = this.road.frame(p.s + 14, {});
      const ap = this.road.pos(p.s + 14, p.d * 0.7, {});
      wantPos = this.tmpV.set(pos.x - fx * back, y + up, pos.z - fz * back);
      // keep the camera above the ground
      const gy = this.world.terrain.heightAt(wantPos.x, wantPos.z);
      if (wantPos.y < gy + 1.2) wantPos.y = gy + 1.2;
      wantLook = new THREE.Vector3(ap.x, af.y + 1.1, ap.z);
      fov = portrait ? 70 : 58;
    }
    if (this._snapCamera) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this._snapCamera = false;
    } else {
      const k = this.camMode === 'bonnet' ? 30 : 7;
      this.camPos.x = damp(this.camPos.x, wantPos.x, k, dt);
      this.camPos.y = damp(this.camPos.y, wantPos.y, k, dt);
      this.camPos.z = damp(this.camPos.z, wantPos.z, k, dt);
      this.camLook.x = damp(this.camLook.x, wantLook.x, k * 1.5, dt);
      this.camLook.y = damp(this.camLook.y, wantLook.y, k * 1.5, dt);
      this.camLook.z = damp(this.camLook.z, wantLook.z, k * 1.5, dt);
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = damp(cam.fov, fov, 4, dt);
      cam.updateProjectionMatrix();
    }
  }

  _updateHud(dt) {
    const p = this.player;
    const road = this.road;
    const enc = this.active;
    const s = {
      mph: p.mph,
      limit: road.limitAt(p.s),
      indicator: this.input.indicator,
      blinkOn: this.blinkOn,
      phase: '',
      hazard: '',
      headway: null,
      gust: false,
      clearance: null,
      progress: clamp((p.s - road.routeStart) / (road.routeEnd - road.routeStart), 0, 1),
      encounterText: `${Math.min(this.encounterIndex, ROUTE_ENCOUNTERS)} / ${ROUTE_ENCOUNTERS}`,
    };
    if (enc) {
      const b = enc.daniel;
      const ahead = b.s - b.length / 2 - (p.s + p.length / 2);
      const phase = enc.tracker.phase;
      s.phase = phase === 'approach' || phase === 'indicate out' ? `${phase} · <b>Daniel ${Math.max(0, Math.round(ahead))}m</b>` : phase;
      const hz = road.hazardWithin(p.s, 70);
      if (hz && (phase === 'approach' || phase === 'indicate out' || phase === 'pass')) s.hazard = `No overtaking: ${HAZARD_LABEL[hz]}`;
      if (ahead > 0 && ahead < 80 && p.d < OWN_LANE + 0.6) s.headway = ahead / Math.max(p.v, 0.5);
      s.gust = this.wind.active(b.t) && ahead < 150 && ahead > -40;
      const out = phase === 'pass' || phase === 'indicate in' || phase === 'move in';
      if (Math.abs(p.s - b.s) < (out ? 22 : 8)) {
        s.clearance = { gap: p.d - p.width / 2 - (b.d + b.width / 2), req: requiredClearance(p.mph) };
      }
    }
    this.hud.update(dt, s);
  }
}
