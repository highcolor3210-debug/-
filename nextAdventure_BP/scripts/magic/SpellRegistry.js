// 生きている魔術の管理（SpellData のインスタンス）
import { system } from "@minecraft/server";

export const SPELL_ENTITY = "na:spell";

let nextId = 1;
/** @type {Map<number, any>} */
export const liveSpells = new Map();

/**
 * 魔術インスタンスを作る（エンティティも出す）
 * phase: "forming"（詠唱・溜め中）→ "flying"（発射後）→ "dead"
 */
export function createSpell({ def, caster, dimension, location, traits }) {
  let entity;
  if (def.visual !== false) {
    try {
      entity = dimension.spawnEntity(SPELL_ENTITY, location);
      entity.setProperty("na:kind", def.kind);
      entity.setProperty("na:size", def.size.start);
    } catch (e) {
      console.warn(`[nextAdventure] spawn spell failed: ${e}`);
      return undefined;
    }
  }
  const spell = {
    id: nextId++,
    def,
    traits: traits ?? def.traits,
    caster,
    casterId: caster.id,
    dimension,
    entity,
    phase: "forming",
    pos: { ...location },
    dir: { x: 0, y: 0, z: 1 },
    size: def.size?.start ?? 0,
    radius: (def.size?.start ?? 0) * 0.5,
    spread: 1.0,          // 衝突で広がった分の当たり判定倍率
    forceMax: 0,
    force: 0,
    basePower: def.power,
    baseSpeed: def.speed,
    baseRange: def.range,
    traveled: 0,
    bornTick: system.currentTick,
  };
  liveSpells.set(spell.id, spell);
  return spell;
}

export function setSize(spell, size) {
  spell.size = size;
  spell.radius = size * 0.5 * spell.spread;
  if (!spell.entity) return;
  try { spell.entity.setProperty("na:size", Math.max(0.05, Math.min(4, size * spell.spread))); } catch {}
}

export function moveSpell(spell, pos) {
  spell.pos = pos;
  if (!spell.entity) return true;
  try {
    spell.entity.teleport(pos);
    return true;
  } catch {
    return false; // 読み込まれていない場所など
  }
}

export function killSpell(spell) {
  if (spell.phase === "dead") return;
  spell.phase = "dead";
  liveSpells.delete(spell.id);
  try { spell.entity?.remove(); } catch {}
}
