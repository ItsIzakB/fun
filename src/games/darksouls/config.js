export const BOSS_NAME = "The Ashen Warlock";

export const PLAYER = {
  maxHp: 120,
  maxStamina: 100,
  speed: 6.4,
  dodgeSpeed: 15,
  dodgeTime: 0.42,
  invincibleTime: 0.42,
  lightDamage: 18,
  heavyDamage: 42,
  lightCost: 15,
  heavyCost: 30,
  dodgeCost: 25,
  blockStartCost: 32,
  blockCostPerSecond: 6,
  blockCooldown: 0.85,
  staminaRegen: 28,
  radius: 0.55
};

export const WEAPONS = {
  great: {
    label: "Cinder Greatblade",
    description: "Heavy reach with a charged red flame line that grows with the hold.",
    id: "great",
    special: "flame",
    bladeScale: 1.38,
    lightDamage: 24,
    heavyDamage: 52,
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
    label: "Azure Needle",
    description: "Balanced steel that releases fast blue bolts. Hold to fire more.",
    id: "arming",
    special: "needle",
    bladeScale: 1,
    lightDamage: 18,
    heavyDamage: 40,
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
    label: "Sun Fang",
    description: "Fast short blade with a charged golden close-range slash.",
    id: "short",
    special: "slash",
    bladeScale: 0.68,
    lightDamage: 12,
    heavyDamage: 28,
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
  maxShield: 150,
  radius: 1.15,
  meleeDamage: 18,
  projectileDamage: 8,
  meleeRange: 2.75,
  staggerTime: 1.5
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
