import * as THREE from "three";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function approachAngle(current, target, amount) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(delta, -amount, amount);
}

export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function easeOut(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

export function makeBox(w, h, d, color, roughness = 0.88) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 })
  );
}
