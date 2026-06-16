export const BOSS_NAME = "The Ashen Warlock";

export const PLAYER = {
  maxHp: 120,
  maxStamina: 100,
  speed: 7.2,
  dodgeSpeed: 15,
  dodgeTime: 0.42,
  invincibleTime: 0.42,
  lightDamage: 30,
  heavyDamage: 70,
  lightCost: 15,
  heavyCost: 30,
  dodgeCost: 25,
  blockCostPerSecond: 10,
  staminaRegen: 28,
  radius: 0.55
};

export const WEAPONS = {
  great: {
    label: "Great blade",
    description: "Long reach and brutal impact, but slow and costly.",
    bladeScale: 1.38,
    lightDamage: 42,
    heavyDamage: 92,
    lightCost: 22,
    heavyCost: 42,
    lightDuration: 0.46,
    heavyDuration: 0.72,
    lightCooldown: 0.62,
    heavyCooldown: 1.05,
    lightDelay: 0.2,
    heavyDelay: 0.38,
    reach: 3.05,
    heavyReach: 3.75
  },
  arming: {
    label: "Arming sword",
    description: "Balanced reach, speed, stamina cost, and damage.",
    bladeScale: 1,
    lightDamage: 30,
    heavyDamage: 70,
    lightCost: 15,
    heavyCost: 30,
    lightDuration: 0.32,
    heavyDuration: 0.52,
    lightCooldown: 0.42,
    heavyCooldown: 0.82,
    lightDelay: 0.12,
    heavyDelay: 0.26,
    reach: 2.35,
    heavyReach: 3
  },
  short: {
    label: "Short fang",
    description: "Fast and cheap, but demands close range.",
    bladeScale: 0.68,
    lightDamage: 20,
    heavyDamage: 48,
    lightCost: 9,
    heavyCost: 20,
    lightDuration: 0.22,
    heavyDuration: 0.38,
    lightCooldown: 0.28,
    heavyCooldown: 0.56,
    lightDelay: 0.07,
    heavyDelay: 0.18,
    reach: 1.72,
    heavyReach: 2.25
  }
};

export const BOSS = {
  maxHp: 520,
  radius: 1.15,
  meleeDamage: 25,
  projectileDamage: 15,
  meleeRange: 2.25,
  staggerTime: 1.5,
  phaseTwoThreshold: 0.5
};

export const ARENA = {
  halfSize: 72,
  wallHeight: 4.2
};

export const CONTROLS = [
  ["WASD", "Move"],
  ["Drag", "Orbit camera"],
  ["Tab", "Lock on"],
  ["Space", "Jump"],
  ["Q / E", "Roll left / right"],
  ["LMB", "Light attack"],
  ["Hold LMB", "Heavy attack"],
  ["RMB", "Block / parry"]
];
