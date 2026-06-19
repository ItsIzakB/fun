import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ARENA, BOSS, BOSS_NAME, PLAYER, WEAPONS } from "./config.js";
import { ProceduralAudio } from "./engine/audio.js";
import { buildBossCombo, getBossAttackTotal, getBossStage, getBossTuning } from "./engine/bossAi.js";
import { ATTACK, BLOOM_LAYER, NON_BLOOM_MATERIAL, PROJECTILE_TYPES, UP } from "./engine/constants.js";
import { approachAngle, clamp, easeOut, makeBox, randomBetween } from "./engine/math.js";
import { BloomCompositeShader, ChromaticAberrationShader, VignetteShader } from "./engine/shaders.js";
import { createBossState, createPlayerState } from "./engine/state.js";

const BOSS_SHIELD_BREAK_HITS = 7;
const RAPID_FIRE_INTERVAL = 1 / 30;
const RAPID_FIRE_SHOTS = 100;
const RAPID_FIRE_TELL = 0.18;

export class DarkSoulsGame {
  constructor({
    stage,
    canvas,
    hpBar,
    staminaBar,
    bossHpBar,
    bossShieldBar,
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
    this.bossShieldBar = bossShieldBar;
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
    this.attackIndicators = [];
    this.hitboxes = [];
    this.obstacles = [];
    this.pillars = [];
    this.pillarSegments = [];
    this.debris = [];
    this.rubbleColliders = [];
    this.healthPickups = [];
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
    this.slowMo = 0;
    this.slowMoScale = 1;
    this.audio = new ProceduralAudio();

    this.player = createPlayerState();
    this.boss = createBossState();

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
    this.makeHealthPickups();
  }

  makeHealthPickups() {
    const positions = [
      [-11, 0],
      [12, 9],
      [-25, 20],
      [25, -17],
      [2, 31],
      [-36, -8]
    ];

    for (const [x, z] of positions) {
      const group = new THREE.Group();
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xff3d64,
          emissive: 0xff102d,
          emissiveIntensity: 1.4,
          roughness: 0.35
        })
      );
      const crossA = makeBox(0.72, 0.16, 0.16, 0xffdde4, 0.4);
      const crossB = makeBox(0.16, 0.72, 0.16, 0xffdde4, 0.4);
      orb.position.y = 0.34;
      crossA.position.y = 0.36;
      crossB.position.y = 0.36;
      this.enableBloom(orb);
      this.enableBloom(crossA);
      this.enableBloom(crossB);
      group.add(orb, crossA, crossB);
      group.position.set(x, 0.12, z);
      group.userData.baseY = 0.12;
      group.visible = true;
      this.scene.add(group);
      this.healthPickups.push({ mesh: group, used: false, heal: 34 });
    }
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
    const guard = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 32),
      new THREE.MeshBasicMaterial({
        color: 0xd7ecff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    guard.name = "playerGuard";
    guard.position.set(0, 1.05, -0.72);
    guard.rotation.y = Math.PI;
    guard.visible = false;
    this.enableBloom(guard);
    group.add(body, head, rightShoulder, leftShoulder, leftLeg, rightLeg, leftArm, rightArm, swordPivot, guard);
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
    const shield = new THREE.Mesh(
      new THREE.CircleGeometry(2.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7edbff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    shield.name = "bossShield";
    shield.position.set(0, 1.65, 1.35);
    shield.visible = false;
    this.enableBloom(ember);
    this.enableBloom(head);
    this.enableBloom(shield);
    group.add(leftLeg, rightLeg, robe, shoulders, head, leftArm, rightArm, staff, ember, shield);
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
    if (this.player.blockHeld) this.player.blockCooldown = Math.max(this.player.blockCooldown, PLAYER.blockCooldown);
    this.player.blockHeld = false;
    this.player.charging = 0;
  }

  handlePointerDown(event) {
    this.audio.ensure();
    this.canvas.focus();
    event.preventDefault();
    if (event.button === 2) {
      if (this.player.blockHeld) return;
      if (this.player.blockCooldown > 0) {
        this.setMessage("Guard is still recovering.");
        return;
      }
      if (this.player.stamina < PLAYER.blockStartCost) {
        this.setMessage("Not enough stamina to raise guard.");
        return;
      }
      this.player.stamina = Math.max(0, this.player.stamina - PLAYER.blockStartCost);
      this.player.blockHeld = true;
      this.player.blockTime = 0;
      this.player.guardFlash = 0.16;
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
      if (this.player.blockHeld) {
        this.player.blockCooldown = Math.max(this.player.blockCooldown, PLAYER.blockCooldown);
      }
      this.player.blockHeld = false;
      return;
    }
    if (event.button === 0) {
      this.pointer.dragging = false;
      if (this.pointer.moved) {
        this.player.charging = 0;
        return;
      }
      const chargeTime = this.player.charging;
      if (this.player.charging > 0.42) {
        this.startAttack("heavy");
      } else {
        this.startAttack("light");
      }
      if (!this.ended && chargeTime > 0.18) this.releaseWeaponSpecial(chargeTime);
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
    this.player = { ...createPlayerState(), group: this.player.group };
    this.boss = { ...createBossState(), group: this.boss.group };
    this.lockOn = false;
    if (!this.weaponSelected) {
      this.weaponScreen.hidden = false;
    }
    this.player.group.position.copy(this.player.position);
    this.boss.group.position.copy(this.boss.position);
    const shield = this.boss.group.getObjectByName("bossShield");
    if (shield) {
      shield.visible = false;
      shield.material.opacity = 0;
    }
    this.healthPickups.forEach((pickup) => {
      pickup.used = false;
      pickup.mesh.visible = true;
      pickup.mesh.scale.setScalar(1);
    });
    this.projectiles.forEach((projectile) => {
      this.scene.remove(projectile.mesh);
      if (projectile.marker) this.scene.remove(projectile.marker);
    });
    this.projectiles = [];
    this.hitboxes = [];
    this.attackIndicators.forEach((indicator) => this.scene.remove(indicator.mesh));
    this.attackIndicators = [];
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
    const rawDt = Math.min(this.clock.getDelta(), 0.033);
    const dt = rawDt * (this.slowMo > 0 ? this.slowMoScale : 1);
    const elapsed = this.clock.elapsedTime;
    if (!this.ended && this.weaponSelected) {
      this.updatePlayer(dt, elapsed);
      this.updateBoss(dt, elapsed);
      this.updateProjectiles(dt);
      this.updateHitboxes(dt);
      this.updateParticles(dt);
      this.updateAttackIndicators(dt);
      this.updateDebris(dt);
      this.updateHealthPickups(dt, elapsed);
    }
    this.slowMo = Math.max(0, this.slowMo - rawDt);
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
    const slowFactor = this.player.slow > 0 ? 0.38 : 1;
    if (this.player.clashStun > 0) {
      this.player.clashStun = Math.max(0, this.player.clashStun - dt);
    } else if (this.player.rolling > 0) {
      this.player.rolling -= dt;
      this.player.invincible = Math.max(this.player.invincible, this.player.rolling);
      this.movePlayer(this.player.inputDir, PLAYER.dodgeSpeed * slowFactor * dt);
    } else {
      this.movePlayer(move, PLAYER.speed * chargeSlow * slowFactor * dt);
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
      if (this.player.stamina <= 0) {
        this.player.blockHeld = false;
        this.player.blockCooldown = Math.max(this.player.blockCooldown, PLAYER.blockCooldown);
      }
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
    this.player.slow = Math.max(0, this.player.slow - dt);
    this.player.blockCooldown = Math.max(0, this.player.blockCooldown - dt);
    this.player.guardFlash = Math.max(0, this.player.guardFlash - dt);
    this.player.damageFlash = Math.max(0, this.player.damageFlash - dt);
    if (this.player.clashStun <= 0) this.player.attacking = Math.max(0, this.player.attacking - dt);
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
    this.updateGuardVisual(elapsed);
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
    if (!this.player.grounded) this.airRushTowardBoss(type);
    this.audio.playerAttack(type);
    this.hitboxes.push({
      type,
      time: type === "heavy" ? this.weapon.heavyDuration * 0.52 : this.weapon.lightDuration * 0.52,
      delay: type === "heavy" ? this.weapon.heavyDelay : this.weapon.lightDelay,
      damage: type === "heavy" ? this.weapon.heavyDamage : this.weapon.lightDamage
    });
    this.setMessage(type === "heavy" ? "Heavy swing committed." : "Quick cut.");
  }

  airRushTowardBoss(type) {
    const toBoss = this.boss.position.clone().sub(this.player.position).setY(0);
    if (toBoss.lengthSq() < 0.001) return;
    const distance = toBoss.length();
    const force = type === "heavy" ? 22 : 16;
    this.player.knockback.addScaledVector(toBoss.normalize(), Math.min(force, distance * 2.2));
    this.player.verticalVelocity = Math.max(this.player.verticalVelocity, -0.18);
    this.player.airHeight = Math.max(this.player.airHeight, 0.08);
    this.setMessage("Aerial rush.");
  }

  releaseWeaponSpecial(chargeTime) {
    const charge = clamp(chargeTime / 1.6, 0.2, 1);
    if (this.weapon.special === "flame") {
      this.castPlayerFlameLine(charge);
      return;
    }
    if (this.weapon.special === "needle") {
      this.castPlayerNeedles(charge);
      this.tryRaiseBossShieldSoon();
      return;
    }
    this.castPlayerSunSlash(charge);
  }

  playerForward() {
    return new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing)).normalize();
  }

  castPlayerFlameLine(charge) {
    const forward = this.playerForward();
    const count = 5 + Math.floor(charge * 10);
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.95 + charge * 0.55, 0.16, 1.05),
        new THREE.MeshBasicMaterial({ color: 0xff2d18, transparent: true, opacity: 0.82 })
      );
      mesh.position.copy(this.player.position).addScaledVector(forward, 1.3 + i * 0.92);
      mesh.position.y = 0.12;
      mesh.rotation.y = this.player.facing;
      this.enableBloom(mesh);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        direction: forward.clone(),
        speed: 5.2 + charge * 2,
        life: 0.45 + charge * 0.2,
        damage: 0.35 + charge * 0.55,
        owner: "player",
        playerSpecial: "flame",
        spin: 0,
        flameLine: true
      });
    }
    this.audio.fireAttack();
    this.setMessage("Cinder line released.");
  }

  castPlayerNeedles(charge) {
    const forward = this.playerForward();
    const count = 1 + Math.floor(charge * 5);
    for (let i = 0; i < count; i += 1) {
      const angle = (i - (count - 1) / 2) * 0.045;
      const direction = forward.clone().applyAxisAngle(UP, angle).normalize();
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({
          color: 0x55caff,
          emissive: 0x168cff,
          emissiveIntensity: 2.6,
          roughness: 0.28
        })
      );
      mesh.position.copy(this.player.position).add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(direction, 0.9);
      this.enableBloom(mesh);
      this.pushProjectile({
        mesh,
        direction,
        speed: 18 + charge * 6,
        life: 2.8,
        damage: 4,
        spin: 12,
        owner: "player",
        playerSpecial: "needle",
        pingPong: true,
        reflects: 0
      });
    }
    this.audio.projectileSpawn("ice");
    this.setMessage(count === 1 ? "Azure needle fired." : `${count} azure needles fired.`);
  }

  castPlayerSunSlash(charge) {
    const forward = this.playerForward();
    const center = this.player.position.clone().addScaledVector(forward, 1.35 + charge * 0.55);
    center.y = 1.0;
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.1 + charge * 0.55, 0.055, 8, 48, Math.PI * 1.25),
      new THREE.MeshBasicMaterial({ color: 0xffea64, transparent: true, opacity: 0.86 })
    );
    mesh.position.copy(center);
    mesh.rotation.set(Math.PI / 2, 0, this.player.facing - Math.PI / 2);
    this.enableBloom(mesh);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      direction: forward,
      speed: 0,
      life: 0.22,
      damage: 18 + charge * 24,
      owner: "player",
      playerSpecial: "slash",
      slashRadius: 2.0 + charge * 1.2,
      hit: false
    });
    this.audio.playerAttack("light");
    this.setMessage("Sun Fang arc.");
  }

  projectileTouchesBossShield(projectile) {
    if (this.boss.shield <= 0 || projectile.owner !== "player") return false;
    const shieldCenter = this.boss.position.clone().add(new THREE.Vector3(0, 1.55, 0));
    const radius = projectile.playerSpecial === "slash" ? 4.1 : 3.35;
    return projectile.mesh.position.distanceTo(shieldCenter) < radius;
  }

  blockPlayerProjectileWithShield(projectile) {
    this.boss.shieldHits += 1;
    if (this.boss.shieldHits >= BOSS_SHIELD_BREAK_HITS) {
      projectile.life = 0;
      this.breakBossShield();
      this.damageBossFromProjectile(projectile, "shieldBreak");
      this.spawnParticles(projectile.mesh.position.clone(), 22, 0xf2fdff);
      this.setMessage("The mirror shield shatters. The spell punches through.");
      return;
    }

    if (projectile.playerSpecial !== "needle") {
      projectile.life = 0;
      this.spawnParticles(projectile.mesh.position.clone(), 14, projectile.playerSpecial === "flame" ? 0xff3b1f : 0xffea64);
      this.shake = Math.max(this.shake, 0.12);
      this.audio.clank();
      this.setMessage(`The mirror shield cracks (${this.boss.shieldHits}/${BOSS_SHIELD_BREAK_HITS}).`);
      return;
    }

    projectile.owner = "boss";
    projectile.deflected = false;
    projectile.life = 3.2;
    projectile.reflects = (projectile.reflects || 0) + 1;
    projectile.damage = this.getPingPongDamage(projectile);
    projectile.speed = Math.max(projectile.speed + 1.8, 17 + projectile.reflects * 1.4);
    projectile.direction.copy(
      this.player.position.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(projectile.mesh.position).normalize()
    );
    this.updatePingPongProjectileVisual(projectile);
    this.spawnParticles(projectile.mesh.position.clone(), 10, 0x55caff);
    this.shake = Math.max(this.shake, 0.16);
    this.audio.clank();
    this.setMessage(projectile.reflects >= 4 ? "The needle is becoming unstable." : `The shield returns the needle (${this.boss.shieldHits}/${BOSS_SHIELD_BREAK_HITS}).`);
  }

  getProjectileDamage(projectile) {
    return Math.max(1, projectile.damage || (projectile.playerSpecial === "deflect" ? 18 : 12));
  }

  damageBossFromProjectile(projectile, fallbackType = "special") {
    const type = projectile.playerSpecial || fallbackType;
    this.damageBoss(this.getProjectileDamage(projectile), type);
    if (type === "flame") this.audio.fireImpact();
  }

  deflectPingPongProjectile(projectile) {
    projectile.owner = "player";
    projectile.life = 3.2;
    projectile.reflects = (projectile.reflects || 0) + 1;
    projectile.damage = this.getPingPongDamage(projectile);
    projectile.speed = Math.max(projectile.speed + 1.8, 18 + projectile.reflects * 1.5);
    projectile.direction.copy(
      this.boss.position.clone().add(new THREE.Vector3(0, 1.3, 0)).sub(projectile.mesh.position).normalize()
    );
    this.updatePingPongProjectileVisual(projectile);
    this.spawnParticles(projectile.mesh.position.clone(), 12, 0x55caff);
    this.triggerSlowMo(0.28, 0.24);
    this.setMessage(projectile.reflects >= 4 ? "Supercharged needle returned." : "Needle returned.");
  }

  getPingPongDamage(projectile) {
    return Math.min(54, 8 + (projectile.reflects || 0) * 7);
  }

  updatePingPongProjectileVisual(projectile) {
    const power = clamp((projectile.reflects || 0) / 6, 0, 1);
    const color = new THREE.Color(0x55caff).lerp(new THREE.Color(0xf2fdff), power);
    const emissive = new THREE.Color(0x168cff).lerp(new THREE.Color(0xdff8ff), power);
    projectile.mesh.material.color.copy(color);
    projectile.mesh.material.emissive?.copy(emissive);
    if (projectile.mesh.material.emissiveIntensity !== undefined) {
      projectile.mesh.material.emissiveIntensity = 2.6 + power * 2.2;
    }
    projectile.mesh.scale.setScalar(1 + (projectile.reflects || 0) * 0.18);
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
      const charge = clamp(this.player.charging / 1.6, 0, 1);
      const colors = this.getWeaponChargeColors();
      const bladeColor = new THREE.Color(colors.dark).lerp(new THREE.Color(colors.light), charge);
      blade.material.color.copy(bladeColor);
      blade.material.emissive.copy(bladeColor);
      blade.material.emissiveIntensity = pulse;
      for (const object of this.player.group.children) {
        if (object.material?.emissive && object.name !== "blade" && this.player.damageFlash <= 0 && this.player.clashStun <= 0) {
          object.material.emissive.copy(bladeColor);
          object.material.emissiveIntensity = 0.25;
        }
      }
    } else {
      blade.material.color.set(blade.userData.baseColor);
      blade.material.emissive.set(blade.userData.baseEmissive);
      blade.material.emissiveIntensity = 0;
      if (this.player.damageFlash <= 0 && this.player.clashStun <= 0) {
        for (const object of this.player.group.children) {
          if (object.material?.emissive && object.name !== "blade") {
            object.material.emissive.set(0x000000);
            object.material.emissiveIntensity = 0;
          }
        }
      }
    }
  }

  getWeaponChargeColors() {
    if (this.weapon.special === "flame") return { dark: 0x5c0000, light: 0xff2d24 };
    if (this.weapon.special === "needle") return { dark: 0x052a75, light: 0x55caff };
    return { dark: 0x6a5200, light: 0xffea64 };
  }

  updateHitboxes(dt) {
    for (const hitbox of this.hitboxes) {
      hitbox.delay -= dt;
      if (hitbox.delay <= 0 && !hitbox.done) {
        const reach = hitbox.type === "heavy" ? this.weapon.heavyReach : this.weapon.reach;
        if (this.resolveAttackClash(reach)) {
          hitbox.done = true;
          continue;
        }
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

  isBossPhysicalThreat() {
    return [ATTACK.SLAM, ATTACK.DASH_SLAM, ATTACK.STAFF, ATTACK.LEAP].includes(this.boss.state);
  }

  resolveAttackClash(reach, allowAfterBossHit = false) {
    if (!this.isBossPhysicalThreat() || (!allowAfterBossHit && this.boss.attackHit) || this.boss.phaseTransition > 0) return false;
    const swordBox = this.getSwordBox(0.75);
    const threatBox = this.getCurrentBossThreatBox(reach);
    if (!swordBox.intersectsBox(threatBox)) return false;

    this.player.clashStun = 0.72;
    this.boss.clashStun = 0.56;
    this.boss.attackHit = true;
    this.player.attacking = 0;
    this.player.attackCooldown = Math.max(this.player.attackCooldown, 0.34);
    this.boss.stateTime = Math.min(this.boss.stateTime, 0.35);
    this.spawnClashBurst(threatBox.getCenter(new THREE.Vector3()));
    this.triggerSlowMo(0.34, 0.2);
    this.audio.clank();
    this.shake = Math.max(this.shake, 0.42);
    this.setMessage("Clash. Both fighters recoil.");
    return true;
  }

  getCurrentBossThreatBox(extraReach = 0) {
    if (this.boss.state === ATTACK.STAFF) {
      const staff = this.boss.group.getObjectByName("bossStaff");
      if (staff) return new THREE.Box3().setFromObject(staff).expandByScalar(0.88);
    }
    const box = this.getBossBox();
    const reach = this.boss.state === ATTACK.DASH_SLAM ? 2.5 : this.boss.state === ATTACK.LEAP ? 3.2 : 1.8;
    return box.expandByScalar(Math.max(reach, extraReach * 0.35));
  }

  spawnClashBurst(position) {
    this.spawnParticles(position.clone(), 28, 0xd7ecff);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.045, 8, 54),
      new THREE.MeshBasicMaterial({ color: 0xf8fbff, transparent: true, opacity: 0.9 })
    );
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    this.enableBloom(ring);
    this.scene.add(ring);
    this.particles.push({ mesh: ring, velocity: new THREE.Vector3(), life: 0.32, maxLife: 0.32 });
  }

  triggerSlowMo(duration = 0.3, scale = 0.22) {
    this.slowMo = Math.max(this.slowMo, duration);
    this.slowMoScale = Math.min(this.slowMoScale, scale);
    window.setTimeout(() => {
      if (this.slowMo <= 0) this.slowMoScale = 1;
    }, duration * 1000 + 40);
  }

  getBossDamageMultiplier() {
    if (this.boss.finalFrenzy) return 1.22;
    const multipliers = [0, 0.45, 0.55, 0.65, 0.82, 1];
    return multipliers[this.boss.phase] || 0.7;
  }

  startFinalFrenzyCharge() {
    if (this.boss.finalFrenzyTriggered) return;
    this.boss.finalFrenzyTriggered = true;
    this.boss.finalFrenzyCharge = 4;
    this.boss.phaseTransition = Math.max(this.boss.phaseTransition, 4);
    this.boss.state = "idle";
    this.boss.stateTime = 0;
    this.boss.stagger = 0;
    this.boss.knockback.set(0, 0, 0);
    this.boss.shield = 0;
    this.boss.shieldWarn = 0;
    this.combo = [];
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.comboRecovery = 0;
    this.audio.powerCharge(4);
    this.shake = Math.max(this.shake, 0.65);
    this.groundShake = Math.max(this.groundShake, 0.6);
    this.setMessage("At death's edge, the Warlock becomes untouchable.");
  }

  damageBoss(amount, type) {
    if (this.boss.phaseTransition > 0 || this.boss.finalFrenzyCharge > 0) {
      this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0)), 8, 0xff5b3a);
      this.setMessage("The Warlock is changing. Steel cannot reach him.");
      return;
    }
    if (this.boss.stagger > 0) amount *= 1.15;
    amount *= 0.58;
    let hpDamage = amount;
    if (this.boss.guardHp > 0) {
      const shieldDamage = Math.min(this.boss.guardHp, amount);
      this.boss.guardHp = Math.max(0, this.boss.guardHp - shieldDamage);
      hpDamage = Math.max(0, amount - shieldDamage);
      if (this.boss.guardHp > 0) {
        this.setMessage("The Warlock's shield absorbs the hit.");
      } else {
        this.setMessage("The Warlock's shield breaks.");
        this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 32, 0x55caff);
        this.shake = Math.max(this.shake, 0.36);
      }
    }
    const finalThreshold = BOSS.maxHp * 0.1;
    if (!this.boss.finalFrenzyTriggered && this.boss.hp > finalThreshold && hpDamage > 0 && this.boss.hp - hpDamage <= finalThreshold) {
      this.boss.hp = finalThreshold;
      this.startFinalFrenzyCharge();
    } else {
      this.boss.hp = Math.max(0, this.boss.hp - hpDamage);
    }
    this.boss.flash = 0.16;
    if (type === "heavy") this.audio.heavyHit();
    else this.audio.lightHit();
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0)), type === "heavy" ? 16 : 9, 0xff5b3a);
    const away = this.boss.position.clone().sub(this.player.position).setY(0);
    if (away.lengthSq() > 0.001) {
      away.normalize();
      const force = type === "flame" ? 3.8 : type === "heavy" ? 8.5 : type === "deflect" ? 10 : 4.8;
      this.boss.knockback.addScaledVector(away, force);
    }
    if (!this.player.grounded && (type === "light" || type === "heavy")) {
      this.handleAerialMeleeHit();
    }
    this.shake = Math.max(this.shake, type === "heavy" || type === "deflect" || type === "flame" ? 0.42 : 0.22);
    this.updateBossStage();
    if (this.boss.hp <= 0 && this.boss.finalFrenzyTriggered) this.endFight("victory");
  }

  handleAerialMeleeHit() {
    const away = this.player.position.clone().sub(this.boss.position).setY(0);
    if (away.lengthSq() < 0.001) away.set(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    away.normalize();
    this.player.knockback.addScaledVector(away, 13);
    this.player.verticalVelocity = Math.max(this.player.verticalVelocity, -0.08);
    this.player.airHeight = Math.max(this.player.airHeight, 0.12);
    this.player.grounded = false;
    this.player.attackCooldown = Math.min(this.player.attackCooldown, 0.16);
    this.player.stamina = Math.min(PLAYER.maxStamina, this.player.stamina + 8);
    this.spawnParticles(this.player.position.clone().add(new THREE.Vector3(0, 1.05, 0)), 10, 0xd7ecff);
    this.setMessage("Air hit. Recoil and re-engage.");
    if (
      this.boss.phase >= 2 &&
      this.boss.state === "idle" &&
      this.boss.phaseTransition <= 0 &&
      this.boss.finalFrenzyCharge <= 0 &&
      Math.random() < 0.46
    ) {
      this.startAntiAirBlast();
    }
  }

  startAntiAirBlast() {
    this.combo = [];
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.comboRecovery = 0.85;
    this.startBossPrimitive(ATTACK.DOME_BLAST, this.player.position.distanceTo(this.boss.position));
    this.boss.antiAirBlast = true;
    this.boss.stateTime = Math.min(this.boss.stateTime, 1.45);
    this.shake = Math.max(this.shake, 0.28);
    this.setMessage("The Warlock counters the air with a blast.");
  }

  updateBossStage() {
    const nextStage = getBossStage({
      hp: this.boss.hp,
      maxHp: BOSS.maxHp,
      shield: this.boss.guardHp,
      maxShield: BOSS.maxShield
    });
    if (nextStage === this.boss.phase) return;
    const previous = this.boss.phase;
    this.boss.phase = nextStage;
    this.boss.flash = Math.max(this.boss.flash, 1.2);

    if (previous < 3 && nextStage >= 3) {
      this.startRedAwakening();
      return;
    }
    if (nextStage === 2) this.setMessage("The Warlock's first ward cracks. He quickens.");
    if (nextStage === 4) this.setMessage("The Warlock floods the ruins with projectiles.");
    if (nextStage === 5) this.setMessage("The Warlock rushes in. Parry or be broken.");
  }

  startRedAwakening() {
    this.boss.phaseTransition = 2.2;
    this.boss.flash = 3.2;
    this.boss.state = "idle";
    this.boss.stateTime = 0;
    this.boss.knockback.set(0, 0, 0);
    this.boss.shield = 0;
    this.boss.shieldWarn = 0;
    this.combo = [];
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.comboRecovery = 0.4;
    this.audio.setPhaseTwo();
    this.audio.powerCharge(2.6);
    this.shake = Math.max(this.shake, 0.5);
    this.groundShake = Math.max(this.groundShake, 0.45);
    this.setMessage("The ward dies. The Warlock burns red.");
  }

  tryRaiseBossShieldSoon(warnTime = 0.35) {
    if (this.boss.shield > 0 || this.boss.shieldCooldown > 0 || this.boss.stagger > 0 || this.ended) return;
    this.boss.shieldWarn = warnTime;
    this.setMessage("The Warlock reaches for a mirror shield.");
  }

  activateBossShield() {
    if (this.boss.shieldCooldown > 0 || this.boss.shield > 0) return;
    this.boss.shield = 9.5;
    this.boss.shieldHits = 0;
    this.boss.shieldWarn = 0;
    this.shake = Math.max(this.shake, 0.16);
    this.audio.parry();
    this.setMessage("Mirror shield raised.");
  }

  breakBossShield() {
    this.boss.shield = 0;
    this.boss.shieldCooldown = 7.5;
    this.boss.shieldHits = 0;
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 34, 0x55caff);
    this.audio.clank();
    this.shake = Math.max(this.shake, 0.42);
    this.setMessage("The mirror shield shatters.");
  }

  updateBossShield(dt) {
    this.boss.shieldCooldown = Math.max(0, this.boss.shieldCooldown - dt);
    if (this.boss.shieldWarn > 0) {
      this.boss.shieldWarn -= dt;
      if (this.boss.shieldWarn <= 0) this.activateBossShield();
    }
    if (this.boss.shield > 0) {
      this.boss.shield -= dt;
      if (this.boss.shield <= 0) {
        this.boss.shield = 0;
        this.boss.shieldCooldown = 7.5;
      }
    }

    const shield = this.boss.group?.getObjectByName("bossShield");
    if (!shield) return;
    const active = this.boss.shield > 0 || this.boss.shieldWarn > 0;
    shield.visible = active;
    if (!active) return;
    const pulse = 0.82 + Math.sin(this.clock.elapsedTime * 12) * 0.08;
    shield.material.opacity = this.boss.shield > 0 ? pulse : 0.38;
    shield.scale.setScalar(this.boss.shield > 0 ? 1 : 0.42 + (1 - this.boss.shieldWarn / 0.35) * 0.58);
  }

  updateBoss(dt, elapsed) {
    this.updateBossStage();
    const baseTuning = getBossTuning(this.boss.phase);
    const tuning = this.boss.finalFrenzy
      ? { ...baseTuning, movementSpeed: baseTuning.movementSpeed * 1.18, dashSpeed: baseTuning.dashSpeed * 1.25, turnSpeed: baseTuning.turnSpeed * 1.12 }
      : baseTuning;
    const toPlayer = this.player.position.clone().sub(this.boss.position);
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    this.boss.group.rotation.y = approachAngle(this.boss.group.rotation.y, targetYaw, dt * tuning.turnSpeed);
    this.boss.group.position.copy(this.boss.position);
    this.boss.group.position.y = this.boss.leapHeight + Math.sin(elapsed * 2.2) * 0.08;
    this.updateBossLimbAnimation(dt, elapsed, toPlayer.length());
    this.updateBossShield(dt);

    this.updateBossFlash(dt);
    if (this.boss.finalFrenzyCharge > 0) {
      this.boss.finalFrenzyCharge = Math.max(0, this.boss.finalFrenzyCharge - dt);
      this.boss.phaseTransition = this.boss.finalFrenzyCharge;
      this.boss.group.scale.setScalar(1.08 + Math.sin(elapsed * 22) * 0.08);
      this.groundShake = Math.max(this.groundShake, 0.35 + (1 - this.boss.finalFrenzyCharge / 4) * 0.35);
      this.spawnFinalFrenzyAura(dt);
      if (this.boss.finalFrenzyCharge <= 0) {
        this.boss.phaseTransition = 0;
        this.boss.finalFrenzy = true;
        this.boss.group.scale.setScalar(1);
        this.combo = [
          { attack: ATTACK.SLAM, gap: 0.04 },
          { attack: ATTACK.STAFF, gap: 0.04 },
          { attack: ATTACK.SLAM, gap: 0.04 },
          { attack: ATTACK.RAPID_FIRE, gap: 0.06 }
        ];
        this.comboIndex = 0;
        this.comboTimer = 0;
        this.comboRecovery = 0;
        this.shake = Math.max(this.shake, 0.9);
        this.setMessage("Final ten percent. He only knows the charge.");
      }
      return;
    }
    if (this.boss.phaseTransition > 0) {
      this.boss.phaseTransition = Math.max(0, this.boss.phaseTransition - dt);
      this.boss.group.scale.setScalar(1 + Math.sin(elapsed * 18) * 0.05 + (this.boss.phaseTransition / 3.2) * 0.18);
      this.spawnPhaseTransitionSparks(dt);
      if (this.boss.phaseTransition <= 0) {
        this.boss.group.scale.setScalar(1);
        this.setMessage("The red stage begins.");
      }
      return;
    }
    if (this.boss.clashStun > 0) {
      this.boss.clashStun = Math.max(0, this.boss.clashStun - dt);
      this.boss.group.scale.setScalar(1 + Math.sin(elapsed * 24) * 0.04);
      return;
    }
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

    this.boss.moveDashCooldown = Math.max(0, this.boss.moveDashCooldown - dt);
    if (this.boss.moveDashTime > 0) {
      this.updateBossMovementDash(dt, tuning);
      return;
    }

    const dist = Math.max(0.001, toPlayer.length());
    const pendingAttack = this.combo[this.comboIndex]?.attack;
    const approachRange = this.getBossApproachRange(pendingAttack);
    if (this.shouldBossMovementDash(dist, approachRange)) {
      this.startBossMovementDash(toPlayer, tuning);
      return;
    }
    if (dist > approachRange) {
      const approachBoost = this.isBossPositionedAttack(pendingAttack) ? 1.65 : 1.18;
      this.boss.position.addScaledVector(toPlayer.normalize(), tuning.movementSpeed * approachBoost * dt);
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

  shouldBossMovementDash(dist, approachRange) {
    if (this.boss.moveDashCooldown > 0 || this.boss.phaseTransition > 0 || this.boss.finalFrenzyCharge > 0) return false;
    const threshold = this.boss.phase >= 4 ? approachRange + 2.4 : approachRange + 3.8;
    if (dist < threshold) return false;
    if (this.boss.finalFrenzy) return true;
    return Math.random() < (this.boss.phase >= 4 ? 0.18 : 0.1);
  }

  startBossMovementDash(toPlayer, tuning) {
    const direction = toPlayer.clone().setY(0);
    if (direction.lengthSq() < 0.001) return;
    direction.normalize();
    const sidestep = new THREE.Vector3(direction.z, 0, -direction.x).multiplyScalar(randomBetween(-0.22, 0.22));
    this.boss.moveDashDirection.copy(direction.add(sidestep).normalize());
    this.boss.moveDashTime = this.boss.phase >= 4 ? 0.22 : 0.18;
    this.boss.moveDashCooldown = randomBetween(0.42, this.boss.phase >= 4 ? 0.72 : 1.05);
    this.boss.dashTravel = 0;
    this.shake = Math.max(this.shake, 0.08);
    if (this.boss.phase >= 4) this.groundShake = Math.max(this.groundShake, 0.1);
    this.setMessage("The Warlock rushes in.");
  }

  updateBossMovementDash(dt, tuning) {
    const speed = tuning.dashSpeed * (this.boss.finalFrenzy ? 0.95 : 0.72);
    const step = speed * dt;
    this.boss.dashTravel += step;
    this.boss.position.addScaledVector(this.boss.moveDashDirection, step);
    this.boss.position.x = clamp(this.boss.position.x, -ARENA.halfSize + 2, ARENA.halfSize - 2);
    this.boss.position.z = clamp(this.boss.position.z, -ARENA.halfSize + 2, ARENA.halfSize - 2);
    this.boss.group.position.copy(this.boss.position);
    this.boss.group.rotation.z = Math.sin(this.clock.elapsedTime * 24) * 0.08;
    this.boss.group.scale.setScalar(1.03 + Math.sin(this.clock.elapsedTime * 18) * 0.03);
    this.boss.moveDashTime = Math.max(0, this.boss.moveDashTime - dt);
    if (this.boss.moveDashTime <= 0) {
      this.boss.group.rotation.z = 0;
      this.boss.group.scale.setScalar(1);
    }
  }

  updateBossFlash(dt) {
    this.boss.flash = Math.max(0, this.boss.flash - dt);
    const flashing = this.boss.flash > 0;
    const white = this.boss.stagger > 0;
    for (const part of this.boss.group.userData.flashParts || []) {
      if (white) part.material.color.set(0xf6f1e7);
      else if (flashing) part.material.color.set(this.boss.phase >= 3 ? 0x9d2218 : 0x6e352f);
      else part.material.color.set(part.userData.baseColor);
      if (part.material.emissive) {
        if (this.boss.phase >= 3) {
          const pulse = 0.45 + Math.sin(this.clock.elapsedTime * 5) * 0.2 + (this.boss.phaseTransition > 0 ? 0.8 : 0);
          part.material.emissive.set(0x8f1208);
          part.material.emissiveIntensity = pulse;
        } else {
          part.material.emissive.set(0x000000);
          part.material.emissiveIntensity = 0;
        }
      }
    }
  }

  spawnPhaseTransitionSparks(dt) {
    if (Math.random() > dt * 18) return;
    this.spawnParticles(
      this.boss.position.clone().add(new THREE.Vector3(randomBetween(-0.8, 0.8), randomBetween(0.6, 2.7), randomBetween(-0.8, 0.8))),
      2,
      0xff3b1f
    );
  }

  spawnFinalFrenzyAura(dt) {
    if (Math.random() > dt * 42) return;
    this.spawnParticles(
      this.boss.position.clone().add(new THREE.Vector3(randomBetween(-1.2, 1.2), randomBetween(0.25, 3.3), randomBetween(-1.2, 1.2))),
      3,
      Math.random() < 0.5 ? 0xff2d18 : 0xffa11f
    );
  }

  chooseBossAttack(dist) {
    const step = this.combo[this.comboIndex];
    if (!step) {
      this.combo = [];
      const tuning = getBossTuning(this.boss.phase);
      this.comboRecovery = randomBetween(tuning.comboRecovery[0], tuning.comboRecovery[1]);
      return;
    }
    const approachRange = this.getBossApproachRange(step.attack);
    if (dist > approachRange + 0.15) {
      this.comboTimer = 0.08;
      return;
    }
    this.startBossPrimitive(step.attack, dist);
    this.comboIndex += 1;
    this.comboTimer = step.gap;
    if (this.comboIndex >= this.combo.length) {
      this.combo = [];
      const tuning = getBossTuning(this.boss.phase);
      this.comboRecovery = randomBetween(tuning.comboRecovery[0], tuning.comboRecovery[1]);
    }
    this.boss.attackHit = false;
  }

  isBossPositionedAttack(attack) {
    return [ATTACK.SLAM, ATTACK.DASH_SLAM, ATTACK.STAFF].includes(attack);
  }

  getBossApproachRange(attack) {
    if (attack === ATTACK.SLAM) return 3.15;
    if (attack === ATTACK.STAFF) return 4.15;
    if (attack === ATTACK.DASH_SLAM) return 4.7;
    return 4.4;
  }

  buildCombo() {
    const combo = buildBossCombo({ phase: this.boss.phase, lastComboName: this.lastComboName });
    this.lastComboName = combo.name;
    return combo.steps;
  }

  startBossPrimitive(attack, dist) {
    const tuning = getBossTuning(this.boss.phase);
    const phaseTwo = this.boss.phase >= 4;
    const telegraph = tuning.telegraph;
    this.boss.state = attack;
    this.boss.attackHit = false;
    this.boss.tripleShots = 0;
    this.boss.rapidShots = 0;
    this.boss.rapidTimer = 0;
    this.boss.dashTravel = 0;
    this.boss.antiAirBlast = false;
    if (attack === ATTACK.SLAM) this.boss.stateTime = (telegraph + 0.38) * tuning.attackTimeScale;
    if (attack === ATTACK.PROJECTILE) this.boss.stateTime = (telegraph + 0.2) * tuning.attackTimeScale;
    if (attack === ATTACK.SPREAD) this.boss.stateTime = (telegraph + 0.2) * tuning.attackTimeScale;
    if (attack === ATTACK.SWEEP) this.boss.stateTime = (telegraph + 0.7) * tuning.attackTimeScale;
    if (attack === ATTACK.STAFF) this.boss.stateTime = (phaseTwo ? 0.76 : 0.94) * tuning.attackTimeScale;
    if (attack === ATTACK.DASH_SLAM) {
      this.boss.stateTime = (telegraph + 0.42) * tuning.attackTimeScale;
      const targetPillar = this.pickPillarTarget();
      const target = targetPillar && Math.random() < 0.2 ? targetPillar.position : this.player.position;
      this.boss.dashDirection.copy(target).sub(this.boss.position).setY(0).normalize();
    }
    if (attack === ATTACK.TRIPLE_PROJECTILE) this.boss.stateTime = (telegraph + 0.9) * tuning.attackTimeScale;
    if (attack === ATTACK.BARRAGE) this.boss.stateTime = (phaseTwo ? 1.65 : 1.9) * tuning.attackTimeScale;
    if (attack === ATTACK.RAPID_FIRE) {
      this.boss.stateTime = 4.05;
      this.setMessage("The Warlock's staff begins to scream.");
    }
    if (attack === ATTACK.DOME_BLAST) {
      this.boss.stateTime = 2.45;
      this.castDomeCharge();
      this.setMessage("The air bends inward.");
    }
    if (attack === ATTACK.LEAP) {
      this.boss.stateTime = (phaseTwo ? 1.72 : 1.95) * tuning.attackTimeScale;
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
    if (attack === ATTACK.SLAM && dist > BOSS.meleeRange + 2) this.boss.stateTime += 0.2 * tuning.attackTimeScale;
    this.showBossAttackIndicator(attack, this.boss.stateTime);
  }

  showBossAttackIndicator(attack, duration = 0.6) {
    let mesh;
    if (attack === ATTACK.STAFF || attack === ATTACK.DASH_SLAM || attack === ATTACK.SLAM || attack === ATTACK.LEAP) {
      const width = attack === ATTACK.STAFF ? 1.2 : attack === ATTACK.DASH_SLAM ? 2.4 : 3.4;
      const depth = attack === ATTACK.STAFF ? 5.2 : attack === ATTACK.DASH_SLAM ? 5.6 : 3.6;
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshBasicMaterial({
          color: attack === ATTACK.STAFF ? 0xffd36b : 0xff4a2a,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(this.boss.position).addScaledVector(this.bossForward(), depth * 0.38);
      mesh.position.y = 0.045;
      mesh.rotation.z = -this.boss.group.rotation.y;
    }
    if (!mesh) return;
    this.enableBloom(mesh);
    this.scene.add(mesh);
    this.attackIndicators.push({ mesh, attack, life: Math.min(duration, 1.1), maxLife: Math.min(duration, 1.1) });
  }

  updateAttackIndicators(dt) {
    for (const indicator of this.attackIndicators) {
      indicator.life -= dt;
      const fade = Math.max(0, indicator.life / indicator.maxLife);
      indicator.mesh.material.opacity = 0.34 * fade + Math.sin(this.clock.elapsedTime * 24) * 0.04;
      if (indicator.attack === ATTACK.STAFF || indicator.attack === ATTACK.DASH_SLAM || indicator.attack === ATTACK.SLAM || indicator.attack === ATTACK.LEAP) {
        const depth = indicator.attack === ATTACK.STAFF ? 5.2 : indicator.attack === ATTACK.DASH_SLAM ? 5.6 : 3.6;
        indicator.mesh.position.copy(this.boss.position).addScaledVector(this.bossForward(), depth * 0.38);
        indicator.mesh.position.y = 0.045;
        indicator.mesh.rotation.z = -this.boss.group.rotation.y;
      }
    }
    this.attackIndicators = this.attackIndicators.filter((indicator) => {
      if (indicator.life > 0) return true;
      this.scene.remove(indicator.mesh);
      indicator.mesh.geometry?.dispose?.();
      indicator.mesh.material?.dispose?.();
      return false;
    });
  }

  bossForward() {
    return new THREE.Vector3(Math.sin(this.boss.group.rotation.y), 0, Math.cos(this.boss.group.rotation.y)).normalize();
  }

  updateBossAttack(dt) {
    const total = getBossAttackTotal(this.boss.state, this.boss.phase);
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
      if (progress < RAPID_FIRE_TELL) {
        this.animateRapidFireTell(progress / RAPID_FIRE_TELL, dt);
        this.groundShake = Math.max(this.groundShake, progress * 0.18);
        return;
      }
      this.animateRapidFireTell(1, dt, true);
      this.boss.rapidTimer -= dt;
      while (this.boss.rapidShots < RAPID_FIRE_SHOTS && this.boss.rapidTimer <= 0) {
        this.boss.rapidShots += 1;
        this.boss.rapidTimer += RAPID_FIRE_INTERVAL;
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
      const tuning = getBossTuning(this.boss.phase);
      const frenzyBoost = this.boss.finalFrenzy ? 1.25 : 1;
      const rising = progress < 0.38;
      const leapArc = rising
        ? easeOut(progress / 0.38)
        : Math.pow(Math.max(0, 1 - (progress - 0.38) / 0.62), 2.35);
      this.boss.leapHeight = leapArc * 24;
      this.boss.group.rotation.x = -leapArc * 0.42;
      if (progress > 0.12 && progress < 0.5) {
        this.boss.position.addScaledVector(this.boss.dashDirection, tuning.leapSpeed * frenzyBoost * dt);
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
      const tuning = getBossTuning(this.boss.phase);
      const frenzyBoost = this.boss.finalFrenzy ? 1.35 : 1;
      if (progress > 0.18 && progress < 0.46) {
        const maxDashTravel = this.boss.phase >= 5 ? 3.8 : this.boss.phase >= 4 ? 3.2 : 2.65;
        const step = Math.min(tuning.dashSpeed * frenzyBoost * dt, Math.max(0, maxDashTravel - this.boss.dashTravel));
        this.boss.dashTravel += step;
        this.boss.position.addScaledVector(this.boss.dashDirection, step);
        this.boss.position.x = clamp(this.boss.position.x, -ARENA.halfSize + 2, ARENA.halfSize - 2);
        this.boss.position.z = clamp(this.boss.position.z, -ARENA.halfSize + 2, ARENA.halfSize - 2);
      }
      if (progress > 0.5 && !this.boss.attackHit) {
        this.boss.attackHit = true;
        this.resolveBossSlam(true);
      }
    }
    if (this.boss.state === ATTACK.TRIPLE_PROJECTILE) {
      const thresholds = [0.38, 0.58, 0.78];
      thresholds.forEach((threshold, index) => {
        if (progress > threshold && this.boss.tripleShots === index) {
          this.boss.tripleShots += 1;
          this.castOrb(PROJECTILE_TYPES[4]);
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
    this.audio.enemyPhysical();
    this.shake = Math.max(this.shake, 0.34);
    this.groundShake = Math.max(this.groundShake, 0.38);
    this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 14, 0xff8a35);
    if (this.player.attacking > 0 && this.resolveAttackClash(this.weapon.heavyReach, true)) return;
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

  animateRapidFireTell(progress, dt, firing = false) {
    const staff = this.boss.group.getObjectByName("bossStaff");
    const rightArm = this.boss.group.getObjectByName("bossRightArm");
    if (!staff) return;
    const charge = easeOut(progress);
    staff.position.set(1.12 - charge * 0.2, 1.82 + charge * 0.28, -0.05 - charge * 0.35);
    staff.rotation.x = -0.42 - charge * 0.55 + (firing ? Math.sin(this.clock.elapsedTime * 34) * 0.08 : 0);
    staff.rotation.z = -0.36 + charge * 0.22;
    if (staff.material?.emissive) {
      staff.material.emissive.set(0x55caff);
      staff.material.emissiveIntensity = 0.7 + charge * 2.8 + (firing ? Math.sin(this.clock.elapsedTime * 28) * 0.45 : 0);
    }
    if (rightArm) {
      rightArm.rotation.x = -0.35 - charge * 0.6;
      rightArm.rotation.z = -0.2 + charge * 0.18;
    }
    const sparkChance = firing ? dt * 35 : dt * 18;
    if (Math.random() < sparkChance) {
      this.spawnParticles(
        this.boss.position.clone().add(new THREE.Vector3(0.9, 2.85 + charge * 0.45, 0.25)),
        firing ? 3 : 2,
        firing ? 0xf2fdff : 0x55caff
      );
    }
  }

  resetBossWeaponPose() {
    const staff = this.boss.group.getObjectByName("bossStaff");
    const rightArm = this.boss.group.getObjectByName("bossRightArm");
    if (staff) {
      staff.position.set(1.25, 1.75, 0.1);
      staff.rotation.set(0, 0, -0.08);
      if (staff.material?.emissive) {
        staff.material.emissive.set(0x000000);
        staff.material.emissiveIntensity = 0;
      }
    }
    if (rightArm) {
      rightArm.position.set(0.82, 1.95, 0.02);
      rightArm.rotation.set(0, 0, -0.18);
    }
  }

  resolveStaffStrike() {
    this.audio.enemyPhysical();
    const staff = this.boss.group.getObjectByName("bossStaff");
    const staffBox = staff ? new THREE.Box3().setFromObject(staff).expandByScalar(0.62) : this.getBossBox().expandByScalar(1.2);
    const staffCenter = staffBox.getCenter(new THREE.Vector3());
    this.spawnParticles(staffCenter.clone(), 18, 0xffd36b);
    this.shake = Math.max(this.shake, 0.26);
    this.groundShake = Math.max(this.groundShake, 0.3);
    if (this.player.attacking > 0 && this.resolveAttackClash(this.weapon.heavyReach, true)) return;
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

  pushProjectile({
    mesh,
    direction,
    speed,
    life = 4,
    damage = BOSS.projectileDamage,
    spin = 0,
    homing = false,
    turnRate = 0,
    owner = "boss",
    playerSpecial = "",
    pingPong = false,
    reflects = 0,
    slow = false
  }) {
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      direction,
      speed,
      life,
      damage,
      spin,
      homing,
      turnRate,
      owner,
      playerSpecial,
      pingPong,
      reflects,
      slow
    });
  }

  castRapidProjectile(shot) {
    const tuning = getBossTuning(this.boss.phase);
    const seekerType = PROJECTILE_TYPES.find((projectile) => projectile.homing);
    const type = shot % 5 === 0 && seekerType ? seekerType : PROJECTILE_TYPES[(shot - 1) % PROJECTILE_TYPES.length];
    const soundKind = type.name === "blue star" || type.name === "frost bead" || type.homing ? "ice" : "fire";
    this.audio.projectileSpawn(soundKind, {
      volume: type.homing ? 0.26 : 0.13,
      rate: type.homing ? 1.18 : 1.42,
      detune: (shot % 12) * 18
    });
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
      speed: type.speed + randomBetween(-0.8, 2.8) + tuning.projectileSpeedBonus + 1.4,
      life: type.homing ? 4.8 : 3.2,
      damage: type.damage,
      spin: randomBetween(5, 13),
      homing: Boolean(type.homing),
      turnRate: type.homing ? 2.45 : 0,
      slow: type.name === "blue star" || type.name === "frost bead"
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
      this.damagePlayer(this.boss.antiAirBlast ? Math.round(PLAYER.maxHp * 0.35) : 32, "dome");
      this.setMessage(this.boss.antiAirBlast ? "Anti-air blast. The sky throws you back." : "The dome detonates.");
    }
    this.boss.antiAirBlast = false;
    this.breakPillarsInBox(this.getBossBox().expandByScalar(radius));
  }

  castOrb(type = PROJECTILE_TYPES[0]) {
    const tuning = getBossTuning(this.boss.phase);
    this.groundShake = Math.max(this.groundShake, 0.16);
    this.audio.projectileSpawn(type.name === "blue star" || type.name === "frost bead" ? "ice" : "fire", { volume: 0.68, rate: 0.98 });
    const start = this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    const direction = this.player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(start).normalize();
    const mesh = this.makeProjectileMesh(type);
    mesh.position.copy(start);
    const light = new THREE.PointLight(type.emissive || 0xff4a20, 1.1, 6);
    mesh.add(light);
    this.pushProjectile({
      mesh,
      direction,
      speed: 6.2 + tuning.projectileSpeedBonus + (type.name === "blue star" ? 4 : 0),
      life: 4,
      damage: BOSS.projectileDamage,
      spin: 5,
      slow: type.name === "blue star" || type.name === "frost bead"
    });
  }

  castSpread() {
    const tuning = getBossTuning(this.boss.phase);
    const start = this.boss.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    const base = this.player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(start).normalize();
    for (const angle of [-Math.PI / 12, 0, Math.PI / 12]) {
      const direction = base.clone().applyAxisAngle(UP, angle).normalize();
      const type = PROJECTILE_TYPES[1 + Math.floor(Math.random() * 4)];
      this.audio.projectileSpawn(type.name === "blue star" || type.name === "frost bead" ? "ice" : "fire", {
        volume: 0.32,
        rate: 1.04 + Math.random() * 0.16
      });
      const mesh = this.makeProjectileMesh(type);
      mesh.position.copy(start);
      this.pushProjectile({
        mesh,
        direction,
        speed: 6.8 + tuning.spreadSpeedBonus,
        life: 4,
        damage: type.damage,
        spin: 7,
        slow: type.name === "blue star" || type.name === "frost bead"
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
      this.audio.projectileSpawn(i % 4 === 0 ? "ice" : "fire", {
        volume: 0.15,
        rate: 1.18 + Math.random() * 0.28,
        detune: i * 13
      });
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
    this.audio.projectileSpawn("ice", { volume: 0.56, rate: 0.82, detune: -180 });
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

        if (projectile.owner === "player") {
          if (projectile.flameLine) {
            this.reflectProjectilesWithFlame(projectileBox);
          }

          if (this.projectileTouchesBossShield(projectile)) {
            this.blockPlayerProjectileWithShield(projectile);
            continue;
          }

          if (projectile.playerSpecial === "slash") {
            projectile.mesh.material.opacity = Math.max(0, projectile.life / 0.22) * 0.86;
            if (!projectile.hit && this.boss.position.distanceTo(projectile.mesh.position) < projectile.slashRadius + BOSS.radius) {
              projectile.hit = true;
              this.damageBoss(projectile.damage, "special");
            }
            continue;
          }

          if (projectileBox.intersectsBox(this.getBossBox())) {
            projectile.life = 0;
            this.damageBossFromProjectile(projectile, "special");
            this.spawnParticles(projectile.mesh.position.clone(), 12, projectile.playerSpecial === "needle" ? 0x55caff : 0xff5b3a);
          }
          continue;
        }

        if (projectile.deflected && projectileBox.intersectsBox(this.getBossBox())) {
          projectile.life = 0;
          this.damageBossFromProjectile(projectile, "deflect");
          this.spawnParticles(projectile.mesh.position.clone(), 18, 0xffe66d);
          this.setMessage("The Warlock eats his own flame.");
        } else if (projectile.pingPong && this.canDeflectProjectile(projectileBox)) {
          this.deflectPingPongProjectile(projectile);
        } else if (!projectile.deflected && this.canDeflectProjectile(projectileBox)) {
          this.deflectProjectile(projectile);
        } else if (projectileBox.intersectsBox(this.getPlayerBox())) {
          projectile.life = 0;
          if (projectile.slow) {
            this.player.slow = Math.max(this.player.slow, 2.4);
          }
          this.damagePlayer(projectile.damage || BOSS.projectileDamage, projectile.slow ? "slowProjectile" : "projectile");
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
    amount *= this.getBossDamageMultiplier();
    if (this.player.blockHeld && this.player.stamina > 0) {
      if (this.player.blockTime <= 0.3) {
        this.boss.stagger = BOSS.staggerTime * 1.65;
        this.boss.flash = this.boss.stagger;
        const away = this.boss.position.clone().sub(this.player.position).setY(0);
        if (away.lengthSq() > 0.001) this.boss.knockback.addScaledVector(away.normalize(), 16);
        if (this.boss.guardHp > 0) this.boss.guardHp = Math.max(0, this.boss.guardHp - 12);
        else this.boss.hp = Math.max(0, this.boss.hp - 18);
        const finalThreshold = BOSS.maxHp * 0.1;
        if (!this.boss.finalFrenzyTriggered && this.boss.hp <= finalThreshold) {
          this.boss.hp = finalThreshold;
          this.startFinalFrenzyCharge();
        }
        this.updateBossStage();
        this.shake = 0.62;
        this.groundShake = Math.max(this.groundShake, 0.52);
        this.player.guardFlash = 0.4;
        this.parryTint = 0.34;
        this.chromaticFlash = Math.max(this.chromaticFlash, 0.36);
        this.audio.parry();
        this.spawnGuardImpact();
        this.spawnParticles(this.boss.position.clone().add(new THREE.Vector3(0, 1.45, 0)), 24, 0xd7ecff);
        this.triggerSlowMo(0.42, 0.18);
        this.setMessage("Crushing parry. The Warlock reels.");
        if (this.boss.hp <= 0) this.endFight("victory");
        return;
      }
      const staminaLoss = Math.max(28, amount * 2.4);
      this.player.stamina = Math.max(0, this.player.stamina - staminaLoss);
      this.player.guardFlash = 0.22;
      this.audio.clank();
      this.spawnGuardImpact();
      if (this.player.stamina > 0) {
        this.shake = Math.max(this.shake, 0.24);
        this.chromaticFlash = Math.max(this.chromaticFlash, 0.08);
        this.setMessage("Blocked. Your stamina buckles.");
        return;
      }
      this.player.blockHeld = false;
      this.player.blockCooldown = Math.max(this.player.blockCooldown, PLAYER.blockCooldown);
      amount *= 0.75;
      this.shake = Math.max(this.shake, 0.36);
      this.setMessage("Guard broken.");
    } else {
      this.setMessage(
        source === "projectile"
          ? "Arcane fire finds you."
          : source === "slowProjectile"
            ? "Blue frost drags at your legs."
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
    const force = source === "dome" ? 100 : source === "projectile" || source === "slowProjectile" ? 13 : source === "aoe" ? 18 : 22;
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

  updateHealthPickups(dt, elapsed) {
    for (const pickup of this.healthPickups) {
      if (pickup.used) continue;
      pickup.mesh.rotation.y += dt * 1.8;
      pickup.mesh.position.y = pickup.mesh.userData.baseY + Math.sin(elapsed * 3.8 + pickup.mesh.position.x) * 0.08;
      pickup.mesh.scale.setScalar(1 + Math.sin(elapsed * 5 + pickup.mesh.position.z) * 0.06);
      if (this.player.hp < PLAYER.maxHp && this.player.position.distanceTo(pickup.mesh.position) < 1.25) {
        pickup.used = true;
        pickup.mesh.visible = false;
        this.player.hp = Math.min(PLAYER.maxHp, this.player.hp + pickup.heal);
        this.player.damageFlash = 0;
        this.chromaticFlash = Math.max(this.chromaticFlash, 0.12);
        this.spawnParticles(pickup.mesh.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 18, 0xff5f82);
        this.audio.victory();
        this.setMessage("Health restored.");
      }
    }
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

  reflectProjectilesWithFlame(flameBox) {
    for (const projectile of this.projectiles) {
      if (projectile.owner === "player" || projectile.deflected || projectile.life <= 0) continue;
      if (projectile.aoe || projectile.dome || projectile.chargeDome || projectile.sky || projectile.chain) continue;
      const box = new THREE.Box3().setFromObject(projectile.mesh).expandByScalar(0.28);
      if (!flameBox.intersectsBox(box)) continue;
      this.deflectProjectile(projectile, {
        message: "Cinder wave reflects the spell.",
        color: 0xff7a35,
        emissive: 0xff2d18,
        slowMo: 0.2
      });
      projectile.damage = Math.max(projectile.damage || BOSS.projectileDamage, 18);
      this.spawnParticles(projectile.mesh.position.clone(), 14, 0xff7a35);
    }
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

  deflectProjectile(projectile, options = {}) {
    const direction = this.boss.position.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(projectile.mesh.position).normalize();
    projectile.owner = "player";
    projectile.playerSpecial = "deflect";
    this.tryRaiseBossShieldSoon(0.12);
    projectile.direction.copy(direction);
    projectile.speed = Math.max(projectile.speed, 12.5);
    projectile.life = Math.max(projectile.life, 1.2);
    projectile.deflected = true;
    projectile.homing = false;
    projectile.turnRate = 0;
    projectile.mesh.material.color.set(options.color || 0xfff08a);
    projectile.mesh.material.emissive?.set(options.emissive || 0xffd34f);
    this.spawnParticles(projectile.mesh.position.clone(), 12, options.color || 0xffe66d);
    this.triggerSlowMo(options.slowMo || 0.3, 0.22);
    this.setMessage(options.message || "Fireball turned back.");
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

  updateGuardVisual(elapsed) {
    const guard = this.player.group.getObjectByName("playerGuard");
    if (!guard) return;
    const active = this.player.blockHeld || this.player.guardFlash > 0;
    guard.visible = active;
    if (!active) {
      guard.material.opacity = 0;
      return;
    }

    const flash = this.player.guardFlash > 0 ? this.player.guardFlash / 0.22 : 0;
    const pulse = 0.08 + Math.sin(elapsed * 18) * 0.025;
    guard.material.opacity = clamp(0.24 + pulse + flash * 0.62, 0, 0.92);
    guard.scale.setScalar(1 + flash * 0.38 + (this.player.blockHeld ? Math.sin(elapsed * 12) * 0.04 : 0));
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
      } else if (this.player.clashStun > 0) {
        object.material.emissive.set(0xf6fbff);
        object.material.emissiveIntensity = 0.9 + Math.sin(this.clock.elapsedTime * 28) * 0.28;
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

  spawnGuardImpact() {
    const forward = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    const origin = this.player.position.clone().addScaledVector(forward, 0.85).add(new THREE.Vector3(0, 1.05, 0));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.035, 8, 38),
      new THREE.MeshBasicMaterial({ color: 0xd7ecff, transparent: true, opacity: 0.92 })
    );
    ring.position.copy(origin);
    ring.rotation.set(Math.PI / 2, 0, -this.player.facing);
    this.enableBloom(ring);
    this.scene.add(ring);
    this.particles.push({
      mesh: ring,
      velocity: new THREE.Vector3(),
      life: 0.22,
      maxLife: 0.22
    });
    this.spawnParticles(origin, 10, 0xd7ecff);
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
    if (this.bossShieldBar) {
      this.bossShieldBar.style.width = `${(this.boss.guardHp / BOSS.maxShield) * 100}%`;
    }
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
