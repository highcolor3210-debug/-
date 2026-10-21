// 魔術同士の衝突の解決（草案 11, 13, 14）
// Minecraft API に依存しない純粋なロジック
import { affinityMultiplier } from "./AttributeRules.js";
import { clamp } from "./vec.js";

// 貫通コストの補正（草案 13.1。暫定値）
const SHAPE_MULT = { line: 0.75, needle: 0.75, sphere: 1.0, plane: 1.25, scatter: 1.25, wall: 1.5 };
const STATE_MULT = { flame: 0.6, dust: 0.6, sand: 0.6, liquid: 0.8, normal: 1.0, rock: 1.4 };

// 衝突後の進み方の傾向（草案 14）
const SPREADING_STATES = new Set(["flame", "sand", "dust"]);
const DEFLECTING_STATES = new Set(["liquid"]);

/** 相手へ与える干渉値（衝突前の作用量 × 干渉率） */
function interference(spell, preForce) {
  return preForce * (spell.def.interference ?? 1.0);
}

function penetrationCost(attacker, target) {
  const m = clamp(
    (SHAPE_MULT[target.def.shape] ?? 1.0) * (STATE_MULT[target.def.state] ?? 1.0),
    0.5,
    2.0
  );
  return (attacker.def.penetrationBase ?? 0) * m;
}

function hasTrait(spell, trait) {
  return spell.traits?.main === trait || spell.traits?.sub === trait;
}

function directionResult(spell) {
  if (SPREADING_STATES.has(spell.def.state)) return "spread";
  if (DEFLECTING_STATES.has(spell.def.state)) return "deflect";
  return "straight";
}

/**
 * 2つの魔術の衝突結果を計算する（状態は書き換えない）
 * @returns {{a:{force:number,result:string}, b:{force:number,result:string}}}
 */
export function resolveCollision(a, b) {
  // 1. 衝突前の作用量を保存
  const preA = a.force;
  const preB = b.force;

  // 2. 通常の衝突損失（双方とも衝突前の値から計算）
  const lossA = interference(b, preB) * affinityMultiplier(b, a);
  const lossB = interference(a, preA) * affinityMultiplier(a, b);
  let forceA = Math.max(0, preA - lossA);
  let forceB = Math.max(0, preB - lossB);

  // 3〜5. 貫通（通常損失の後の残量で支払えるか）
  let pierceA = false;
  let pierceB = false;
  if (forceA > 0 && hasTrait(a, "pierce")) {
    const c = penetrationCost(a, b);
    if (forceA >= c) { forceA -= c; pierceA = true; }
  }
  if (forceB > 0 && hasTrait(b, "pierce")) {
    const c = penetrationCost(b, a);
    if (forceB >= c) { forceB -= c; pierceB = true; }
  }

  // 6. 結果（一回の衝突につき主要結果をひとつ）
  const result = (force, pierced, spell) =>
    force <= 0 ? "vanish" : pierced ? "pierce" : directionResult(spell);

  return {
    a: { force: forceA, result: result(forceA, pierceA, a) },
    b: { force: forceB, result: result(forceB, pierceB, b) },
  };
}
