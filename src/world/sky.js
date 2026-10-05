// Shetland sky: mostly overcast, occasionally breaking to sun. Lights follow the player.
import * as THREE from 'three';
import { Rng } from '../util/rng.js';
import { lerp, smoothstep } from '../util/math.js';
import { part, merge, ico, lambert } from '../util/geo.js';

const OVERCAST = {
  zenith: new THREE.Color('#9fb0ba'),
  horizon: new THREE.Color('#dfe5e7'),
  fog: new THREE.Color('#d3dadd'),
  sun: 0.9,
  hemi: 1.55,
};
const SUNNY = {
  zenith: new THREE.Color('#5f9bd0'),
  horizon: new THREE.Color('#d9e8ef'),
  fog: new THREE.Color('#cfe0e8'),
  sun: 2.3,
  hemi: 1.15,
};

export class Sky {
  constructor(scene, seed, { shadows = true, shadowSize = 1024 } = {}) {
    this.scene = scene;
    this.rng = new Rng(`${seed}:sky`);
    // Weather schedule: sunny spells
    this.spells = [];
    let t = this.rng.range(10, 30);
    while (t < 1200) {
      const d = this.rng.range(12, 30);
      this.spells.push([t, t + d]);
      t += d + this.rng.range(25, 70);
    }

    const uniforms = {
      zenith: { value: OVERCAST.zenith.clone() },
      horizon: { value: OVERCAST.horizon.clone() },
    };
    this.uniforms = uniforms;
    const skyMat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, zenith, pow(h, 0.6)), 1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 16, 10), skyMat);
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    scene.fog = new THREE.Fog(OVERCAST.fog.clone(), 180, 1250);
    scene.background = OVERCAST.fog.clone();

    this.hemi = new THREE.HemisphereLight('#e8eef0', '#6f7f52', OVERCAST.hemi);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', OVERCAST.sun);
    this.sunDir = new THREE.Vector3(-0.45, 0.75, 0.48).normalize(); // low southern sun
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const c = this.sun.shadow.camera;
      c.left = -45;
      c.right = 45;
      c.top = 45;
      c.bottom = -45;
      c.near = 1;
      c.far = 300;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.clouds = this._clouds();
    scene.add(this.clouds);
    this.sunny = 0;
  }

  _clouds() {
    const g = merge([
      part(ico(30, 0), '#ffffff', { sx: 1.6, sy: 0.5, sz: 1.1 }),
      part(ico(22, 0), '#f4f6f7', { x: 28, y: 4, sx: 1.4, sy: 0.55, sz: 1.0 }),
      part(ico(20, 0), '#eef1f2', { x: -26, y: 2, sx: 1.3, sy: 0.5, sz: 1.0 }),
    ]);
    const mat = lambert({ fog: false, emissive: '#7d878c' });
    const n = 26;
    const im = new THREE.InstancedMesh(g, mat, n);
    this.cloudData = [];
    for (let i = 0; i < n; i++) {
      this.cloudData.push({
        x: this.rng.range(-1600, 1600),
        z: this.rng.range(-1600, 1600),
        y: this.rng.range(260, 420),
        s: this.rng.range(0.8, 2.2),
        r: this.rng.range(0, Math.PI),
      });
    }
    return im;
  }

  update(t, focus, dt) {
    let target = 0;
    for (const [a, b] of this.spells) {
      if (t > a - 6 && t < b + 6) target = Math.max(target, smoothstep(a - 6, a, t) * (1 - smoothstep(b, b + 6, t)));
    }
    this.sunny += (target - this.sunny) * Math.min(1, dt * 0.8);
    const k = this.sunny;
    this.uniforms.zenith.value.copy(OVERCAST.zenith).lerp(SUNNY.zenith, k);
    this.uniforms.horizon.value.copy(OVERCAST.horizon).lerp(SUNNY.horizon, k);
    this.scene.fog.color.copy(OVERCAST.fog).lerp(SUNNY.fog, k);
    this.scene.background.copy(this.scene.fog.color);
    this.sun.intensity = lerp(OVERCAST.sun, SUNNY.sun, k);
    this.hemi.intensity = lerp(OVERCAST.hemi, SUNNY.hemi, k);
    if (this.sun.castShadow) this.sun.shadow.intensity = lerp(0.45, 0.85, k);

    this.dome.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(focus);

    // Drift clouds with the wind (from the west), wrap around the player
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    this.cloudData.forEach((c, i) => {
      c.x += dt * 6;
      if (c.x - focus.x > 1600) c.x -= 3200;
      if (c.x - focus.x < -1600) c.x += 3200;
      if (c.z - focus.z > 1600) c.z -= 3200;
      if (c.z - focus.z < -1600) c.z += 3200;
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, c.r, 0);
      dummy.scale.setScalar(c.s * (1 - k * 0.35));
      dummy.updateMatrix();
      this.clouds.setMatrixAt(i, dummy.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
