import * as THREE from "three";

export const UP = new THREE.Vector3(0, 1, 0);
export const NON_BLOOM_MATERIAL = new THREE.MeshBasicMaterial({ color: "black" });
export const BLOOM_LAYER = 1;

export const ATTACK = {
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

export const PROJECTILE_TYPES = [
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
