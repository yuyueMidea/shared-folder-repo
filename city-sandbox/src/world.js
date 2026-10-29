export const SIZE = 96;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function blocks(cx, cz) {
  const r = random(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 9173),
    out = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const w = 18 + r() * 13,
        d = 18 + r() * 13;
      out.push({
        x: cx * SIZE + 30 + i * 37,
        z: cz * SIZE + 30 + j * 37,
        w,
        d,
        h: 9 + r() * 42,
        color: Math.floor(r() * 5),
      });
    }
  return out;
}
export function circleBox(x, z, r, b) {
  const dx = x - clamp(x, b.x - b.w / 2, b.x + b.w / 2),
    dz = z - clamp(z, b.z - b.d / 2, b.z + b.d / 2);
  return dx * dx + dz * dz < r * r;
}
export function canStand(x, z, r = 0.5) {
  const cx = Math.floor(x / SIZE),
    cz = Math.floor(z / SIZE);
  for (let a = cx - 1; a <= cx + 1; a++)
    for (let b = cz - 1; b <= cz + 1; b++)
      for (const box of blocks(a, b)) if (circleBox(x, z, r, box)) return false;
  return true;
}
export function moveWithCollision(p, dx, dz, r) {
  let hit = false;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
  for (let i = 0; i < steps; i++) {
    if (canStand(p.x + dx / steps, p.z, r)) p.x += dx / steps;
    else hit = true;
    if (canStand(p.x, p.z + dz / steps, r)) p.z += dz / steps;
    else hit = true;
  }
  return hit;
}
export const TARGETS = [
  { x: 106, z: 8, name: "河畔咖啡" },
  { x: 202, z: 104, name: "中央广场" },
  { x: 10, z: 200, name: "北城工作室" },
];
export function validSave(s) {
  return (
    s?.version === 1 &&
    ["x", "z", "yaw", "carX", "carZ", "carYaw", "money", "deliveries"].every(
      (k) => Number.isFinite(s[k]),
    ) &&
    [s.x, s.z, s.carX, s.carZ].every((n) => Math.abs(n) < 1e6) &&
    Number.isInteger(s.deliveries) &&
    s.deliveries >= 0 &&
    s.money >= 0 &&
    typeof s.driving === "boolean"
  );
}
