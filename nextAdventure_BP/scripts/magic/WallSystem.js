// 土壁（土属性・単純魔術）
// ・詠唱中は、壁が立つ場所に土ぼこりで目印を出す
// ・発動すると、地面から壁がせり上がる（下の段から順に）
// ・壁は作用量を持ち、ぶつかった魔術と削り合う。半分を切るとひび割れ、0で崩れる
// ・時間が来たら崩れる。セーブして読み込み直したときに残った壁も自然に崩れる
import { system } from "@minecraft/server";
import { killSpell } from "./SpellRegistry.js";
import { remainingRatio } from "./Weakening.js";

export const WALL_BLOCK = "na:earth_wall";
export const WALL_BLOCK_CRACKED = "na:earth_wall_cracked";
const REPLACEABLE = new Set([
  "minecraft:air", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern",
  "minecraft:large_fern", "minecraft:snow_layer", "minecraft:deadbush", "minecraft:fire",
]);

/** "dim|x|y|z" -> 壁の魔術 */
const wallBlocks = new Map();
const key = (dimId, p) => `${dimId}|${p.x}|${p.y}|${p.z}`;

export function wallAt(dimId, loc) {
  const w = wallBlocks.get(key(dimId, { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) }));
  return w && w.phase === "wall" ? w : undefined;
}

export function isWallBlockActive(dimId, loc) {
  return wallBlocks.has(key(dimId, loc));
}

const FACE = {
  Up: { x: 0, y: 1, z: 0 }, Down: { x: 0, y: -1, z: 0 },
  North: { x: 0, y: 0, z: -1 }, South: { x: 0, y: 0, z: 1 },
  East: { x: 1, y: 0, z: 0 }, West: { x: -1, y: 0, z: 0 },
};

function isOpen(dim, p) {
  try {
    const b = dim.getBlock(p);
    return !!b && REPLACEABLE.has(b.typeId);
  } catch {
    return false;
  }
}

/** 溜め具合 k(0..1) から壁の大きさ */
export function wallSize(def, k) {
  return {
    width: def.wall.width + Math.round(def.charge.width * k),
    height: def.wall.height + Math.round(def.charge.height * k),
    seconds: def.wall.seconds * (1 + def.charge.seconds * k),
  };
}

