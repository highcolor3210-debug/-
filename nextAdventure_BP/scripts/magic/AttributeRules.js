// 属性相性（草案 4.1 / 11.2）
// 攻撃側 → 防御側 の関係。数値はすべて暫定値

export const ATTRIBUTES = ["fire", "water", "wind", "earth"];

const RELATION = {
  fire:  { fire: "base",        water: "disadvantage", wind: "conditional",  earth: "neutral" },
  water: { fire: "advantage",   water: "base",         wind: "neutral",      earth: "conditional" },
  wind:  { fire: "conditional", water: "neutral",      wind: "base",         earth: "disadvantage" },
  earth: { fire: "neutral",     water: "conditional",  wind: "advantage",    earth: "base" },
};

export const AFFINITY_MULT = {
  advantage: 1.25,
  neutral: 1.0,
  base: 1.0,
  disadvantage: 0.75,
};

export function relation(attackAttr, defendAttr) {
  return RELATION[attackAttr]?.[defendAttr] ?? "neutral";
}

/**
 * 攻撃側の魔術が防御側の魔術へ与える干渉の補正倍率
 * 条件依存は、形状・状態・量を見て決める（判定式は未確定のため、いまは中立扱い）
 */
export function affinityMultiplier(attacker, defender) {
  const rel = relation(attacker.def.attribute, defender.def.attribute);
  if (rel === "conditional") return resolveConditional(attacker, defender);
  return AFFINITY_MULT[rel];
}

function resolveConditional(attacker, defender) {
  // TODO: 形状・状態・作用量・環境による判定（草案 4.1「条件依存」）
  return 1.0;
}
