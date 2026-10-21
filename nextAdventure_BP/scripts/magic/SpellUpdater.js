// 発射後の魔術の更新：移動・命中・射程（草案 12 / 16）
import { EntityDamageCause } from "@minecraft/server";
import { moveSpell, killSpell } from "./SpellRegistry.js";
import { effectiveStats } from "./Weakening.js";
import { Fx } from "./SpellEffects.js";
import { wallAt } from "./WallSystem.js";
import { onWallHit } from "./SpellInteractions.js";
import { add, mul } from "./vec.js";

const IGNORE_TYPES = ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:thrown_trident"];

/** 線分上の点 p と、エンティティの体（足元〜頭の縦線）との距離 */
function distanceToBody(p, entity) {
  const feet = entity.location;
  let headY = feet.y + 1.6;
  try { headY = entity.getHeadLocation().y; } catch {}
  const y = Math.max(feet.y + 0.1, Math.min(headY, p.y));
  return Math.hypot(p.x - feet.x, p.y - y, p.z - feet.z);
}

/** 移動区間内で最初に当たるエンティティ */
function findEntityHit(spell, from, step) {
  const mid = add(from, mul(spell.dir, step / 2));
  let candidates;
  try {
    candidates = spell.dimension.getEntities({
      location: mid,
      maxDistance: step / 2 + spell.radius + 2.5,
      excludeFamilies: ["na_spell"],
      excludeTypes: IGNORE_TYPES,
    });
  } catch {
    return undefined;
  }
  // 術者自身と、術者がモブなら同じ種類の仲間には当てない
  const casterType = spell.caster?.isValid ? spell.caster.typeId : undefined;
  const others = candidates.filter(
    (e) => e.id !== spell.casterId && !(casterType && casterType !== "minecraft:player" && e.typeId === casterType)
  );
  if (!others.length) return undefined;

  const samples = Math.max(1, Math.ceil(step / 0.4));
  for (let i = 0; i <= samples; i++) {
    const p = add(from, mul(spell.dir, (step * i) / samples));
    for (const e of others) {
      if (distanceToBody(p, e) <= spell.radius + 0.35) return { entity: e, at: p, travel: (step * i) / samples };
    }
  }
  return undefined;
}

export function damageEntity(target, amount, burnSeconds, spell, knock = 0) {
  if (amount <= 0) return;
  try {
    const opts = { cause: EntityDamageCause.fire };
    if (spell.caster?.isValid) opts.damagingEntity = spell.caster;
    target.applyDamage(amount, opts);
  } catch {}
  if (burnSeconds > 0) {
    try { target.setOnFire(burnSeconds, true); } catch {}
  }
  if (knock > 0) {
    try {
      target.applyKnockback({ x: spell.dir.x * knock, z: spell.dir.z * knock }, 0.12);
    } catch {
      try { target.applyKnockback(spell.dir.x, spell.dir.z, knock, 0.12); } catch {}
    }
  }
}

function impact(spell, at, stats) {
  Fx.impact(spell.dimension, at, spell.size);
  killSpell(spell);
}

export function updateFlying(spell) {
  const stats = effectiveStats(spell);
  if (stats.power <= 0 || spell.force <= 0) {
    Fx.fade(spell.dimension, spell.pos);
    killSpell(spell);
    return;
  }

  const remaining = stats.range - spell.traveled;
  if (remaining <= 0) {
    Fx.fade(spell.dimension, spell.pos);
    killSpell(spell);
    return;
  }
  const step = Math.min(stats.speed, remaining);
  const from = spell.pos;

  // ブロック
  let blockHit;
  try {
    blockHit = spell.dimension.getBlockFromRay(from, spell.dir, {
      maxDistance: step + spell.radius * 0.5,
      includeLiquidBlocks: true,
      includePassableBlocks: false,
    });
  } catch {}
  const blockDist = blockHit
    ? Math.hypot(
        blockHit.block.location.x + blockHit.faceLocation.x - from.x,
        blockHit.block.location.y + blockHit.faceLocation.y - from.y,
        blockHit.block.location.z + blockHit.faceLocation.z - from.z
      )
    : Infinity;

  // エンティティ
  const hit = findEntityHit(spell, from, Math.min(step, blockDist));
  if (hit) {
    damageEntity(hit.entity, stats.power, spell.def.burnSeconds, spell, 0.35 + spell.size * 0.3);
    impact(spell, hit.at, stats);
    return;
  }
  if (blockHit && blockDist <= step + spell.radius * 0.5) {
    const at = {
      x: blockHit.block.location.x + blockHit.faceLocation.x,
      y: blockHit.block.location.y + blockHit.faceLocation.y,
      z: blockHit.block.location.z + blockHit.faceLocation.z,
    };
    // 土壁などの魔術の壁 → 作用量の削り合い
    const wall = wallAt(spell.dimension.id, blockHit.block.location);
    if (wall) {
      onWallHit(spell, wall, at);
      return; // 貫通した場合も、今回はブロックに阻まれて止まる
    }
    let liquid = false;
    try { liquid = blockHit.block.isLiquid; } catch {}
    if (liquid && spell.def.attribute === "fire") {
      Fx.extinguish(spell.dimension, at);
      killSpell(spell);
    } else {
      impact(spell, at, stats);
    }
    return;
  }

  // 移動
  spell.prevPos = from;
  const next = add(from, mul(spell.dir, step));
  spell.traveled += step;
  if (!moveSpell(spell, next)) {
    killSpell(spell);
    return;
  }
  Fx.trail(spell.dimension, next, spell.size);
}