/** 視線の先に立つ壁の位置を計算する */
export function planWall(caster, def, k) {
  const dim = caster.dimension;
  const head = caster.getHeadLocation();
  const v = caster.getViewDirection();
  let base;
  try {
    const hit = dim.getBlockFromRay(head, v, { maxDistance: def.reach, includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit) {
      const b = hit.block.location;
      const f = FACE[hit.face] ?? FACE.Up;
      base = { x: b.x + f.x, y: b.y + f.y, z: b.z + f.z };
    }
  } catch {}
  if (!base) {
    const d = Math.min(def.reach, 5);
    base = { x: Math.floor(head.x + v.x * d), y: Math.floor(head.y + v.y * d), z: Math.floor(head.z + v.z * d) };
  }
  // 地面まで下ろす（最大4段）
  for (let i = 0; i < 4 && isOpen(dim, { x: base.x, y: base.y - 1, z: base.z }); i++) base.y--;

  // 視線に垂直な向きに並べる
  const along = Math.abs(v.x) > Math.abs(v.z) ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const size = wallSize(def, k);
  const left = -Math.floor((size.width - 1) / 2);

  const feet = caster.location;
  const positions = [];
  for (let row = 0; row < size.height; row++) {
    for (let i = left; i < left + size.width; i++) {
      const p = { x: base.x + along.x * i, y: base.y + row, z: base.z + along.z * i };
      // 自分の体の中には立てない
      if (p.x === Math.floor(feet.x) && p.z === Math.floor(feet.z) && p.y >= Math.floor(feet.y) - 0 && p.y <= Math.floor(feet.y) + 1) continue;
      positions.push({ ...p, row });
    }
  }
  return { dim, base, positions, size };
}

/** 詠唱中の目印 */
export function previewWall(caster, def, k) {
  if (system.currentTick % 4 !== 0) return;
  const plan = planWall(caster, def, k);
  for (const p of plan.positions) {
    if (p.row !== 0 || !isOpen(plan.dim, p)) continue;
    try {
      plan.dim.spawnParticle("minecraft:falling_dust_gravel_particle", { x: p.x + 0.5, y: p.y + 0.2, z: p.z + 0.5 });
    } catch {}
  }
}

/** 発動：壁をせり上げる */
export function raiseWall(spell, caster, k) {
  const def = spell.def;
  const plan = planWall(caster, def, k);
  const dimId = plan.dim.id;
  const placeable = plan.positions.filter((p) => isOpen(plan.dim, p));
  if (!placeable.length) {
    sound(plan.dim, "dig.gravel", plan.base, 0.6, 0.8);
    killSpell(spell);
    return false;
  }

  spell.phase = "wall";
  spell.blocks = [];
  spell.cracked = false;
  spell.expiresAt = system.currentTick + Math.round(plan.size.seconds * 20);
  spell.pos = { x: plan.base.x + 0.5, y: plan.base.y + 1, z: plan.base.z + 0.5 };

  // 下の段から2tickおきに
  for (const p of placeable) {
    const k2 = key(dimId, p);
    wallBlocks.set(k2, spell);
    spell.blocks.push(p);
    system.runTimeout(() => {
      if (spell.phase !== "wall" || !isOpen(plan.dim, p)) return;
      try {
        plan.dim.setBlockType(p, spell.cracked ? WALL_BLOCK_CRACKED : WALL_BLOCK);
        plan.dim.spawnParticle("minecraft:falling_dust_gravel_particle", { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
      } catch {}
    }, 1 + p.row * 2);
  }
  sound(plan.dim, "dig.gravel", spell.pos, 1.0, 0.6);
  system.runTimeout(() => sound(plan.dim, "dig.stone", spell.pos, 0.8, 0.7), 3);
  return true;
}

/** ぶつかって作用量が変わったあと */
export function updateWallState(spell) {
  if (spell.phase !== "wall") return;
  if (spell.force <= 0) {
    crumble(spell);
    return;
  }
  if (!spell.cracked && remainingRatio(spell) <= 0.5) {
    spell.cracked = true;
    for (const p of spell.blocks) {
      try {
        const b = spell.dimension.getBlock(p);
        if (b?.typeId === WALL_BLOCK) b.setType(WALL_BLOCK_CRACKED);
      } catch {}
    }
    sound(spell.dimension, "dig.stone", spell.pos, 1.0, 0.5);
  }
}

export function crumble(spell) {
  if (spell.phase === "dead") return;
  const dim = spell.dimension;
  for (const p of spell.blocks ?? []) {
    wallBlocks.delete(key(dim.id, p));
    try {
      const b = dim.getBlock(p);
      if (b && (b.typeId === WALL_BLOCK || b.typeId === WALL_BLOCK_CRACKED)) {
        b.setType("minecraft:air");
        dim.spawnParticle("minecraft:falling_dust_gravel_particle", { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
      }
    } catch {}
  }
  sound(dim, "dig.gravel", spell.pos, 1.0, 0.8);
  killSpell(spell);
}

export function tickWalls(liveSpells) {
  const now = system.currentTick;
  for (const s of liveSpells.values()) {
    if (s.phase === "wall" && now >= s.expiresAt) crumble(s);
  }
}

/** ブロック側の定期処理：どの壁にも属していない土壁ブロックは崩す（読み込み直しで残ったもの） */
export const earthWallBlockComponent = {
  onTick(ev) {
    const { block, dimension } = ev;
    if (isWallBlockActive(dimension.id, block.location)) return;
    try {
      block.setType("minecraft:air");
      dimension.spawnParticle("minecraft:falling_dust_gravel_particle", {
        x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5,
      });
    } catch {}
  },
};

function sound(dim, id, loc, volume, pitch) {
  try { dim.playSound(id, loc, { volume, pitch }); } catch {}
}
