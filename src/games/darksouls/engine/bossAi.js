import { ATTACK } from "./constants.js";
import { randomBetween } from "./math.js";

export function getBossStage({ hp, maxHp, shield, maxShield }) {
  if (shield > maxShield * 0.5) return 1;
  if (shield > 0) return 2;
  if (hp > maxHp * 0.5) return 3;
  if (hp > maxHp * 0.25) return 4;
  return 5;
}

export function getBossTuning(stage) {
  const tuning = {
    1: {
      movementSpeed: 1.6,
      turnSpeed: 4.2,
      comboRecovery: [0.85, 1.45],
      comboGap: [0.55, 1.05],
      telegraph: 0.54,
      projectileSpeedBonus: -2.1,
      spreadSpeedBonus: -1.4,
      dashSpeed: 15,
      leapSpeed: 22,
      attackTimeScale: 1.35,
      maxCombo: 2
    },
    2: {
      movementSpeed: 2.35,
      turnSpeed: 5.6,
      comboRecovery: [0.5, 0.95],
      comboGap: [0.34, 0.68],
      telegraph: 0.36,
      projectileSpeedBonus: -0.9,
      spreadSpeedBonus: -0.5,
      dashSpeed: 23,
      leapSpeed: 31,
      attackTimeScale: 1.15,
      maxCombo: 3
    },
    3: {
      movementSpeed: 3,
      turnSpeed: 7,
      comboRecovery: [0.26, 0.56],
      comboGap: [0.18, 0.42],
      telegraph: 0.25,
      projectileSpeedBonus: 0,
      spreadSpeedBonus: 0,
      dashSpeed: 30,
      leapSpeed: 42,
      attackTimeScale: 1,
      maxCombo: 4
    },
    4: {
      movementSpeed: 6,
      turnSpeed: 9,
      comboRecovery: [0.08, 0.28],
      comboGap: [0.06, 0.24],
      telegraph: 0.16,
      projectileSpeedBonus: 3,
      spreadSpeedBonus: 2.8,
      dashSpeed: 40,
      leapSpeed: 56,
      attackTimeScale: 0.82,
      maxCombo: 5
    },
    5: {
      movementSpeed: 7.8,
      turnSpeed: 11.5,
      comboRecovery: [0.04, 0.16],
      comboGap: [0.04, 0.14],
      telegraph: 0.12,
      projectileSpeedBonus: 1.2,
      spreadSpeedBonus: 1.2,
      dashSpeed: 58,
      leapSpeed: 68,
      attackTimeScale: 0.72,
      maxCombo: 6
    }
  };
  return tuning[stage] || tuning[1];
}

