const SFX_BASE = "/assets/audio/darksouls/sfx/";

const REAL_SFX = {
  playerLightSwing: ["player-sword-swing-1.wav", "player-sword-swing-2.wav"],
  playerHeavySwing: ["heavy-sword-swing-1.wav"],
  playerLightHit: ["player-sword-hit-1.wav"],
  playerHeavyHit: ["heavy-sword-hit-1.wav"],
  fireLaunch: ["fireball-launch-1.wav", "fireball-launch-2.wav"],
  fireImpact: ["fireball-impact-1.wav"],
  iceLaunch: ["ice-projectile-launch-1.wav"],
  shield: ["shield-activate-1.wav"],
  enemyPhysical: ["heavy-sword-swing-1.wav"]
};

export class ProceduralAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sampleGain = null;
    this.samples = new Map();
    this.loadingSamples = null;
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
      this.sampleGain = this.ctx.createGain();
      this.sampleGain.gain.value = 0.9;
      this.sampleGain.connect(this.master);
      this.loadSamples();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx.state === "running";
  }

  loadSamples() {
    if (this.loadingSamples) return this.loadingSamples;
    const entries = Object.entries(REAL_SFX).flatMap(([name, files]) =>
      files.map((file) => ({ name, url: `${SFX_BASE}${file}` }))
    );

    this.loadingSamples = Promise.allSettled(
      entries.map(async ({ name, url }) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load ${url}`);
        const buffer = await response.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(buffer);
        const list = this.samples.get(name) || [];
        list.push(decoded);
        this.samples.set(name, list);
      })
    );
    return this.loadingSamples;
  }

  playSample(name, { volume = 0.75, rate = 1, detune = 0 } = {}) {
    if (!this.ensure()) return false;
    const choices = this.samples.get(name);
    if (!choices?.length) return false;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = choices[Math.floor(Math.random() * choices.length)];
    source.playbackRate.value = rate;
    source.detune.value = detune + (Math.random() - 0.5) * 80;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.sampleGain);
    source.start();
    return true;
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

  playerAttack(type = "light") {
    const played = type === "heavy"
      ? this.playSample("playerHeavySwing", { volume: 0.72, rate: 0.94 })
      : this.playSample("playerLightSwing", { volume: 0.62, rate: 1.05 });
    if (!played) {
      if (type === "heavy") this.oscillatorHit("sawtooth", 120, 0.18, 4);
      else this.oscillatorHit("sawtooth", 240, 0.11, 2);
    }
  }
  lightHit() {
    if (!this.playSample("playerLightHit", { volume: 0.54, rate: 1.06 })) {
      this.oscillatorHit("sawtooth", 180, 0.15, 3);
    }
  }
  heavyHit() {
    if (!this.playSample("playerHeavyHit", { volume: 0.72, rate: 0.95 })) {
      this.oscillatorHit("square", 90, 0.25, 7);
    }
  }
  fireAttack() {
    if (!this.playSample("fireLaunch", { volume: 0.78, rate: 0.92 })) {
      this.heavyHit();
    }
  }
  fireImpact() {
    if (!this.playSample("fireImpact", { volume: 0.7, rate: 0.96 })) {
      this.noise(0.2, 520, 0.2);
    }
  }
  enemyPhysical() {
    if (!this.playSample("enemyPhysical", { volume: 0.7, rate: 0.82 })) {
      this.oscillatorHit("square", 105, 0.2, 6);
    }
  }
  damage(low = false) { this.noise(0.2, low ? 240 : 400, 0.22); }
  clank() {
    if (!this.ensure()) return;
    this.playSample("playerHeavyHit", { volume: 1.0, rate: 0.86, detune: -120 });
    this.oscillatorHit("square", 280, 0.16, 10);
    setTimeout(() => this.oscillatorHit("triangle", 920, 0.14, 4), 18);
    setTimeout(() => this.oscillatorHit("sine", 1500, 0.1, 0), 42);
    this.noise(0.16, 1800, 0.26);
  }
  pillarBreak() { this.oscillatorHit("triangle", 60, 0.8, 2); this.noise(0.5, 120, 0.16); }
  projectileSpawn(kind = "fire", { volume = 0.64, rate = 1.08, detune = 0 } = {}) {
    if (kind === "ice" && this.playSample("iceLaunch", { volume, rate, detune })) return;
    if (this.playSample("fireLaunch", { volume, rate, detune })) return;
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.3);
    gain.gain.setValueAtTime(Math.max(0.025, volume * 0.125), now);
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
    this.playSample("shield", { volume: 1.0, rate: 0.88, detune: -80 });
    this.playSample("playerHeavyHit", { volume: 0.95, rate: 0.72, detune: -160 });
    this.kick(180, 38, 0.22, 0.32);
    this.noise(0.22, 2600, 0.26);
    for (const freq of [640, 960, 1320]) this.oscillatorHit("sine", freq, 0.16, 0);
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
