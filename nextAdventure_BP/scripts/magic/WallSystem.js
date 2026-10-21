// 土壁（土属性・単純魔術）
// ・詠唱中は、壁が立つ場所に土ぼこりで目印を出す
// ・発動すると、地面から壁がせり上がる（下の段から順に）
// ・壁は作用量を持ち、ぶつかった魔術と削り合う。半分を切るとひび割れ、0で崩れる
// ・時間が来たら崩れる。立っている壁ブロックの位置はワールドに記録しておき、
//   セーブして読み込み直したときや、崩れる時にチャンクが読み込まれていなかったときも後で必ず消す
import { system, world } from "@minecraft/server";
import { killSpell } from "./SpellRegistry.js";
import { remainingRatio } from "./Weakening.js";
import { notify } from "./Notice.js";

export const WALL_BLOCK = "na:earth_wall";
export const WALL_BLOCK_CRACKED = "na:earth_wall_cracked";
// 土壁ブロックが置けなかったとき（ブロック定義が読み込まれていないなど）の代わり
const FALLBACK_BLOCK = "minecraft:coarse_dirt";
const WALL_TYPES = new Set([WALL_BLOCK, WALL_BLOCK_CRACKED, FALLBACK_BLOCK]);
const REPLACEABLE = new Set([
  "minecraft:air", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern",
  "minecraft:large_fern", "minecraft:snow_layer", "minecraft:deadbush", "minecraft:fire",
]);

/** "dim|x|y|z" -> 壁の魔術 */
const wallBlocks = new Map();
const key = (dimId, p) => `${dimId}|${p.x}|${p.y}|${p.z}`;
// API には x, y, z だけを渡す（row など余計なものが付いていると受け付けないことがある）
const xyz = (p) => ({ x: p.x, y: p.y, z: p.z });

// ---- 立っている壁ブロックの記録（ワールドに保存） ----
const KEY_STANDING = "na:standing_walls";
let standing; // key -> { d, x, y, z }

function standingWalls() {
  if (!standing) {
    standing = new Map();
    try {
      const raw = world.getDynamicProperty(KEY_STANDING);
      if (typeof raw === "string") for (const e of JSON.parse(raw)) standing.set(key(e.d, e), e);
    } catch {}
  }
  return standing;
}

function saveStanding() {
  try { world.setDynamicProperty(KEY_STANDING, JSON.stringify([...standingWalls().values()])); } catch {}
}

/** 壁ブロックを消す。消せた（またはもう壁ではない）なら true、チャンクが読み込まれていないなどで確かめられなければ false */
function removeWallBlock(dim, p) {
  let b;
  try { b = dim.getBlock(p); } catch { return false; }
  if (!b) return false;
  if (!WALL_TYPES.has(b.typeId)) return true;
  try {
    dim.setBlockType(p, "minecraft:air");
    dim.spawnParticle("minecraft:falling_dust_gravel_particle", { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
  } catch (e) {
    console.warn(`[nextAdventure] 土壁ブロックを消せない: ${e}`);
    return false;
  }
  return true;
}

/** どの壁にも属していない記録済みの壁ブロックを消す（読み込み時と、ときどき） */
export function cleanupStandingWalls() {
  const list = standingWalls();
  if (!list.size) return;
  let changed = false;
  for (const [k, e] of list) {
    if (wallBlocks.has(k)) continue; // まだ立っている壁
    let dim;
    try { dim = world.getDimension(e.d); } catch { continue; }
    if (removeWallBlock(dim, e)) {
      list.delete(k);
      changed = true;
    }
  }
  if (changed) saveStanding();
}

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
    const b = dim.getBlock(xyz(p));
    return !!b && REPLACEABLE.has(b.typeId);
  } catch {
    return false;
  }
}

/** 壁の大きさ（溜めはないので定義どおり） */
export function wallSize(def) {
  return { width: def.wall.width, height: def.wall.height, seconds: def.wall.seconds };
}

/** 視線の先に立つ壁の位置を計算する */
export function planWall(caster, def) {
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
  const size = wallSize(def);
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
export function previewWall(caster, def) {
  if (system.currentTick % 4 !== 0) return;
  const plan = planWall(caster, def);
  for (const p of plan.positions) {
    if (p.row !== 0 || !isOpen(plan.dim, p)) continue;
    try {
      plan.dim.spawnParticle("minecraft:falling_dust_gravel_particle", { x: p.x + 0.5, y: p.y + 0.2, z: p.z + 0.5 });
    } catch {}
  }
}

/** 発動：壁をせり上げる */
export function raiseWall(spell, caster) {
  const def = spell.def;
  const plan = planWall(caster, def);
  const dimId = plan.dim.id;
  const placeable = plan.positions.filter((p) => isOpen(plan.dim, p));
  if (!placeable.length) {
    sound(plan.dim, "dig.gravel", plan.base, 0.6, 0.8);
    if (caster.typeId === "minecraft:player") notify(caster, "§7ここには土壁を立てられない");
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
    const pos = xyz(p);
    wallBlocks.set(key(dimId, pos), spell);
    standingWalls().set(key(dimId, pos), { d: dimId, ...pos });
    spell.blocks.push(pos);
    system.runTimeout(() => {
      if (spell.phase !== "wall" || !isOpen(plan.dim, pos)) return;
      placeWallBlock(plan.dim, pos, spell.cracked ? WALL_BLOCK_CRACKED : WALL_BLOCK, caster);
      try {
        plan.dim.spawnParticle("minecraft:falling_dust_gravel_particle", { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });
      } catch {}
    }, 1 + p.row * 2);
  }
  saveStanding();
  sound(plan.dim, "dig.gravel", spell.pos, 1.0, 0.6);
  system.runTimeout(() => sound(plan.dim, "dig.stone", spell.pos, 0.8, 0.7), 3);
  return true;
}

let reportedFailure = false;

/** 土壁ブロックを置く。置けなければ代わりのブロックにして、理由を一度だけ知らせる */
function placeWallBlock(dim, pos, type, caster) {
  try {
    dim.setBlockType(pos, type);
    return;
  } catch (e) {
    console.warn(`[nextAdventure] 土壁ブロックを置けない (${type}): ${e}`);
    if (!reportedFailure) {
      reportedFailure = true;
      if (caster?.isValid) notify(caster, `§c土壁ブロックを置けない：${e}`, 100);
    }
  }
  try { dim.setBlockType(pos, FALLBACK_BLOCK); } catch {}
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
    const k = key(dim.id, p);
    wallBlocks.delete(k);
    // 消せなかったものは記録に残し、cleanupStandingWalls があとで消す
    if (removeWallBlock(dim, p)) standingWalls().delete(k);
  }
  saveStanding();
  sound(dim, "dig.gravel", spell.pos, 1.0, 0.8);
  killSpell(spell);
}

export function tickWalls(liveSpells) {
  const now = system.currentTick;
  for (const s of liveSpells.values()) {
    if (s.phase === "wall" && now >= s.expiresAt) crumble(s);
  }
  if (now % 100 === 0) cleanupStandingWalls();
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
