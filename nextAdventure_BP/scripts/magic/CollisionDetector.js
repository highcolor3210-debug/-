// 魔術同士の接触検出（草案 11.1 / 16）
// ・空間ハッシュで近いものだけ調べる（総当たりしない）
// ・1tickの移動を線分として扱い、すれ違いの見逃しを防ぐ
// ・接触し続けている間は再処理しない／一度離れてから再接触したら再処理
import { liveSpells } from "./SpellRegistry.js";

const CELL = 4;
let contacts = new Set();

function cellKey(dimId, x, y, z) {
  return `${dimId}|${x}|${y}|${z}`;
}

/** 1tick内での最接近距離 */
function closestApproach(a, b) {
  const a0 = a.prevPos ?? a.pos, b0 = b.prevPos ?? b.pos;
  const r0 = { x: a0.x - b0.x, y: a0.y - b0.y, z: a0.z - b0.z };
  const v = {
    x: (a.pos.x - a0.x) - (b.pos.x - b0.x),
    y: (a.pos.y - a0.y) - (b.pos.y - b0.y),
    z: (a.pos.z - a0.z) - (b.pos.z - b0.z),
  };
  const vv = v.x * v.x + v.y * v.y + v.z * v.z;
  let t = vv > 1e-9 ? -(r0.x * v.x + r0.y * v.y + r0.z * v.z) / vv : 0;
  t = Math.max(0, Math.min(1, t));
  return {
    d: Math.hypot(r0.x + v.x * t, r0.y + v.y * t, r0.z + v.z * t),
    at: {
      x: a0.x + (a.pos.x - a0.x) * t,
      y: a0.y + (a.pos.y - a0.y) * t,
      z: a0.z + (a.pos.z - a0.z) * t,
    },
  };
}

/** onContact(a, b, location) は新しい接触ごとに一度だけ呼ばれる */
export function detectCollisions(onContact) {
  const grid = new Map();
  // 壁はブロックとして当たるので、ここでは扱わない（SpellUpdater がブロック命中で処理）
  const movers = [...liveSpells.values()].filter((s) => s.def.behavior !== "wall");
  for (const s of movers) {
    const k = cellKey(s.dimension.id, Math.floor(s.pos.x / CELL), Math.floor(s.pos.y / CELL), Math.floor(s.pos.z / CELL));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(s);
  }

  const touching = new Set();
  for (const s of movers) {
    if (s.phase === "dead") continue;
    const cx = Math.floor(s.pos.x / CELL), cy = Math.floor(s.pos.y / CELL), cz = Math.floor(s.pos.z / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = grid.get(cellKey(s.dimension.id, cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const o of list) {
            if (o.id <= s.id || o.phase === "dead" || s.phase === "dead") continue;
            if (o.casterId === s.casterId) continue; // 自分の魔術同士はぶつけない
            const { d, at } = closestApproach(s, o);
            if (d > s.radius + o.radius) continue;
            const key = `${s.id}:${o.id}`;
            touching.add(key);
            if (!contacts.has(key)) onContact(s, o, at);
          }
        }
  }
  contacts = touching;
}
