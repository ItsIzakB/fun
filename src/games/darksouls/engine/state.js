import * as THREE from "three";
import { BOSS, PLAYER } from "../config.js";

export function createPlayerState() {
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
    clashStun: 0,
    combo: 0,
    attackCooldown: 0,
    charging: 0,
    blockHeld: false,
    blockTime: 99,
    blockCooldown: 0,
    hitDone: false,
    heavyQueued: false,
    slow: 0,
    guardFlash: 0,
    damageFlash: 0,
    inputDir: new THREE.Vector3(0, 0, -1)
  };
}

export function createBossState() {
  return {
    group: null,
    position: new THREE.Vector3(0, 0, -10),
    knockback: new THREE.Vector3(),
    hp: BOSS.maxHp,
    guardHp: BOSS.maxShield,
    phase: 1,
    state: "idle",
    stateTime: 1.2,
    cooldown: 1,
    attackHit: false,
    tripleShots: 0,
    rapidShots: 0,
    rapidTimer: 0,
    dashDirection: new THREE.Vector3(),
    dashTravel: 0,
    moveDashTime: 0,
    moveDashCooldown: 0,
    moveDashDirection: new THREE.Vector3(),
    leapHeight: 0,
    leapFollowup: null,
    antiAirBlast: false,
    shield: 0,
    shieldCooldown: 0,
    shieldHits: 0,
    shieldWarn: 0,
    phaseTransition: 0,
    finalFrenzyTriggered: false,
    finalFrenzyCharge: 0,
    finalFrenzy: false,
    stagger: 0,
    clashStun: 0,
    flash: 0
  };
}
