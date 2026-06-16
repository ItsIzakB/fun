import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ARENA, BOSS, BOSS_NAME, PLAYER, WEAPONS } from "./config.js";

const UP = new THREE.Vector3(0, 1, 0);
const NON_BLOOM_MATERIAL = new THREE.MeshBasicMaterial({ color: "black" });
const BLOOM_LAYER = 1;
const ATTACK = {
  SLAM: "slam",
  PROJECTILE: "projectile",
  SPREAD: "spread",
  SWEEP: "sweep",
  DASH_SLAM: "dashSlam",
  TRIPLE_PROJECTILE: "tripleProjectile",
  BARRAGE: "barrage",
  CHAIN: "chain",
  LEAP: "leapSlam",
  STAFF: "staff",
  RAPID_FIRE: "rapidFire",
  DOME_BLAST: "domeBlast"
};

const PROJECTILE_TYPES = [
  { name: "ember", color: 0xff583d, emissive: 0xff2a00, shape: "sphere", size: 0.24, speed: 10.5, damage: 12 },
  { name: "violet shard", color: 0xb15cff, emissive: 0x6f25ff, shape: "octa", size: 0.28, speed: 12.5, damage: 13 },
  { name: "bone spike", color: 0xe8dfc8, emissive: 0x8a6d4a, shape: "cone", size: 0.3, speed: 13.5, damage: 14 },
  { name: "green curse", color: 0x65ff8a, emissive: 0x1bc85a, shape: "sphere", size: 0.22, speed: 11.2, damage: 11 },
  { name: "blue star", color: 0x66d9ff, emissive: 0x1b8cff, shape: "octa", size: 0.26, speed: 12.8, damage: 12 },
  { name: "blood nail", color: 0xd7193f, emissive: 0x88000f, shape: "cone", size: 0.26, speed: 14.8, damage: 15 },
  { name: "gold spark", color: 0xffd34d, emissive: 0xff9f1a, shape: "sphere", size: 0.18, speed: 15.5, damage: 9 },
  { name: "ashen cube", color: 0x9ca0a8, emissive: 0x343840, shape: "box", size: 0.26, speed: 10.2, damage: 13 },
  { name: "frost bead", color: 0xb8f4ff, emissive: 0x70d6ff, shape: "sphere", size: 0.25, speed: 9.5, damage: 12 },
  { name: "black sun", color: 0x241a2e, emissive: 0x8d2cff, shape: "sphere", size: 0.32, speed: 8.8, damage: 18 },
  { name: "seeker eye", color: 0xff4fd8, emissive: 0xff1faf, shape: "octa", size: 0.3, speed: 8.4, damage: 16, homing: true }
];

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
    uWhiteTint: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uWhiteTint;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec4 base = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + dir * uStrength).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * uStrength).b;
      vec3 tinted = mix(vec3(r, g, b), vec3(1.0), uWhiteTint);
      gl_FragColor = vec4(tinted, base.a);
    }
  `
};

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.3 },
    uColor: { value: new THREE.Color("#3a0000") }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.35, 0.82, d) * uIntensity;
      color.rgb = mix(color.rgb, uColor, vignette);
      gl_FragColor = color;
    }
  `
};

const BloomCompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    bloomTexture: { value: null }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv) + vec4(texture2D(bloomTexture, vUv).rgb, 0.0);
    }
  `
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function approachAngle(current, target, amount) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(delta, -amount, amount);
}

function makeBox(w, h, d, color, roughness = 0.88) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 })
  );
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function easeOut(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

class ProceduralAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.droneGain = null;
    this.droneOscillators = [];
    this.phaseRumble = null;
    this.phaseRumbleGain = null;
    this.heartbeatTimer = 0;
    this.heartbeatActive = false;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx.state === "running";
  }

  startDrone() {
    if (!this.ensure() || this.droneGain) return;
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.04;
    this.droneGain.connect(this.master);
    for (const freq of [55, 57]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(this.droneGain);
      osc.start();
      this.droneOscillators.push(osc);
    }
  }

  setPhaseTwo() {
    if (!this.ensure() || !this.droneGain) return;
    const now = this.ctx.currentTime;
    [80, 83].forEach((freq, index) => {
      this.droneOscillators[index]?.frequency.linearRampToValueAtTime(freq, now + 2);
    });
    this.droneGain.gain.linearRampToValueAtTime(0.08, now + 2);
    if (!this.phaseRumble) {
      this.phaseRumble = this.ctx.createOscillator();
      this.phaseRumble.type = "triangle";
      this.phaseRumble.frequency.value = 30;
      this.phaseRumbleGain = this.ctx.createGain();
      this.phaseRumbleGain.gain.value = 0.03;
      this.phaseRumble.connect(this.phaseRumbleGain);
      this.phaseRumbleGain.connect(this.master);
      this.phaseRumble.start();
    }
  }

  oscillatorHit(type, freq, duration, distortion = 0) {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.55), now + duration);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    let node = gain;
    if (distortion > 0) {
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / 128) - 1;
        curve[i] = Math.tanh(x * distortion);
      }
      shaper.curve = curve;
      node = shaper;
      gain.connect(shaper);
    }
    osc.connect(gain);
    node.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  }

  noise(duration = 0.2, frequency = 400, gainValue = 0.18) {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
  }

  lightHit() { this.oscillatorHit("sawtooth", 180, 0.15, 3); }
  heavyHit() { this.oscillatorHit("square", 90, 0.25, 7); }
  damage(low = false) { this.noise(0.2, low ? 240 : 400, 0.22); }
  pillarBreak() { this.oscillatorHit("triangle", 60, 0.8, 2); this.noise(0.5, 120, 0.16); }
  projectileSpawn() {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.3);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.34);
  }
  earthbreak() {
    if (!this.ensure()) return;
    this.kick(86, 24, 0.55, 0.42);
    this.noise(0.75, 95, 0.34);
    setTimeout(() => this.kick(58, 22, 0.36, 0.24), 90);
  }
  powerCharge(duration = 2.2) {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const rumble = this.ctx.createOscillator();
    const scream = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    const screamGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + duration);

    rumble.type = "sawtooth";
    rumble.frequency.setValueAtTime(34, now);
    rumble.frequency.exponentialRampToValueAtTime(88, now + duration);
    rumbleGain.gain.setValueAtTime(0.001, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.26, now + duration * 0.86);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.08);

    scream.type = "triangle";
    scream.frequency.setValueAtTime(210, now);
    scream.frequency.exponentialRampToValueAtTime(1180, now + duration);
    screamGain.gain.setValueAtTime(0.001, now);
    screamGain.gain.exponentialRampToValueAtTime(0.13, now + duration * 0.9);
    screamGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.06);

    rumble.connect(rumbleGain);
    rumbleGain.connect(this.master);
    scream.connect(filter);
    filter.connect(screamGain);
    screamGain.connect(this.master);
    rumble.start(now);
    scream.start(now);
    rumble.stop(now + duration + 0.12);
    scream.stop(now + duration + 0.12);
    this.noise(duration, 620, 0.08);
  }
  domeDetonate() {
    if (!this.ensure()) return;
    this.kick(120, 18, 0.82, 0.62);
    this.noise(1.05, 70, 0.5);
    this.noise(0.42, 1700, 0.22);
    setTimeout(() => this.kick(64, 20, 0.55, 0.36), 75);
    setTimeout(() => this.noise(0.7, 45, 0.28), 120);
  }
  leapExplosion() {
    if (!this.ensure()) return;
    this.kick(150, 16, 1.05, 0.72);
    this.noise(1.15, 58, 0.58);
    this.noise(0.36, 2600, 0.24);
    setTimeout(() => this.kick(82, 18, 0.7, 0.42), 85);
    setTimeout(() => this.noise(0.9, 110, 0.34), 160);
  }
  parry() {
    if (!this.ensure()) return;
    for (const freq of [880, 1200]) this.oscillatorHit("sine", freq, 0.1, 0);
  }
  victory() {
    if (!this.ensure()) return;
    const notes = [261.63, 329.63, 392, 523.25];
    notes.forEach((freq, index) => {
      setTimeout(() => this.oscillatorHit("sine", freq, 0.15, 0), index * 150);
    });
  }
  death() {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    this.master.gain.linearRampToValueAtTime(0.1, now + 0.5);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 55;
    gain.gain.setValueAtTime(0.4, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now + 0.5);
    osc.stop(now + 3.4);
  }
  updateHeartbeat(dt, hpRatio) {
    if (!this.ensure()) return;
    this.heartbeatActive = hpRatio < 0.25;
    if (!this.heartbeatActive) {
      this.heartbeatTimer = 0;
      return;
    }
    this.heartbeatTimer -= dt;
    if (this.heartbeatTimer <= 0) {
      this.kick(120, 40, 0.12, 0.16);
      setTimeout(() => this.kick(100, 35, 0.1, 0.08), 170);
      this.heartbeatTimer = 0.55 + hpRatio * 1.2;
    }
  }
  kick(start, end, duration, volume) {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}

export class DarkSoulsGame {
  constructor({
    stage,
    canvas,
    hpBar,
    staminaBar,
    bossHpBar,
    messageEl,
    endScreen,
    endTitle,
    endCopy,
    retryButton,
    homeLink,
    weaponScreen,
    weaponButtons
  }) {
    this.stage = stage;
    this.canvas = canvas;
    this.hpBar = hpBar;
    this.staminaBar = staminaBar;
    this.bossHpBar = bossHpBar;
    this.messageEl = messageEl;
    this.endScreen = endScreen;
    this.endTitle = endTitle;
    this.endCopy = endCopy;
    this.retryButton = retryButton;
    this.homeLink = homeLink;
    this.weaponScreen = weaponScreen;
    this.weaponButtons = [...weaponButtons];

    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.pointer = { dragging: false, moved: false, x: 0, y: 0 };
    this.cameraYaw = 0;
    this.cameraPitch = -0.26;
    this.lockOn = false;
    this.projectiles = [];
    this.particles = [];
    this.hitboxes = [];
    this.obstacles = [];
    this.pillars = [];
    this.pillarSegments = [];
    this.debris = [];
    this.rubbleColliders = [];
    this.darkMaterials = new Map();
    this.combo = [];
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.comboRecovery = 0;
    this.lastComboName = "";
    this.running = false;
    this.ended = false;
    this.weaponSelected = false;
    this.weapon = WEAPONS.arming;
    this.shake = 0;
    this.groundShake = 0;
    this.chromaticFlash = 0;
    this.parryTint = 0;
    this.audio = new ProceduralAudio();

    this.player = this.makePlayerState();
    this.boss = this.makeBossState();

    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleRetry = this.handleRetry.bind(this);
    this.handleInputCancel = this.handleInputCancel.bind(this);
    this.handleWeaponChoice = this.handleWeaponChoice.bind(this);
    this.loop = this.loop.bind(this);
  }

  start() {
    this.initThree();
    this.createScene();
    this.addListeners();
    this.resetFight();
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this.loop);
  }

  destroy() {
    this.running = false;
    this.renderer?.setAnimationLoop(null);
    this.removeListeners();
    this.renderer?.dispose();
    this.bloomComposer?.dispose();
    this.finalComposer?.dispose();
    this.scene?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7b95ad);
    this.scene.fog = new THREE.FogExp2(0x7b95ad, 0.012);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 90);
    this.bloomLayer = new THREE.Layers();
    this.bloomLayer.set(BLOOM_LAYER);
    this.handleResize();
    this.initPostProcessing();
  }

  initPostProcessing() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomComposer = new EffectComposer(this.renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(size, 1.2, 0.4, 0.3);
    this.bloomComposer.addPass(this.bloomPass);

    this.finalComposer = new EffectComposer(this.renderer);
    this.finalComposer.addPass(this.renderPass);
    this.bloomCompositePass = new ShaderPass(BloomCompositeShader);
    this.bloomCompositePass.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture;
    this.finalComposer.addPass(this.bloomCompositePass);
    this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
    this.finalComposer.addPass(this.chromaticPass);
    this.vignettePass = new ShaderPass(VignetteShader);
    this.finalComposer.addPass(this.vignettePass);
  }

  enableBloom(object) {
    object.layers.enable(BLOOM_LAYER);
  }

  darkenNonBloomed(object) {
    if (object.isMesh && !this.bloomLayer.test(object.layers)) {
      this.darkMaterials.set(object.uuid, object.material);
      object.material = NON_BLOOM_MATERIAL;
    }
  }

  restoreMaterial(object) {
    const material = this.darkMaterials.get(object.uuid);
    if (material) {
      object.material = material;
      this.darkMaterials.delete(object.uuid);
    }
  }

  updatePostProcessing(dt) {
    this.chromaticFlash = Math.max(0, this.chromaticFlash - dt);
    this.parryTint = Math.max(0, this.parryTint - dt);
    const damageChroma = this.chromaticFlash > 0 ? 0.015 * (this.chromaticFlash / 0.6) : 0;
    const parryChroma = this.parryTint > 0 ? 0.008 * (this.parryTint / 0.2) : 0;
    this.chromaticPass.uniforms.uStrength.value = Math.max(damageChroma, parryChroma);
    this.chromaticPass.uniforms.uWhiteTint.value = this.parryTint > 0 ? 0.28 * (this.parryTint / 0.2) : 0;
    const hpRatio = this.player.hp / PLAYER.maxHp;
    this.vignettePass.uniforms.uIntensity.value = 0.3 + (1 - hpRatio) * 0.55;
  }

  renderPostProcessed(dt) {
    this.scene.traverse((object) => this.darkenNonBloomed(object));
    this.bloomComposer.render(dt);
    this.scene.traverse((object) => this.restoreMaterial(object));
    this.finalComposer.render(dt);
  }

  createScene() {
    const ambient = new THREE.AmbientLight(0xacbaa3, 0.82);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xc3d2e7, 0x3a5131, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffd89a, 1.32);
    sun.position.set(-18, 24, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.halfSize * 2, ARENA.halfSize * 2, 22, 22),
      new THREE.MeshStandardMaterial({ color: 0x52723d, roughness: 0.96 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(ARENA.halfSize * 2, 36, 0x6f8b57, 0x486738);
    grid.position.y = 0.012;
    this.scene.add(grid);

    this.makeOpenWorld();
    this.player.group = this.createPlayerMesh();
    this.scene.add(this.player.group);
    this.boss.group = this.createBossMesh();
    this.scene.add(this.boss.group);
  }

  makeOpenWorld() {
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4b55, roughness: 0.9 });
    const ruins = [
      [-14, -10],
      [13, -12],
      [-16, 13],
      [16, 10],
      [0, -22],
      [-26, 2],
      [28, 4],
      [6, 25]
    ];

    for (const [x, z] of ruins) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 1.05, 2.2 + Math.random() * 2.4, 7),
        new THREE.MeshStandardMaterial({ color: 0x555763, roughness: 0.88 })
      );
      pillar.position.set(x, pillar.geometry.parameters.height / 2, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);
      this.obstacles.push({ x, z, radius: 1.1 });
    }

    for (let i = 0; i < 38; i += 1) {
      const rubble = makeBox(0.6 + Math.random() * 1.3, 0.25 + Math.random() * 0.55, 0.6 + Math.random() * 1.3, 0x5b5960);
      rubble.position.set((Math.random() - 0.5) * 105, rubble.geometry.parameters.height / 2, (Math.random() - 0.5) * 105);
      rubble.rotation.y = Math.random() * Math.PI;
      rubble.castShadow = true;
      rubble.receiveShadow = true;
      this.scene.add(rubble);
    }

    this.makeDestructiblePillars();
    this.makeTrees();
    this.makeGrassTufts();
    this.makeTorches();
  }

  makeTorches() {
    const torchPositions = [
      [-18, -18],
      [18, -18],
      [-18, 18],
      [18, 18],
      [0, 21]
    ];

    for (const [x, z] of torchPositions) {
      const post = makeBox(0.18, 1.4, 0.18, 0x4a2b18);
      post.position.set(x, 0.7, z);
      this.scene.add(post);

      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffa640,
          emissive: 0xff7b16,
          emissiveIntensity: 1.8,
          roughness: 0.35
        })
      );
      flame.position.set(x, 1.55, z);
      this.enableBloom(flame);
      this.scene.add(flame);

      const light = new THREE.PointLight(0xffb15a, 3.4, 18, 1.7);
      light.position.set(x, 2.1, z);
      light.castShadow = true;
      this.scene.add(light);
    }
  }

  makeDestructiblePillars() {
    const positions = [
      [-18, -14],
      [-28, 0],
      [-18, 14],
      [18, -14],
      [28, 0],
      [18, 14]
    ];
    const material = new THREE.MeshStandardMaterial({
      color: 0x32333a,
      roughness: 0.9,
      metalness: 0.05
    });
    for (const [x, z] of positions) {
      const pillar = { segments: [], position: new THREE.Vector3(x, 0, z) };
      for (let i = 0; i < 3; i += 1) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 1.45, 10), material.clone());
        mesh.position.set(x, 0.72 + i * 1.45, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        const segment = {
          mesh,
          box: new THREE.Box3().setFromObject(mesh),
          destroyed: false,
          pillar
        };
        pillar.segments.push(segment);
        this.pillarSegments.push(segment);
        this.obstacles.push({ x, z, radius: 1.05, box: segment.box, segment });
      }
      this.pillars.push(pillar);
    }
  }

  makeTrees() {
    const treePositions = [
      [-36, -24],
      [-44, 18],
      [38, -28],
      [46, 22],
      [-22, 42],
      [26, 43],
      [-55, -4],
      [58, 2]
    ];

    for (const [x, z] of treePositions) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.52, 3.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b4327, roughness: 0.9 })
      );
      trunk.position.set(x, 1.9, z);
      trunk.castShadow = true;
      this.scene.add(trunk);

      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x2f6f35, roughness: 0.95 })
      );
      crown.position.set(x, 4.25, z);
      crown.scale.set(1.15, 0.82, 1.05);
      crown.castShadow = true;
      this.scene.add(crown);
      this.obstacles.push({ x, z, radius: 0.75 });
    }
  }

  makeGrassTufts() {
    const material = new THREE.MeshStandardMaterial({ color: 0x7ead4f, roughness: 1 });
    for (let i = 0; i < 90; i += 1) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 5), material);
      tuft.position.set((Math.random() - 0.5) * 124, 0.35, (Math.random() - 0.5) * 124);
      tuft.rotation.y = Math.random() * Math.PI;
      tuft.castShadow = true;
      this.scene.add(tuft);
    }
  }

  createPlayerMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 0.72, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x4d5968, roughness: 0.82, metalness: 0.04 })
    );
    body.position.y = 0.92;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xc7b193, roughness: 0.75 })
    );
    head.position.y = 1.65;
    const rightShoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x37404d, roughness: 0.82 })
    );
    rightShoulder.position.set(0.42, 1.18, -0.05);
    const leftShoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x37404d, roughness: 0.82 })
    );
    leftShoulder.position.set(-0.38, 1.14, -0.04);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x242b36, roughness: 0.88 });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.62, 6, 10), legMaterial);
    leftLeg.name = "leftLeg";
    leftLeg.position.set(-0.18, 0.28, 0);
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.62, 6, 10), legMaterial);
    rightLeg.name = "rightLeg";
    rightLeg.position.set(0.18, 0.28, 0);
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 6, 10), legMaterial);
    leftArm.name = "leftArm";
    leftArm.position.set(-0.28, 1.02, -0.18);
    leftArm.rotation.set(-0.86, 0.12, -0.62);
    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 6, 10), legMaterial);
    rightArm.name = "rightArm";
    rightArm.position.set(0.38, 1.04, -0.12);
    rightArm.rotation.set(-0.72, -0.04, 0.48);
    const swordPivot = new THREE.Group();
    swordPivot.name = "swordPivot";
    swordPivot.position.set(0.38, 1.08, -0.12);
    swordPivot.rotation.set(-0.18, 0.18, 0.58);
    const blade = makeBox(0.12, 0.12, 1.25, 0xbfc5ce, 0.42);
    blade.position.set(0, 0, -0.68);
    blade.name = "blade";
    blade.userData.baseColor = 0xbfc5ce;
    blade.userData.baseEmissive = 0x000000;
    const hilt = makeBox(0.36, 0.1, 0.1, 0x6d4931, 0.65);
    hilt.name = "hilt";
    hilt.position.set(0, 0, -0.08);
    swordPivot.add(hilt, blade);
    group.add(body, head, rightShoulder, leftShoulder, leftLeg, rightLeg, leftArm, rightArm, swordPivot);
    group.traverse((object) => {
      object.castShadow = true;
    });
    return group;
  }

  applyWeaponVisuals() {
    const blade = this.player.group?.getObjectByName("blade");
    const hilt = this.player.group?.getObjectByName("hilt");
    if (!blade) return;
    blade.scale.set(1, 1, this.weapon.bladeScale);
    blade.position.z = -0.08 - 0.6 * this.weapon.bladeScale;
    if (hilt) hilt.scale.x = this.weapon.bladeScale > 0.9 ? 1.35 : 1;
    this.updatePlayerArmGrip(0);
  }

  createBossMesh() {
    const group = new THREE.Group();
    const robe = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.72, 1.85, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x171319, roughness: 0.82, metalness: 0.03 })
    );
    robe.scale.set(1.05, 1, 0.82);
    robe.position.y = 1.35;
    const shoulders = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 1.65, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x2c1f24, roughness: 0.84 })
    );
    shoulders.rotation.z = Math.PI / 2;
    shoulders.scale.z = 0.75;
    shoulders.position.y = 2.45;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 20, 14),
      new THREE.MeshStandardMaterial({
        color: 0x8b3d2e,
        emissive: 0x3b0d08,
        emissiveIntensity: 0.35,
        roughness: 0.8
      })
    );
    head.position.y = 3.05;
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x21171d, roughness: 0.84 });
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.95, 6, 10), armMaterial);
    leftArm.name = "bossLeftArm";
    leftArm.position.set(-0.82, 1.95, 0.03);
    leftArm.rotation.z = 0.24;
    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.1, 6, 10), armMaterial);
    rightArm.name = "bossRightArm";
    rightArm.position.set(0.82, 1.95, 0.02);
    rightArm.rotation.z = -0.18;
    const staff = makeBox(0.16, 3.4, 0.16, 0x403132);
    staff.name = "bossStaff";
    staff.position.set(1.25, 1.75, 0.1);
    staff.rotation.z = -0.08;
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x100d11, roughness: 0.86 });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.88, 6, 10), legMaterial);
    leftLeg.name = "bossLeftLeg";
    leftLeg.position.set(-0.38, 0.45, 0.12);
    leftLeg.rotation.x = 0.22;
    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.88, 6, 10), legMaterial);
    rightLeg.name = "bossRightLeg";
    rightLeg.position.set(0.38, 0.39, -0.16);
    rightLeg.rotation.x = -0.56;
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 10),
      new THREE.MeshStandardMaterial({
        color: 0xff5b3a,
        emissive: 0xff2600,
        emissiveIntensity: 1.6
      })
    );
    ember.position.set(1.25, 3.58, 0.1);
    this.enableBloom(ember);
    this.enableBloom(head);
    group.add(leftLeg, rightLeg, robe, shoulders, head, leftArm, rightArm, staff, ember);
    group.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    robe.userData.baseColor = 0x171319;
    shoulders.userData.baseColor = 0x2c1f24;
    head.userData.baseColor = 0x8b3d2e;
    group.userData.flashParts = [robe, shoulders, head];
    return group;
  }

  makePlayerState() {
    return {
      group: null,
      position: new THREE.Vector3(0, 0, 14),
      velocity: new THREE.Vector3(),
      knockback: new THREE.Vector3(),
      verticalVelocity: 0,
      airHeight: 0,
      grounded: true,
      facing: 0,
      hp: PLAYER.maxHp,
      stamina: PLAYER.maxStamina,
      rolling: 0,
      rollLean: 0,
      invincible: 0,
      attacking: 0,
      attackDuration: 0,
      attackType: "light",
      attackVariant: 0,
      combo: 0,
      attackCooldown: 0,
      charging: 0,
      blockHeld: false,
      blockTime: 99,
      hitDone: false,
      heavyQueued: false,
      damageFlash: 0,
      inputDir: new THREE.Vector3(0, 0, -1)
    };
  }

  makeBossState() {
    return {
      group: null,
      position: new THREE.Vector3(0, 0, -10),
      knockback: new THREE.Vector3(),
      hp: BOSS.maxHp,
      phase: 1,
      state: "idle",
      stateTime: 1.2,
      cooldown: 1,
      attackHit: false,
      tripleShots: 0,
      rapidShots: 0,
      rapidTimer: 0,
      dashDirection: new THREE.Vector3(),
      leapHeight: 0,
      leapFollowup: null,
      stagger: 0,
      flash: 0
    };
  }

  addListeners() {
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleInputCancel);
    document.addEventListener("visibilitychange", this.handleInputCancel);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.retryButton.addEventListener("click", this.handleRetry);
    this.weaponButtons.forEach((button) => button.addEventListener("click", this.handleWeaponChoice));
  }

  removeListeners() {
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleInputCancel);
    document.removeEventListener("visibilitychange", this.handleInputCancel);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.retryButton.removeEventListener("click", this.handleRetry);
    this.weaponButtons.forEach((button) => button.removeEventListener("click", this.handleWeaponChoice));
  }

  handleResize() {
    const rect = this.stage.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(420, rect.height);
    this.renderer?.setSize(width, height, false);
    this.bloomComposer?.setSize(width, height);
    this.finalComposer?.setSize(width, height);
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  handleKeyDown(event) {
    this.audio.ensure();
    const key = event.key.toLowerCase();
    if (key === "tab" && !event.repeat) {
      event.preventDefault();
      this.lockOn = !this.lockOn;
      this.setMessage(this.lockOn ? "Locked onto the Warlock." : "Lock released.");
      return;
    }
    if (key === " " && !event.repeat) {
      event.preventDefault();
      this.tryJump();
      return;
    }
    if ((key === "q" || key === "e") && !event.repeat) {
      event.preventDefault();
      this.tryDodge(key === "q" ? 1 : -1);
      return;
    }
    if (["w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      this.keys.add(key);
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.key.toLowerCase());
  }

  handleInputCancel() {
    this.keys.clear();
    this.pointer.dragging = false;
    this.pointer.moved = false;
    this.player.blockHeld = false;
    this.player.charging = 0;
  }

  handlePointerDown(event) {
    this.audio.ensure();
    this.canvas.focus();
    event.preventDefault();
    if (event.button === 2) {
      this.player.blockHeld = true;
      this.player.blockTime = 0;
      return;
    }
    if (event.button === 0) {
      this.pointer.dragging = true;
      this.pointer.moved = false;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.player.charging = 0.01;
      this.player.heavyQueued = false;
    }
  }

  handlePointerMove(event) {
    if (!this.pointer.dragging) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      this.pointer.moved = true;
      this.cameraYaw -= dx * 0.006;
      this.cameraPitch = clamp(this.cameraPitch - dy * 0.003, -0.72, 0.18);
    }
  }

  handlePointerUp(event) {
    if (event.button === 2) {
      this.player.blockHeld = false;
      return;
    }
    if (event.button === 0) {
      this.pointer.dragging = false;
      if (this.pointer.moved) {
        this.player.charging = 0;
        return;
      }
      if (this.player.charging > 0.42) {
        this.startAttack("heavy");
      } else {
        this.startAttack("light");
      }
      this.player.charging = 0;
    }
  }

  handleContextMenu(event) {
    event.preventDefault();
  }

  handleRetry() {
    this.resetFight();
  }

  handleWeaponChoice(event) {
    this.audio.ensure();
    this.audio.startDrone();
    const id = event.currentTarget.dataset.weapon;
    this.weapon = WEAPONS[id] || WEAPONS.arming;
    this.weaponSelected = true;
    this.weaponScreen.hidden = true;
    this.applyWeaponVisuals();
    this.resetFight();
    this.setMessage(`${this.weapon.label} chosen.`);
  }

  resetFight() {
    this.player = { ...this.makePlayerState(), group: this.player.group };
    this.boss = { ...this.makeBossState(), group: this.boss.group };
    this.lockOn = false;
    if (!this.weaponSelected) {
      this.weaponScreen.hidden = false;
    }
    this.player.group.position.copy(this.player.position);
    this.boss.group.position.copy(this.boss.position);
    this.projectiles.forEach((projectile) => {
      this.scene.remove(projectile.mesh);
      if (projectile.marker) this.scene.remove(projectile.marker);
    });
    this.projectiles = [];
    this.hitboxes = [];
    this.particles.forEach((particle) => this.scene.remove(particle.mesh));
    this.particles = [];
    this.ended = false;
    this.endScreen.hidden = true;
    this.homeLink.hidden = true;
    this.retryButton.hidden = false;
    this.setMessage("The Warlock watches. Do not rush.");
    this.updateCamera(0, true);
    this.updateHud();
  }

  loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.033);
    const elapsed = this.clock.elapsedTime;
    if (!this.ended && this.weaponSelected) {
      this.updatePlayer(dt, elapsed);
      this.updateBoss(dt, elapsed);
      this.updateProjectiles(dt);
      this.updateHitboxes(dt);
      this.updateParticles(dt);
      this.updateDebris(dt);
    }
    this.audio.updateHeartbeat(dt, this.player.hp / PLAYER.maxHp);
    this.updatePostProcessing(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.renderPostProcessed(dt);
  }

  updatePlayer(dt, elapsed) {
    const move = this.getMoveVector();
    if (move.lengthSq() > 0) {
      this.player.inputDir.copy(move);
    }

    const chargeSlow = this.player.charging > 0 ? 0.38 : 1;
    if (this.player.rolling > 0) {
      this.player.rolling -= dt;
      this.player.invincible = Math.max(this.player.invincible, this.player.rolling);
      this.movePlayer(this.player.inputDir, PLAYER.dodgeSpeed * dt);
    } else {
      this.movePlayer(move, PLAYER.speed * chargeSlow * dt);
    }
    if (this.player.rolling <= 0) {
      this.player.rollLean = 0;
    }

    this.updateJump(dt);

    if (this.player.knockback.lengthSq() > 0.0001) {
      this.movePlayer(this.player.knockback.clone().multiplyScalar(dt), 1);
      this.player.knockback.multiplyScalar(Math.max(0, 1 - dt * 4.8));
    }

    if (this.player.blockHeld && this.player.stamina > 0) {
      this.player.stamina = Math.max(0, this.player.stamina - PLAYER.blockCostPerSecond * dt);
      this.player.blockTime += dt;
      if (this.player.stamina <= 0) this.player.blockHeld = false;
    } else if (this.player.attackCooldown <= 0 && this.player.rolling <= 0) {
      this.player.stamina = Math.min(PLAYER.maxStamina, this.player.stamina + PLAYER.staminaRegen * dt);
      this.player.blockTime += dt;
    }

    if (this.player.charging > 0) {
      this.player.charging += dt;
      this.player.group.scale.setScalar(1 + Math.sin(this.player.charging * 18) * 0.035);
    } else {
      this.player.group.scale.setScalar(1);
    }

    this.player.invincible = Math.max(0, this.player.invincible - dt);
    this.player.damageFlash = Math.max(0, this.player.damageFlash - dt);
    this.player.attacking = Math.max(0, this.player.attacking - dt);
    this.player.attackCooldown = Math.max(0, this.player.attackCooldown - dt);
    this.player.group.position.copy(this.player.position);
    this.player.group.position.y = this.player.airHeight + Math.sin(elapsed * 4.2) * 0.035;
    if (this.lockOn) {
      const toBoss = this.boss.position.clone().sub(this.player.position);
      this.player.facing = Math.atan2(toBoss.x, toBoss.z);
    }
    this.player.group.rotation.y = this.player.facing + Math.PI;
    this.player.group.rotation.z = this.player.rolling > 0 ? this.player.rollLean * Math.sin((this.player.rolling / PLAYER.dodgeTime) * Math.PI) * 1.05 : 0;
    this.updateSwordAnimation();
    this.updateLegAnimation(move, elapsed);
    this.updatePlayerDamageOutline();
  }

  getMoveVector() {
    const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    if (this.keys.has("w")) move.add(forward);
    if (this.keys.has("s")) move.sub(forward);
    if (this.keys.has("d")) move.add(right);
    if (this.keys.has("a")) move.sub(right);
    if (move.lengthSq() > 0) move.normalize();
    return move;
  }

  movePlayer(direction, distance) {
    if (direction.lengthSq() <= 0 || distance <= 0) return;
    const next = this.player.position.clone().addScaledVector(direction, distance);
    next.x = clamp(next.x, -ARENA.halfSize + 1, ARENA.halfSize - 1);
    next.z = clamp(next.z, -ARENA.halfSize + 1, ARENA.halfSize - 1);
    for (const obstacle of this.obstacles) {
      if (obstacle.box) {
        const playerBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(next.x, 0.9, next.z),
          new THREE.Vector3(PLAYER.radius * 1.6, 1.8, PLAYER.radius * 1.6)
        );
        if (playerBox.intersectsBox(obstacle.box)) {
          next.copy(this.player.position);
          break;
        }
        continue;
      }
      const dx = next.x - obstacle.x;
      const dz = next.z - obstacle.z;
      const dist = Math.hypot(dx, dz);
      const min = obstacle.radius + PLAYER.radius;
      if (dist < min) {
        const push = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(min - dist);
        next.add(push);
      }
    }
    this.player.position.copy(next);
    if (!this.lockOn) {
      this.player.facing = Math.atan2(direction.x, direction.z);
    }
  }

  tryJump() {
    if (this.ended || !this.player.grounded || this.player.rolling > 0) return;
    this.player.verticalVelocity = 7.6;
    this.player.grounded = false;
    this.setMessage("Jump.");
  }

  updateJump(dt) {
    if (this.player.grounded) return;
    this.player.verticalVelocity -= 20 * dt;
    this.player.airHeight += this.player.verticalVelocity * dt;
    if (this.player.airHeight <= 0) {
      this.player.airHeight = 0;
      this.player.verticalVelocity = 0;
      this.player.grounded = true;
      if (this.player.rolling > 0) {
        this.shake = Math.max(this.shake, 0.16);
      }
    }
  }

  tryDodge(side = 0) {
    if (this.ended || this.player.rolling > 0 || this.player.stamina < PLAYER.dodgeCost) return;
    this.player.stamina -= PLAYER.dodgeCost;
    this.player.rolling = PLAYER.dodgeTime;
    this.player.invincible = PLAYER.invincibleTime;
    const forward = this.getMoveVector();
    const faceForward = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    const right = new THREE.Vector3(faceForward.z, 0, -faceForward.x).normalize();
    const rollDirection = side === 0 && forward.lengthSq() > 0 ? forward : right.multiplyScalar(side || 1);
    this.player.inputDir.copy(rollDirection.normalize());
    this.player.rollLean = side || 1;
    this.player.airHeight = Math.max(this.player.airHeight, 0.1);
    this.player.verticalVelocity = -2.8;
    this.player.grounded = false;
    this.setMessage(side < 0 ? "Roll left." : "Roll right.");
  }

  startAttack(type) {
    if (this.ended || this.player.rolling > 0 || this.player.attackCooldown > 0) return;
    const cost = type === "heavy" ? this.weapon.heavyCost : this.weapon.lightCost;
    if (this.player.stamina < cost) {
      this.setMessage("No stamina.");
      return;
    }
    this.player.stamina -= cost;
    this.player.attackCooldown = type === "heavy" ? this.weapon.heavyCooldown : this.weapon.lightCooldown;
    this.player.attacking = type === "heavy" ? this.weapon.heavyDuration : this.weapon.lightDuration;
    this.player.attackDuration = this.player.attacking;
    this.player.attackType = type;
    if (type === "light") {
      this.player.combo = (this.player.combo + 1) % 3;
      this.player.attackVariant = this.player.combo;
    } else {
      this.player.attackVariant = 0;
    }
    this.player.hitDone = false;
    this.hitboxes.push({
      type,
      time: type === "heavy" ? this.weapon.heavyDuration * 0.52 : this.weapon.lightDuration * 0.52,
      delay: type === "heavy" ? this.weapon.heavyDelay : this.weapon.lightDelay,
      damage: type === "heavy" ? this.weapon.heavyDamage : this.weapon.lightDamage
    });
    this.setMessage(type === "heavy" ? "Heavy swing committed." : "Quick cut.");
  }

  updateSwordAnimation() {
    const sword = this.player.group.getObjectByName("swordPivot");
    if (!sword) return;

    const idle = {
      x: -0.18,
      y: 0.18,
      z: 0.58
    };

    if (this.player.attacking <= 0 || this.player.attackDuration <= 0) {
      sword.rotation.set(idle.x, idle.y, idle.z);
      sword.position.set(0.38, 1.08, -0.12);
      this.updatePlayerArmGrip(0);
      this.updateSwordGlow();
      return;
    }

    const progress = 1 - this.player.attacking / this.player.attackDuration;
    const snap = this.attackSnap(progress);
    const swing = Math.sin(snap * Math.PI);
    if (this.player.attackType === "heavy") {
      sword.rotation.set(-1.35 + snap * 2.55, 0.04, 0.2 - swing * 0.85);
      sword.position.set(0.38, 1.18 - swing * 0.12, -0.24 - swing * 0.3);
    } else if (this.player.attackVariant === 1) {
      sword.rotation.set(-0.18 - swing * 0.55, -1.0 + snap * 2.35, 0.42 + swing * 0.7);
      sword.position.set(0.36 - swing * 0.1, 1.1 + swing * 0.06, -0.08 - swing * 0.34);
    } else if (this.player.attackVariant === 2) {
      sword.rotation.set(-0.82 + swing * 0.55, 0.28 - snap * 0.75, 1.0 - swing * 1.35);
      sword.position.set(0.38, 1.2 - swing * 0.24, -0.18 - swing * 0.26);
    } else {
      sword.rotation.set(-0.24, 1.05 - snap * 2.35, 0.55 - swing * 0.78);
      sword.position.set(0.38 + swing * 0.12, 1.08, -0.12 - swing * 0.32);
    }
    this.updatePlayerArmGrip(swing, snap);
    this.updateSwordGlow();
  }

  updatePlayerArmGrip(swing = 0, snap = 0) {
    const leftArm = this.player.group.getObjectByName("leftArm");
    const rightArm = this.player.group.getObjectByName("rightArm");
    if (!leftArm || !rightArm) return;

    const twoHanded = this.weapon.bladeScale > 0.9 ? 1 : 0.55;
    leftArm.position.set(-0.18 + swing * 0.06, 1.02 + swing * 0.05, -0.22 - swing * 0.12);
    leftArm.rotation.set(-0.92 - swing * 0.38, 0.18 - snap * 0.25, -0.72 + swing * 0.28);
    rightArm.position.set(0.34 + swing * 0.04, 1.04 + swing * 0.03, -0.15 - swing * 0.1);
    rightArm.rotation.set(-0.78 - swing * 0.28, -0.06 + snap * 0.18, 0.52 - swing * 0.22);

    if (twoHanded < 1) {
      leftArm.position.x -= 0.08;
      leftArm.rotation.z -= 0.22;
    }
  }

  attackSnap(progress) {
    if (progress < 0.34) {
      return progress * 0.26;
    }
    if (progress < 0.58) {
      const burst = (progress - 0.34) / 0.24;
      return 0.09 + Math.pow(burst, 0.34) * 0.78;
    }
    const recover = (progress - 0.58) / 0.42;
    return 0.87 + recover * 0.13;
  }

  updateSwordGlow() {
    const blade = this.player.group.getObjectByName("blade");
    if (!blade?.material) return;

    if (this.player.charging > 0) {
      const pulse = 0.9 + Math.sin(this.player.charging * 18) * 0.35;
      blade.material.color.set(0xffe66d);
      blade.material.emissive.set(0xffcc22);
      blade.material.emissiveIntensity = pulse;
      for (const object of this.player.group.children) {
        if (object.material?.emissive && object.name !== "blade" && this.player.damageFlash <= 0) {
          object.material.emissive.set(0x7a5b00);
          object.material.emissiveIntensity = 0.25;
        }
      }
    } else {
      blade.material.color.set(blade.userData.baseColor);
      blade.material.emissive.set(blade.userData.baseEmissive);
      blade.material.emissiveIntensity = 0;
      if (this.player.damageFlash <= 0) {
        for (const object of this.player.group.children) {
          if (object.material?.emissive && object.name !== "blade") {
            object.material.emissive.set(0x000000);
            object.material.emissiveIntensity = 0;
          }
        }
      }
    }
  }

  updateHitboxes(dt) {
    for (const hitbox of this.hitboxes) {
      hitbox.delay -= dt;
      if (hitbox.delay <= 0 && !hitbox.done) {
        const reach = hitbox.type === "heavy" ? this.weapon.heavyReach : this.weapon.reach;
        if (this.swordCanHitBoss(reach, hitbox.type === "heavy" ? 0.72 : 0.55)) {
          this.damageBoss(hitbox.damage, hitbox.type);
          hitbox.done = true;
        }
        if (hitbox.type === "heavy") {
          this.breakPillarsInBox(this.getSwordBox(0.6));
        }
      }
      hitbox.time -= dt;
    }
    this.hitboxes = this.hitboxes.filter((hitbox) => hitbox.time > 0);
  }

  damageBoss(amount, type) {
    if (this.boss.stagger > 0) amount *= 1.15;
    this.boss.hp = Math.max(0, this.boss.hp - amount);
    this.boss.flash = 0.16;
    if (type === "heavy") this.audio.heavyHit();
    else this.audio.lightHit();
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0)), type === "heavy" ? 16 : 9, 0xff5b3a);
    const away = this.boss.position.clone().sub(this.player.position).setY(0);
    if (away.lengthSq() > 0.001) {
      away.normalize();
      const force = type === "heavy" ? 8.5 : type === "deflect" ? 10 : 4.8;
      this.boss.knockback.addScaledVector(away, force);
    }
    this.shake = Math.max(this.shake, type === "heavy" || type === "deflect" ? 0.42 : 0.22);
    if (this.boss.hp <= 0) {
      this.endFight("victory");
    } else if (this.boss.phase === 1 && this.boss.hp <= BOSS.maxHp * BOSS.phaseTwoThreshold) {
      this.boss.phase = 2;
      this.boss.flash = 1.1;
      this.boss.cooldown = 0.35;
      this.audio.setPhaseTwo();
      this.setMessage("The Warlock's embers flare hotter.");
    }
  }

  updateBoss(dt, elapsed) {
    const toPlayer = this.player.position.clone().sub(this.boss.position);
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    this.boss.group.rotation.y = approachAngle(this.boss.group.rotation.y, targetYaw, dt * 1.8);
    this.boss.group.position.copy(this.boss.position);
    this.boss.group.position.y = this.boss.leapHeight + Math.sin(elapsed * 2.2) * 0.08;
    this.updateBossLimbAnimation(dt, elapsed, toPlayer.length());

    this.updateBossFlash(dt);
    if (this.boss.stagger > 0) {
      this.boss.stagger -= dt;
      return;
    }

    if (this.boss.knockback.lengthSq() > 0.0001) {
      this.boss.position.addScaledVector(this.boss.knockback, dt);
      this.boss.position.x = clamp(this.boss.position.x, -ARENA.halfSize + 2, ARENA.halfSize - 2);
      this.boss.position.z = clamp(this.boss.position.z, -ARENA.halfSize + 2, ARENA.halfSize - 2);
      this.boss.knockback.multiplyScalar(Math.max(0, 1 - dt * 5.2));
    }

    if (this.boss.state !== "idle") {
      this.updateBossAttack(dt);
      return;
    }

    const dist = Math.max(0.001, toPlayer.length());
    if (dist > 5.2) {
      const speed = this.boss.phase === 2 ? 2.65 : 1.8;
      this.boss.position.addScaledVector(toPlayer.normalize(), speed * dt);
    }

    if (this.comboRecovery > 0) {
      this.comboRecovery -= dt;
      return;
    }
    if (this.combo.length === 0) {
      this.combo = this.buildCombo();
      this.comboIndex = 0;
      this.comboTimer = 0;
    }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.chooseBossAttack(dist);
    }
  }

  updateBossFlash(dt) {
    this.boss.flash = Math.max(0, this.boss.flash - dt);
    const flashing = this.boss.flash > 0;
    const white = this.boss.stagger > 0;
    for (const part of this.boss.group.userData.flashParts || []) {
      if (white) part.material.color.set(0xf6f1e7);
      else if (flashing) part.material.color.set(this.boss.phase === 2 ? 0x9d2218 : 0x6e352f);
      else part.material.color.set(part.userData.baseColor);
    }
  }

  chooseBossAttack(dist) {
    const phaseTwo = this.boss.phase === 2;
    const step = this.combo[this.comboIndex];
    if (!step) {
      this.combo = [];
      this.comboRecovery = randomBetween(1, phaseTwo ? 4.2 : 5);
      return;
    }
    this.startBossPrimitive(step.attack, dist);
    this.comboIndex += 1;
    this.comboTimer = step.gap;
    if (this.comboIndex >= this.combo.length) {
      this.combo = [];
      this.comboRecovery = randomBetween(1, phaseTwo ? 4.2 : 5);
    }
    this.boss.attackHit = false;
  }

  buildCombo() {
    const phaseTwo = this.boss.phase === 2;
    const templates = phaseTwo
      ? [
          { name: "p2-1", attacks: [ATTACK.LEAP, ATTACK.TRIPLE_PROJECTILE, ATTACK.STAFF, ATTACK.RAPID_FIRE] },
          { name: "p2-2", attacks: [ATTACK.BARRAGE, ATTACK.CHAIN, ATTACK.SLAM, ATTACK.SPREAD, ATTACK.DOME_BLAST] },
          { name: "p2-3", attacks: [ATTACK.SPREAD, ATTACK.DASH_SLAM, ATTACK.PROJECTILE, ATTACK.LEAP, ATTACK.RAPID_FIRE] },
          { name: "p2-4", attacks: [ATTACK.CHAIN, ATTACK.TRIPLE_PROJECTILE, ATTACK.DASH_SLAM, ATTACK.DOME_BLAST] },
          { name: "p2-5", attacks: [ATTACK.BARRAGE, ATTACK.SPREAD, ATTACK.STAFF, ATTACK.LEAP, ATTACK.RAPID_FIRE] }
        ]
      : [
          { name: "p1-1", attacks: [ATTACK.PROJECTILE, ATTACK.SLAM, ATTACK.RAPID_FIRE] },
          { name: "p1-2", attacks: [ATTACK.SPREAD, ATTACK.STAFF, ATTACK.DOME_BLAST] },
          { name: "p1-3", attacks: [ATTACK.SLAM, ATTACK.PROJECTILE, ATTACK.SPREAD] },
          { name: "p1-4", attacks: [ATTACK.LEAP, ATTACK.PROJECTILE, ATTACK.RAPID_FIRE] },
          { name: "p1-5", attacks: [ATTACK.BARRAGE, ATTACK.SLAM] }
        ];
    let options = templates.filter((template) => template.name !== this.lastComboName);
    if (options.length === 0) options = templates;
    const template = options[Math.floor(Math.random() * options.length)];
    this.lastComboName = template.name;
    const attacks = [...template.attacks];
    const targetCount = phaseTwo ? Math.floor(randomBetween(3, Math.min(6, attacks.length + 1))) : Math.floor(randomBetween(2, Math.min(4, attacks.length + 1)));
    return attacks.slice(0, targetCount).map((attack) => ({
      attack,
      gap: randomBetween(1, phaseTwo ? 4.4 : 5)
    }));
  }

  startBossPrimitive(attack, dist) {
    const phaseTwo = this.boss.phase === 2;
    const telegraph = phaseTwo ? 0.35 : 0.5;
    this.boss.state = attack;
    this.boss.attackHit = false;
    this.boss.tripleShots = 0;
    this.boss.rapidShots = 0;
    this.boss.rapidTimer = 0;
    if (attack === ATTACK.SLAM) this.boss.stateTime = telegraph + 0.38;
    if (attack === ATTACK.PROJECTILE) this.boss.stateTime = telegraph + 0.2;
    if (attack === ATTACK.SPREAD) this.boss.stateTime = telegraph + 0.2;
    if (attack === ATTACK.SWEEP) this.boss.stateTime = telegraph + 0.7;
    if (attack === ATTACK.STAFF) this.boss.stateTime = phaseTwo ? 0.76 : 0.94;
    if (attack === ATTACK.DASH_SLAM) {
      this.boss.stateTime = telegraph + 0.62;
      const targetPillar = this.pickPillarTarget();
      const target = targetPillar && Math.random() < 0.2 ? targetPillar.position : this.player.position;
      this.boss.dashDirection.copy(target).sub(this.boss.position).setY(0).normalize();
    }
    if (attack === ATTACK.TRIPLE_PROJECTILE) this.boss.stateTime = telegraph + 0.9;
    if (attack === ATTACK.BARRAGE) this.boss.stateTime = phaseTwo ? 1.65 : 1.9;
    if (attack === ATTACK.RAPID_FIRE) {
      this.boss.stateTime = 10.45;
      this.setMessage("The Warlock opens a machine storm.");
    }
    if (attack === ATTACK.DOME_BLAST) {
      this.boss.stateTime = 2.45;
      this.castDomeCharge();
      this.setMessage("The air bends inward.");
    }
    if (attack === ATTACK.LEAP) {
      this.boss.stateTime = phaseTwo ? 1.72 : 1.95;
      this.boss.leapHeight = 0;
      this.boss.leapFollowup = Math.random() < 0.5 ? ATTACK.STAFF : ATTACK.TRIPLE_PROJECTILE;
      this.boss.dashDirection.copy(this.player.position).sub(this.boss.position).setY(0);
      if (this.boss.dashDirection.lengthSq() > 0.001) this.boss.dashDirection.normalize();
      this.setMessage("The Warlock leaves the ground.");
    }
    if (attack === ATTACK.CHAIN) {
      this.boss.stateTime = 0.52;
      this.boss.dashDirection.copy(this.player.position).sub(this.boss.position).setY(0).normalize();
    }
    if (attack === ATTACK.SLAM && dist > BOSS.meleeRange + 2) this.boss.stateTime += 0.2;
  }

  updateBossAttack(dt) {
    const total =
      this.boss.state === ATTACK.SWEEP
        ? 1.05
        : this.boss.state === ATTACK.RAPID_FIRE
          ? 10.45
        : this.boss.state === ATTACK.DOME_BLAST
          ? 2.45
        : this.boss.state === ATTACK.BARRAGE
          ? this.boss.phase === 2 ? 1.65 : 1.9
          : this.boss.state === ATTACK.CHAIN
            ? 0.52
        : this.boss.state === ATTACK.LEAP
          ? this.boss.phase === 2 ? 1.72 : 1.95
        : this.boss.state === ATTACK.STAFF
          ? this.boss.phase === 2 ? 0.7 : 0.88
          : this.boss.state === ATTACK.DASH_SLAM
            ? this.boss.phase === 2 ? 0.97 : 1.12
            : this.boss.state === ATTACK.SLAM
              ? this.boss.phase === 2 ? 0.72 : 0.95
              : this.boss.state === ATTACK.TRIPLE_PROJECTILE
                ? this.boss.phase === 2 ? 1.25 : 1.4
              : this.boss.phase === 2 ? 0.58 : 0.85;
    this.boss.stateTime -= dt;
    const progress = 1 - this.boss.stateTime / total;
    this.boss.group.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.08);

    if (this.boss.state === ATTACK.SLAM) {
      this.boss.group.rotation.x = -Math.sin(Math.min(progress, 0.62) / 0.62 * Math.PI) * 0.22;
    }
    if (this.boss.state === ATTACK.SLAM && progress > 0.62 && !this.boss.attackHit) {
      this.boss.attackHit = true;
      this.resolveBossSlam();
    }
    if (this.boss.state === ATTACK.PROJECTILE && progress > 0.58 && !this.boss.attackHit) {
      this.boss.attackHit = true;
      this.castOrb();
    }
    if (this.boss.state === ATTACK.SPREAD && progress > 0.58 && !this.boss.attackHit) {
      this.boss.attackHit = true;
      this.castSpread();
    }
    if (this.boss.state === ATTACK.SWEEP && progress > 0.44 && !this.boss.attackHit) {
      this.boss.attackHit = true;
      this.castAoe();
    }
    if (this.boss.state === ATTACK.STAFF) {
      this.animateBossStaffStrike(progress);
      if (progress > 0.58 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.resolveStaffStrike();
      }
    }
    if (this.boss.state === ATTACK.RAPID_FIRE) {
      this.boss.group.rotation.z = Math.sin(progress * Math.PI * 12) * 0.04;
      this.boss.rapidTimer -= dt;
      while (this.boss.rapidShots < 100 && this.boss.rapidTimer <= 0) {
        this.boss.rapidShots += 1;
        this.boss.rapidTimer += 0.1;
        this.castRapidProjectile(this.boss.rapidShots);
      }
    }
    if (this.boss.state === ATTACK.DOME_BLAST) {
      this.boss.group.scale.setScalar(1 + progress * 0.22 + Math.sin(progress * Math.PI * 18) * 0.035);
      this.groundShake = Math.max(this.groundShake, progress * 0.28);
      if (progress > 0.72 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.resolveDomeBlast();
      }
    }
    if (this.boss.state === ATTACK.LEAP) {
      const rising = progress < 0.38;
      const leapArc = rising
        ? easeOut(progress / 0.38)
        : Math.pow(Math.max(0, 1 - (progress - 0.38) / 0.62), 2.35);
      this.boss.leapHeight = leapArc * 24;
      this.boss.group.rotation.x = -leapArc * 0.42;
      if (progress > 0.12 && progress < 0.5) {
        this.boss.position.addScaledVector(this.boss.dashDirection, (this.boss.phase === 2 ? 8.8 : 7.2) * dt);
        this.boss.position.x = clamp(this.boss.position.x, -ARENA.halfSize + 2, ARENA.halfSize - 2);
        this.boss.position.z = clamp(this.boss.position.z, -ARENA.halfSize + 2, ARENA.halfSize - 2);
      }
      if (progress > 0.91 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.boss.leapHeight = 0;
        this.resolveLeapLanding();
      }
    }
    if (this.boss.state === ATTACK.BARRAGE) {
      this.boss.group.rotation.x = -Math.sin(progress * Math.PI) * 0.16;
      if (progress > 0.34 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.castBarrage();
      }
    }
    if (this.boss.state === ATTACK.CHAIN) {
      if (progress > 0.32 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.castChain();
      }
    }
    if (this.boss.state === ATTACK.DASH_SLAM) {
      if (progress > 0.28 && progress < 0.62) {
        this.boss.position.addScaledVector(this.boss.dashDirection, (this.boss.phase === 2 ? 18 : 14) * dt);
        this.boss.position.x = clamp(this.boss.position.x, -ARENA.halfSize + 2, ARENA.halfSize - 2);
        this.boss.position.z = clamp(this.boss.position.z, -ARENA.halfSize + 2, ARENA.halfSize - 2);
      }
      if (progress > 0.66 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.resolveBossSlam(true);
      }
    }
    if (this.boss.state === ATTACK.TRIPLE_PROJECTILE) {
      const thresholds = [0.38, 0.58, 0.78];
      thresholds.forEach((threshold, index) => {
        if (progress > threshold && this.boss.tripleShots === index) {
          this.boss.tripleShots += 1;
          this.castOrb();
        }
      });
      }

    if (this.boss.stateTime <= 0) {
      const cameFromLeap = this.boss.state === ATTACK.LEAP;
      const followup = this.boss.leapFollowup;
      this.boss.state = "idle";
      this.boss.leapHeight = 0;
      this.boss.leapFollowup = null;
      this.boss.group.scale.setScalar(1);
      this.boss.group.rotation.z = 0;
      this.boss.group.rotation.x = 0;
      this.resetBossWeaponPose();
      if (cameFromLeap && followup && this.boss.hp > 0 && !this.ended) {
        this.startBossPrimitive(followup, this.player.position.distanceTo(this.boss.position));
      }
    }
  }

  resolveBossSlam(isDash = false) {
    this.shake = Math.max(this.shake, 0.34);
    this.groundShake = Math.max(this.groundShake, 0.38);
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 14, 0xff8a35);
    if (this.getBossBox().expandByScalar(BOSS.meleeRange).intersectsBox(this.getPlayerBox())) {
      this.damagePlayer(isDash ? 30 : BOSS.meleeDamage, isDash ? "dash" : "slam");
    }
    this.breakPillarsInBox(this.getBossBox().expandByScalar(isDash ? 2.2 : 1.5));
  }

  resolveLeapLanding() {
    this.shake = Math.max(this.shake, 0.9);
    this.groundShake = Math.max(this.groundShake, 1.2);
    this.chromaticFlash = Math.max(this.chromaticFlash, 0.42);
    this.audio.leapExplosion();
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 34, 0xffb252);
    this.breakPillarsInBox(this.getBossBox().expandByScalar(3.2));

    const distance = this.player.position.distanceTo(this.boss.position);
    if (distance < 8.5) {
      const away = this.player.position.clone().sub(this.boss.position).setY(0);
      if (away.lengthSq() < 0.001) away.set(0, 0, 1);
      away.normalize();
      this.player.knockback.addScaledVector(away, 18 + (8.5 - distance) * 1.2);
      this.player.verticalVelocity = 11.6;
      this.player.airHeight = Math.max(this.player.airHeight, 0.45);
      this.player.grounded = false;
      this.damagePlayer(16, "leap");
      this.setMessage("The landing throws you skyward.");
    } else {
      this.setMessage("The earth buckles under the Warlock.");
    }
  }

  animateBossStaffStrike(progress) {
    const staff = this.boss.group.getObjectByName("bossStaff");
    const rightArm = this.boss.group.getObjectByName("bossRightArm");
    if (!staff) return;
    const windup = progress < 0.46 ? progress / 0.46 : 1;
    const release = progress < 0.46 ? 0 : (progress - 0.46) / 0.54;
    const snap = progress < 0.46 ? windup * 0.35 : 0.35 + Math.pow(release, 0.32) * 0.95;
    staff.position.set(1.1 - snap * 0.25, 1.75, -0.15 - Math.sin(snap * Math.PI) * 1.35);
    staff.rotation.x = -1.05 * Math.sin(snap * Math.PI);
    staff.rotation.z = -0.55 + snap * 1.05;
    if (rightArm) {
      rightArm.rotation.x = -0.8 * Math.sin(snap * Math.PI);
      rightArm.rotation.z = -0.35 + snap * 0.5;
    }
    this.boss.group.rotation.z = Math.sin(progress * Math.PI) * 0.18;
  }

  resetBossWeaponPose() {
    const staff = this.boss.group.getObjectByName("bossStaff");
    const rightArm = this.boss.group.getObjectByName("bossRightArm");
    if (staff) {
      staff.position.set(1.25, 1.75, 0.1);
      staff.rotation.set(0, 0, -0.08);
    }
    if (rightArm) {
      rightArm.position.set(0.82, 1.95, 0.02);
      rightArm.rotation.set(0, 0, -0.18);
    }
  }

  resolveStaffStrike() {
    const staff = this.boss.group.getObjectByName("bossStaff");
    const staffBox = staff ? new THREE.Box3().setFromObject(staff).expandByScalar(0.62) : this.getBossBox().expandByScalar(1.2);
    const staffCenter = staffBox.getCenter(new THREE.Vector3());
    this.spawnParticles(staffCenter.clone(), 18, 0xffd36b);
    this.shake = Math.max(this.shake, 0.26);
    this.groundShake = Math.max(this.groundShake, 0.3);
    if (staffBox.intersectsBox(this.getPlayerBox())) {
      this.damagePlayer(20, "staff");
      const away = this.player.position.clone().sub(this.boss.position).setY(0);
      if (away.lengthSq() < 0.001) away.set(0, 0, 1);
      this.player.knockback.addScaledVector(away.normalize(), 20);
      this.player.verticalVelocity = Math.max(this.player.verticalVelocity, 8.5);
      this.player.grounded = false;
    }
  }

  makeProjectileMesh(type) {
    let geometry;
    if (type.shape === "cone") {
      geometry = new THREE.ConeGeometry(type.size * 0.62, type.size * 2.2, 8);
    } else if (type.shape === "octa") {
      geometry = new THREE.OctahedronGeometry(type.size, 0);
    } else if (type.shape === "box") {
      geometry = new THREE.BoxGeometry(type.size * 1.5, type.size * 1.5, type.size * 1.5);
    } else {
      geometry = new THREE.SphereGeometry(type.size, 14, 10);
    }
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: type.color,
        emissive: type.emissive,
        emissiveIntensity: 2.1,
        roughness: 0.36,
        metalness: 0.05
      })
    );
    mesh.userData.projectileType = type.name;
    this.enableBloom(mesh);
    return mesh;
  }

  pushProjectile({ mesh, direction, speed, life = 4, damage = BOSS.projectileDamage, spin = 0, homing = false, turnRate = 0 }) {
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      direction,
      speed,
      life,
      damage,
      spin,
      homing,
      turnRate
    });
  }

  castRapidProjectile(shot) {
    if (shot % 6 === 1) this.audio.projectileSpawn();
    const seekerType = PROJECTILE_TYPES.find((projectile) => projectile.homing);
    const type = shot % 9 === 0 && seekerType ? seekerType : PROJECTILE_TYPES[(shot - 1) % PROJECTILE_TYPES.length];
    const start = this.boss.position.clone().add(new THREE.Vector3(
      randomBetween(-0.38, 0.38),
      randomBetween(1.35, 2.35),
      randomBetween(-0.22, 0.22)
    ));
    const aim = this.player.position.clone().add(new THREE.Vector3(
      randomBetween(-2.2, 2.2),
      randomBetween(0.25, 1.5),
      randomBetween(-2.2, 2.2)
    ));
    const direction = aim.sub(start).normalize();
    const mesh = this.makeProjectileMesh(type);
    mesh.position.copy(start);
    if (type.shape === "cone") mesh.quaternion.setFromUnitVectors(UP, direction);
    this.pushProjectile({
      mesh,
      direction,
      speed: type.speed + randomBetween(-1.2, 2.2) + (this.boss.phase === 2 ? 2 : 0),
      life: type.homing ? 4.4 : 3.4,
      damage: type.damage,
      spin: randomBetween(5, 13),
      homing: Boolean(type.homing),
      turnRate: type.homing ? 1.9 : 0
    });
  }

  resolveDomeBlast() {
    const radius = 14;
    this.shake = Math.max(this.shake, 1.15);
    this.groundShake = Math.max(this.groundShake, 1.4);
    this.chromaticFlash = Math.max(this.chromaticFlash, 0.58);
    this.audio.domeDetonate();
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 60, 0xd8f5ff);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xcff8ff,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    dome.position.copy(this.boss.position);
    dome.position.y = 0.06;
    this.enableBloom(dome);
    this.scene.add(dome);
    this.projectiles.push({
      mesh: dome,
      direction: new THREE.Vector3(),
      speed: 0,
      life: 0.75,
      dome: true,
      maxLife: 0.75
    });

    const distance = this.player.position.distanceTo(this.boss.position);
    if (distance <= radius) {
      this.player.verticalVelocity = Math.max(this.player.verticalVelocity, 13);
      this.player.airHeight = Math.max(this.player.airHeight, 0.35);
      this.player.grounded = false;
      this.damagePlayer(32, "dome");
      this.setMessage("The dome detonates.");
    }
    this.breakPillarsInBox(this.getBossBox().expandByScalar(radius));
  }

  castOrb() {
    this.groundShake = Math.max(this.groundShake, 0.16);
    this.audio.projectileSpawn();
    const start = this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    const direction = this.player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(start).normalize();
    const mesh = this.makeProjectileMesh(PROJECTILE_TYPES[0]);
    mesh.position.copy(start);
    const light = new THREE.PointLight(0xff4a20, 1.1, 6);
    mesh.add(light);
    this.pushProjectile({
      mesh,
      direction,
      speed: this.boss.phase === 2 ? 9.2 : 6.2,
      life: 4,
      damage: BOSS.projectileDamage,
      spin: 5
    });
  }

  castSpread() {
    this.audio.projectileSpawn();
    const start = this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    const base = this.player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(start).normalize();
    for (const angle of [-Math.PI / 12, 0, Math.PI / 12]) {
      const direction = base.clone().applyAxisAngle(UP, angle).normalize();
      const type = PROJECTILE_TYPES[1 + Math.floor(Math.random() * 4)];
      const mesh = this.makeProjectileMesh(type);
      mesh.position.copy(start);
      this.pushProjectile({
        mesh,
        direction,
        speed: this.boss.phase === 2 ? 9.6 : 6.8,
        life: 4,
        damage: type.damage,
        spin: 7
      });
    }
  }

  castAoe() {
    this.shake = Math.max(this.shake, 0.3);
    this.groundShake = Math.max(this.groundShake, 0.55);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.055, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0xff3a21, transparent: true, opacity: 0.75 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(this.boss.position);
    ring.position.y = 0.08;
    this.enableBloom(ring);
    this.scene.add(ring);
    this.projectiles.push({
      mesh: ring,
      direction: new THREE.Vector3(),
      speed: 0,
      life: 1.05,
      aoe: true,
      radius: 0.8,
      hit: false
    });
  }

  castDomeCharge() {
    this.audio.powerCharge(2.35);
    const charge = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x9eefff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    charge.position.copy(this.boss.position);
    charge.position.y = 0.08;
    this.enableBloom(charge);
    this.scene.add(charge);
    this.projectiles.push({
      mesh: charge,
      direction: new THREE.Vector3(),
      speed: 0,
      life: 2.45,
      maxLife: 2.45,
      chargeDome: true
    });
  }

  castBarrage() {
    this.shake = Math.max(this.shake, 0.34);
    this.groundShake = Math.max(this.groundShake, 0.55);
    this.setMessage("The sky answers the staff.");
    for (let i = 0; i < 28; i += 1) {
      const spread = i < 12 ? 7 : 16;
      const target = this.player.position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        0,
        (Math.random() - 0.5) * spread
      ));
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.72, 18),
        new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(target.x, 0.035, target.z);
      this.enableBloom(marker);
      this.scene.add(marker);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xff9f1a, emissiveIntensity: 1.8 })
      );
      mesh.position.set(target.x + (Math.random() - 0.5) * 4, 12 + Math.random() * 8, target.z + (Math.random() - 0.5) * 4);
      this.enableBloom(mesh);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        marker,
        direction: target.clone().sub(mesh.position).normalize(),
        speed: 13 + Math.random() * 5,
        life: 2.6,
        sky: true,
        target,
        hit: false
      });
    }
  }

  castChain() {
    this.shake = Math.max(this.shake, 0.22);
    const start = this.boss.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    const target = this.player.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const direction = target.sub(start).normalize();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1, 8),
      new THREE.MeshStandardMaterial({
        color: 0xf5f7ff,
        emissive: 0xdce8ff,
        emissiveIntensity: 0.45,
        metalness: 0.25,
        roughness: 0.42
      })
    );
    mesh.position.copy(start);
    this.enableBloom(mesh);
    mesh.quaternion.setFromUnitVectors(UP, direction);
    mesh.scale.y = 1.6;
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      direction,
      speed: 28,
      life: 0.7,
      chain: true,
      hit: false
    });
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      if (projectile.aoe) {
        projectile.radius += dt * 8.5;
        projectile.mesh.scale.setScalar(projectile.radius);
        projectile.mesh.material.opacity = Math.max(0, projectile.life / 1.05);
        const dist = this.player.position.distanceTo(this.boss.position);
        if (!projectile.hit && this.player.grounded && Math.abs(dist - projectile.radius) < 0.75) {
          projectile.hit = true;
          this.damagePlayer(22, "aoe");
        }
      } else if (projectile.dome) {
        const fade = Math.max(0, projectile.life / projectile.maxLife);
        projectile.mesh.material.opacity = fade * 0.34;
        projectile.mesh.scale.setScalar(1 + (1 - fade) * 0.18);
      } else if (projectile.chargeDome) {
        const progress = 1 - Math.max(0, projectile.life / projectile.maxLife);
        projectile.mesh.position.copy(this.boss.position);
        projectile.mesh.position.y = 0.08;
        projectile.mesh.scale.setScalar(2 + progress * 12 + Math.sin(this.clock.elapsedTime * 26) * 0.25);
        projectile.mesh.material.opacity = 0.08 + progress * 0.2;
      } else {
        if (projectile.homing && !projectile.deflected) {
          const target = this.player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
          const desired = target.sub(projectile.mesh.position).normalize();
          projectile.direction.lerp(desired, clamp(projectile.turnRate * dt, 0, 1)).normalize();
          projectile.mesh.scale.setScalar(1 + Math.sin(this.clock.elapsedTime * 16) * 0.12);
        }
        projectile.mesh.position.addScaledVector(projectile.direction, projectile.speed * dt);
        if (projectile.spin) {
          projectile.mesh.rotation.x += projectile.spin * dt;
          projectile.mesh.rotation.z += projectile.spin * 0.73 * dt;
        }
        if (projectile.sky) {
          projectile.marker.material.opacity = Math.max(0, projectile.life / 2.6) * 0.55;
          if (projectile.mesh.position.y <= 0.35) {
            projectile.life = 0;
            this.shake = Math.max(this.shake, 0.16);
            this.groundShake = Math.max(this.groundShake, 0.22);
            this.spawnParticles(projectile.target.clone().add(new THREE.Vector3(0, 0.25, 0)), 7, 0xffd166);
            if (this.player.grounded && this.player.position.distanceTo(projectile.target) < 1.25) {
              this.damagePlayer(9, "barrage");
            }
          }
          continue;
        }
        if (projectile.chain) {
          projectile.mesh.quaternion.setFromUnitVectors(UP, projectile.direction);
          const chainBox = new THREE.Box3().setFromObject(projectile.mesh).expandByScalar(0.45);
          if (!projectile.hit && chainBox.intersectsBox(this.getPlayerBox())) {
            projectile.hit = true;
            projectile.life = 0;
            this.pullPlayerToBoss();
          }
          continue;
        }
        const projectileBox = new THREE.Box3().setFromObject(projectile.mesh).expandByScalar(0.15);
        if (projectile.deflected && projectileBox.intersectsBox(this.getBossBox())) {
          projectile.life = 0;
          this.damageBoss(45, "deflect");
          this.spawnParticles(projectile.mesh.position.clone(), 18, 0xffe66d);
          this.setMessage("The Warlock eats his own flame.");
        } else if (!projectile.deflected && this.canDeflectProjectile(projectileBox)) {
          this.deflectProjectile(projectile);
        } else if (projectileBox.intersectsBox(this.getPlayerBox())) {
          projectile.life = 0;
          this.damagePlayer(projectile.damage || BOSS.projectileDamage, "projectile");
          this.spawnParticles(projectile.mesh.position.clone(), 8, 0xff7a35);
        }
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => {
      if (projectile.life > 0) return true;
      this.scene.remove(projectile.mesh);
      if (projectile.marker) {
        this.scene.remove(projectile.marker);
        projectile.marker.geometry?.dispose?.();
        projectile.marker.material?.dispose?.();
      }
      projectile.mesh.geometry?.dispose?.();
      projectile.mesh.material?.dispose?.();
      return false;
    });
  }

  damagePlayer(amount, source) {
    if (this.player.invincible > 0) {
      this.setMessage("The blow passes through the roll.");
      return;
    }
    if (this.player.blockHeld && this.player.stamina > 0) {
      if (this.player.blockTime <= 0.3) {
        this.boss.stagger = BOSS.staggerTime;
        this.boss.flash = BOSS.staggerTime;
        this.shake = 0.18;
        this.parryTint = 0.2;
        this.chromaticFlash = Math.max(this.chromaticFlash, 0.2);
        this.audio.parry();
        this.setMessage("Parry. The Warlock staggers.");
        return;
      }
      amount *= 0.38;
      this.player.stamina = Math.max(0, this.player.stamina - 16);
      this.setMessage("Blocked, but the impact bites.");
    } else {
      this.setMessage(
        source === "projectile"
          ? "Arcane fire finds you."
          : source === "dome"
            ? "The blast tears the ground away."
            : "Crushed by the Warlock's strike."
      );
    }
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.invincible = 0.5;
    this.player.damageFlash = 0.55;
    this.chromaticFlash = 0.6;
    this.audio.damage(source === "projectile");
    const away = this.player.position.clone().sub(this.boss.position).setY(0);
    if (away.lengthSq() < 0.001) away.set(0, 0, 1);
    away.normalize();
    const force = source === "dome" ? 100 : source === "projectile" ? 13 : source === "aoe" ? 18 : 22;
    this.player.knockback.addScaledVector(away, force);
    this.shake = 0.42;
    this.spawnDamageOutline();
    this.spawnParticles(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 18, 0xff1f2d);
    if (this.player.hp <= 0) this.endFight("death");
  }

  pullPlayerToBoss() {
    const toBoss = this.boss.position.clone().sub(this.player.position).setY(0);
    if (toBoss.lengthSq() > 0.001) {
      toBoss.normalize();
      this.player.knockback.addScaledVector(toBoss, 28);
    }
    this.player.grounded = true;
    this.player.airHeight = 0;
    this.player.verticalVelocity = 0;
    this.shake = Math.max(this.shake, 0.36);
    this.groundShake = Math.max(this.groundShake, 0.42);
    this.damagePlayer(12, "chain");
    this.setMessage("The chain bites and drags you in.");
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.multiplyScalar(Math.max(0.82, 1 - dt * 3));
      particle.mesh.material.opacity = Math.max(0, particle.life / particle.maxLife);
    }
    this.particles = this.particles.filter((particle) => {
      if (particle.life > 0) return true;
      this.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particle.mesh.material.dispose();
      return false;
    });
  }

  getPlayerBox() {
    return new THREE.Box3().setFromObject(this.player.group);
  }

  getBossBox() {
    return new THREE.Box3().setFromObject(this.boss.group);
  }

  getSwordBox(expand = 0.38) {
    const blade = this.player.group.getObjectByName("blade");
    if (!blade) return new THREE.Box3();
    return new THREE.Box3().setFromObject(blade).expandByScalar(expand);
  }

  getAttackBox(reach, width) {
    const forward = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    const center = this.player.position.clone().addScaledVector(forward, reach * 0.52);
    center.y = 1.1;
    const size = new THREE.Vector3(width, 1.8, reach);
    const box = new THREE.Box3().setFromCenterAndSize(center, size);
    return box;
  }

  swordCanHitBoss(reach, halfAngle) {
    const toBoss = this.boss.position.clone().sub(this.player.position).setY(0);
    const distance = toBoss.length();
    if (distance > reach + BOSS.radius || distance < 0.001) return false;

    const forward = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing)).normalize();
    const direction = toBoss.normalize();
    const angle = forward.angleTo(direction);
    if (angle > halfAngle) return false;

    const swordBox = this.getSwordBox(0.75);
    const bossBox = this.getBossBox().expandByScalar(0.2);
    return swordBox.intersectsBox(bossBox);
  }

  canDeflectProjectile(projectileBox) {
    if (this.player.attacking <= 0 || this.player.attackDuration <= 0) return false;
    const swordBox = this.getSwordBox(0.38);
    return swordBox.intersectsBox(projectileBox);
  }

  breakPillarsInBox(box) {
    for (const segment of this.pillarSegments) {
      if (!segment.destroyed && box.intersectsBox(segment.box)) {
        this.destroyPillarSegment(segment);
      }
    }
  }

  pickPillarTarget() {
    const live = this.pillarSegments.filter((segment) => !segment.destroyed);
    if (live.length === 0) return null;
    return live[Math.floor(Math.random() * live.length)].mesh;
  }

  destroyPillarSegment(segment) {
    segment.destroyed = true;
    this.scene.remove(segment.mesh);
    this.audio.pillarBreak();
    this.shake = Math.max(this.shake, 0.45);
    this.groundShake = Math.max(this.groundShake, 0.5);
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.segment !== segment);
    const origin = segment.mesh.position.clone();
    const chunks = 4 + Math.floor(Math.random() * 3);
    while (this.debris.length > 30) {
      const old = this.debris.shift();
      this.scene.remove(old.mesh);
    }
    for (let i = 0; i < chunks; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(randomBetween(0.22, 0.42), randomBetween(0.14, 0.34), randomBetween(0.22, 0.42)),
        new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9, transparent: true, opacity: 1 })
      );
      mesh.position.copy(origin).add(new THREE.Vector3(randomBetween(-0.4, 0.4), randomBetween(-0.3, 0.3), randomBetween(-0.4, 0.4)));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3(randomBetween(-2.4, 2.4), randomBetween(3, 6), randomBetween(-2.4, 2.4)),
        life: 3,
        landed: false
      });
    }
  }

  updateDebris(dt) {
    for (const chunk of this.debris) {
      if (!chunk.landed) {
        chunk.velocity.y -= 9.8 * dt;
        chunk.mesh.position.addScaledVector(chunk.velocity, dt);
        chunk.mesh.rotation.x += dt * chunk.velocity.z;
        chunk.mesh.rotation.z += dt * chunk.velocity.x;
        if (chunk.mesh.position.y <= 0.12) {
          chunk.mesh.position.y = 0.08;
          chunk.mesh.scale.y *= 0.35;
          chunk.landed = true;
          const box = new THREE.Box3().setFromObject(chunk.mesh).expandByScalar(0.15);
          this.rubbleColliders.push(box);
          this.obstacles.push({ box });
        }
      } else {
        chunk.life -= dt;
        chunk.mesh.material.opacity = Math.max(0.25, chunk.life / 3);
      }
    }
    this.debris = this.debris.filter((chunk) => {
      if (chunk.life > 0 || !chunk.landed) return true;
      return true;
    });
  }

  deflectProjectile(projectile) {
    const direction = this.boss.position.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(projectile.mesh.position).normalize();
    projectile.direction.copy(direction);
    projectile.speed = Math.max(projectile.speed, 12.5);
    projectile.life = Math.max(projectile.life, 1.2);
    projectile.deflected = true;
    projectile.homing = false;
    projectile.turnRate = 0;
    projectile.mesh.material.color.set(0xfff08a);
    projectile.mesh.material.emissive?.set(0xffd34f);
    this.spawnParticles(projectile.mesh.position.clone(), 12, 0xffe66d);
    this.setMessage("Fireball turned back.");
  }

  updateLegAnimation(move, elapsed) {
    const leftLeg = this.player.group.getObjectByName("leftLeg");
    const rightLeg = this.player.group.getObjectByName("rightLeg");
    if (!leftLeg || !rightLeg) return;

    const moving = move.lengthSq() > 0.01 || this.player.knockback.lengthSq() > 0.2;
    const stride = moving ? Math.sin(elapsed * 12) * 0.48 : 0;
    leftLeg.rotation.x = stride;
    rightLeg.rotation.x = -stride;
    leftLeg.position.z = moving ? Math.sin(elapsed * 12) * 0.07 : 0;
    rightLeg.position.z = moving ? -Math.sin(elapsed * 12) * 0.07 : 0;
  }

  updateBossLimbAnimation(dt, elapsed, distanceToPlayer) {
    const leftLeg = this.boss.group.getObjectByName("bossLeftLeg");
    const rightLeg = this.boss.group.getObjectByName("bossRightLeg");
    const leftArm = this.boss.group.getObjectByName("bossLeftArm");
    const rightArm = this.boss.group.getObjectByName("bossRightArm");
    const moving = this.boss.state === "idle" && distanceToPlayer > 5.2 && this.boss.stagger <= 0;
    const limp = moving ? Math.sin(elapsed * 4.6) : 0;

    if (leftLeg) {
      leftLeg.position.set(-0.38, 0.45, 0.12 + Math.max(0, limp) * 0.08);
      leftLeg.rotation.x = 0.22 + limp * 0.22;
      leftLeg.rotation.z = Math.sin(elapsed * 2.4) * 0.06;
    }
    if (rightLeg) {
      rightLeg.position.set(0.38, 0.32, -0.22 - Math.abs(limp) * 0.16);
      rightLeg.rotation.x = -0.68 - Math.abs(limp) * 0.42;
      rightLeg.rotation.z = -0.13 + Math.sin(elapsed * 3.2) * 0.04;
    }
    if (leftArm) {
      leftArm.rotation.x = moving ? -limp * 0.18 : 0;
      leftArm.rotation.z = 0.24 + Math.sin(elapsed * 2.1) * 0.04;
    }
    if (rightArm && this.boss.state !== ATTACK.STAFF) {
      rightArm.position.set(0.82, 1.95, 0.02);
      rightArm.rotation.x = moving ? limp * 0.15 : 0;
      rightArm.rotation.z = -0.18 + Math.sin(elapsed * 2.4) * 0.04;
    }
  }

  updatePlayerDamageOutline() {
    for (const object of this.player.group.children) {
      if (!object.material || !object.material.emissive) continue;
      if (this.player.damageFlash > 0) {
        object.material.emissive.set(0x8f0000);
        object.material.emissiveIntensity = 0.8;
      } else if (object.name !== "blade") {
        object.material.emissive.set(0x000000);
        object.material.emissiveIntensity = 0;
      }
    }
  }

  spawnDamageOutline() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.045, 8, 42),
      new THREE.MeshBasicMaterial({ color: 0xff2038, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(this.player.position);
    ring.position.y = 0.08;
    this.scene.add(ring);
    this.particles.push({
      mesh: ring,
      velocity: new THREE.Vector3(),
      life: 0.5,
      maxLife: 0.5,
      outline: true
    });
  }

  spawnParticles(position, count, color) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      mesh.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 0.8,
        (Math.random() - 0.5) * 4
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.55, maxLife: 0.55 });
    }
  }

  updateCamera(dt, instant = false) {
    const distance = 8.6;
    const height = 4.2;
    const target = this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    let desired;
    let lookTarget = target;

    if (this.lockOn && !this.ended && this.boss.hp > 0) {
      const bossTarget = this.boss.position.clone().add(new THREE.Vector3(0, 1.75, 0));
      const toBoss = this.boss.position.clone().sub(this.player.position).setY(0);
      if (toBoss.lengthSq() > 0.001) {
        toBoss.normalize();
        this.cameraYaw = Math.atan2(-toBoss.x, -toBoss.z);
      }
      desired = target
        .clone()
        .addScaledVector(toBoss, -distance)
        .add(new THREE.Vector3(0, height + 0.45, 0));
      lookTarget = target.clone().lerp(bossTarget, 0.56);
    } else {
      const offset = new THREE.Vector3(
        Math.sin(this.cameraYaw) * distance,
        height + Math.sin(this.cameraPitch) * 3,
        Math.cos(this.cameraYaw) * distance
      );
      desired = target.clone().add(offset);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      desired.x += (Math.random() - 0.5) * this.shake;
      desired.y += (Math.random() - 0.5) * this.shake;
    }
    if (this.groundShake > 0) {
      this.groundShake = Math.max(0, this.groundShake - dt);
      desired.x += Math.sin(this.clock.elapsedTime * 80) * this.groundShake * 0.22;
      desired.z += Math.cos(this.clock.elapsedTime * 74) * this.groundShake * 0.22;
      desired.y += Math.sin(this.clock.elapsedTime * 95) * this.groundShake * 0.09;
    }
    if (instant) {
      this.camera.position.copy(desired);
    } else {
      this.camera.position.lerp(desired, 0.14);
    }
    this.camera.lookAt(lookTarget);
  }

  updateHud() {
    this.hpBar.style.width = `${(this.player.hp / PLAYER.maxHp) * 100}%`;
    this.staminaBar.style.width = `${(this.player.stamina / PLAYER.maxStamina) * 100}%`;
    this.bossHpBar.style.width = `${(this.boss.hp / BOSS.maxHp) * 100}%`;
  }

  setMessage(text) {
    this.messageEl.textContent = text;
  }

  endFight(type) {
    this.ended = true;
    this.endScreen.hidden = false;
    if (type === "victory") {
      this.audio.victory();
      this.endTitle.textContent = "VICTORY";
      this.endCopy.textContent = `${BOSS_NAME} falls silent among the ash.`;
      this.retryButton.hidden = true;
      this.homeLink.hidden = false;
    } else {
      this.audio.death();
      this.endTitle.textContent = "YOU DIED";
      this.endCopy.textContent = "The dungeon keeps what panic gives it.";
      this.retryButton.hidden = false;
      this.homeLink.hidden = true;
    }
  }
}
