// ベクトル小道具
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => len(sub(a, b));
export const norm = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