export function buildBossCombo({ phase, lastComboName = "" }) {
  const tuning = getBossTuning(phase);
  const late = phase >= 4;
  const desperate = phase >= 5;
  const shielded = phase < 3;
  const templates = desperate
    ? [
        { name: "p5-1", attacks: [ATTACK.RAPID_FIRE, ATTACK.SLAM, ATTACK.STAFF, ATTACK.SLAM, ATTACK.STAFF] },
        { name: "p5-2", attacks: [ATTACK.SLAM, ATTACK.TRIPLE_PROJECTILE, ATTACK.RAPID_FIRE, ATTACK.CHAIN, ATTACK.STAFF] },
        { name: "p5-3", attacks: [ATTACK.SLAM, ATTACK.RAPID_FIRE, ATTACK.STAFF, ATTACK.LEAP, ATTACK.SLAM] }
      ]
    : late
      ? [
        { name: "p2-1", attacks: [ATTACK.RAPID_FIRE, ATTACK.TRIPLE_PROJECTILE, ATTACK.SLAM, ATTACK.STAFF, ATTACK.SLAM] },
        { name: "p2-2", attacks: [ATTACK.SLAM, ATTACK.STAFF, ATTACK.SLAM, ATTACK.CHAIN, ATTACK.DOME_BLAST] },
        { name: "p2-3", attacks: [ATTACK.SPREAD, ATTACK.RAPID_FIRE, ATTACK.PROJECTILE, ATTACK.SLAM, ATTACK.LEAP, ATTACK.RAPID_FIRE] },
        { name: "p2-4", attacks: [ATTACK.STAFF, ATTACK.RAPID_FIRE, ATTACK.SLAM, ATTACK.STAFF, Math.random() < 0.5 ? ATTACK.SLAM : ATTACK.CHAIN] },
        { name: "p2-5", attacks: [ATTACK.BARRAGE, ATTACK.RAPID_FIRE, ATTACK.SPREAD, ATTACK.SLAM, ATTACK.STAFF, ATTACK.LEAP] }
      ]
    : shielded
      ? [
        { name: "shield-1", attacks: [ATTACK.TRIPLE_PROJECTILE, ATTACK.SLAM, ATTACK.STAFF] },
        { name: "shield-2", attacks: [ATTACK.SLAM, ATTACK.SPREAD, ATTACK.SLAM, ATTACK.STAFF] },
        { name: "shield-3", attacks: [ATTACK.SLAM, ATTACK.PROJECTILE, ATTACK.STAFF] },
        { name: "shield-4", attacks: [ATTACK.STAFF, ATTACK.SLAM, ATTACK.CHAIN] },
        { name: "shield-5", attacks: [ATTACK.SPREAD, ATTACK.STAFF, ATTACK.SLAM] }
      ]
      : [
        { name: "p3-1", attacks: [ATTACK.TRIPLE_PROJECTILE, ATTACK.RAPID_FIRE, ATTACK.SLAM, ATTACK.STAFF] },
        { name: "p3-2", attacks: [ATTACK.SLAM, ATTACK.SPREAD, ATTACK.RAPID_FIRE, ATTACK.STAFF] },
        { name: "p3-3", attacks: [ATTACK.SLAM, ATTACK.RAPID_FIRE, ATTACK.PROJECTILE, ATTACK.STAFF] },
        { name: "p3-4", attacks: [ATTACK.BARRAGE, ATTACK.SLAM, ATTACK.STAFF] },
        { name: "p3-5", attacks: [ATTACK.SPREAD, ATTACK.RAPID_FIRE, ATTACK.SLAM] }
      ];
  let options = templates.filter((template) => template.name !== lastComboName);
  if (options.length === 0) options = templates;

  const template = options[Math.floor(Math.random() * options.length)];
  const attacks = [...template.attacks];
  const targetCount = Math.floor(randomBetween(2, Math.min(tuning.maxCombo + 1, attacks.length + 1)));
  const steps = attacks.slice(0, targetCount).map((attack) => ({
    attack,
    gap: randomBetween(tuning.comboGap[0], tuning.comboGap[1])
  }));

  return { name: template.name, steps };
}

export function getBossAttackTotal(attack, phase) {
  const scale = getBossTuning(phase).attackTimeScale;
  if (attack === ATTACK.SWEEP) return 1.05 * scale;
  if (attack === ATTACK.RAPID_FIRE) return 4.05;
  if (attack === ATTACK.DOME_BLAST) return 2.45 * scale;
  if (attack === ATTACK.BARRAGE) return (phase >= 4 ? 1.65 : 1.9) * scale;
  if (attack === ATTACK.CHAIN) return 0.52 * scale;
  if (attack === ATTACK.LEAP) return (phase >= 4 ? 1.72 : 1.95) * scale;
  if (attack === ATTACK.STAFF) return (phase >= 4 ? 0.7 : 0.88) * scale;
  if (attack === ATTACK.DASH_SLAM) return (phase >= 4 ? 0.58 : 0.64) * scale;
  if (attack === ATTACK.SLAM) return (phase >= 4 ? 0.72 : 0.95) * scale;
  if (attack === ATTACK.TRIPLE_PROJECTILE) return (phase >= 4 ? 1.25 : 1.4) * scale;
  return (phase >= 4 ? 0.58 : 0.85) * scale;
}
