// 衝突結果を実際の魔術に反映する（草案 11, 14）
import { resolveCollision } from "./InteractionResolver.js";
import { killSpell, setSize } from "./SpellRegistry.js";
import { updateWallState } from "./WallSystem.js";
import { Fx } from "./SpellEffects.js";

function applyResult(spell, res) {
  spell.force = res.force;
  if (spell.def.behavior === "wall") {
    updateWallState(spell); // 壁は動かない。ひび割れ・崩落だけ
    return;
  }
  if (res.result === "vanish") {
    killSpell(spell);
  } else if (res.result === "spread") {
    spell.spread = Math.min(1.6, spell.spread * 1.25); // 炎は広がる
    setSize(spell, spell.size);
  } else if (res.result === "deflect") {
    const ang = (Math.random() - 0.5) * 0.8;
    const { x, z } = spell.dir;
    spell.dir = { x: x * Math.cos(ang) - z * Math.sin(ang), y: spell.dir.y, z: x * Math.sin(ang) + z * Math.cos(ang) };
  }
  // "straight" / "pierce" は進行方向を保つ
}

/** 浮遊体どうしの接触 */
export function onSpellContact(a, b, at) {
  const r = resolveCollision(a, b);
  Fx.clash(a.dimension, at);
  applyResult(a, r.a);
  applyResult(b, r.b);
}

/**
 * 飛んできた魔術が壁ブロックに当たった
 * @returns 魔術が貫通して飛び続けるなら true
 */
export function onWallHit(spell, wall, at) {
  const r = resolveCollision(spell, wall);
  Fx.clash(spell.dimension, at);
  applyResult(wall, r.b);
  applyResult(spell, r.a);
  // 壁はブロックとして物理的に残るので、貫通でない限りここで止まる
  if (spell.phase !== "dead" && r.a.result !== "pierce") {
    Fx.impact(spell.dimension, at, spell.size);
    killSpell(spell);
    return false;
  }
  return spell.phase !== "dead";
}
