// 魔術の定義データ（草案 7〜10）
// 数値はすべて暫定。テストプレイで調整する

/** 発動媒体（草案 5） */
export const MEDIA = {
  wand: { name: "杖", castMultiplier: 0.6 },      // 素早い発動
  grimoire: { name: "魔導書", castMultiplier: 1.4 }, // 精密だが遅い（未実装）
};

/** 構築負担 B_total = B_base + B_main + B_sub + B_pair（草案 10） */
export function buildBurden(def, traits) {
  const b = def.burden;
  return b.base + (traits?.main ? b.main : 0) + (traits?.sub ? b.sub : 0) + (traits?.main && traits?.sub ? b.pair : 0);
}

/** 詠唱時間（tick）。計算式は未確定のため暫定：負担 × 1.6 × 媒体倍率 */
export function castTicks(def, traits, medium) {
  return Math.max(4, Math.round(buildBurden(def, traits) * 1.6 * medium.castMultiplier));
}

export const SPELLS = {
  fire_bullet: {
    id: "fire_bullet",
    behavior: "projectile",
    name: "火弾",
    kind: 0,                    // 見た目の種類（na:kind）
    category: "simple",         // 単純魔術
    attribute: "fire",
    shape: "sphere",
    state: "flame",
    motion: "fast_straight",
    traits: { main: null, sub: null },
    burden: { base: 10, main: 0, sub: 0, pair: 0 },

    force: 20,                  // 作用量（基準値）
    interference: 1.0,          // 干渉率
    power: 6,                   // 威力（基礎ダメージ）
    speed: 1.1,                 // ブロック/tick
    range: 24,                  // 射程（ブロック）
    penetrationBase: 0,
    burnSeconds: 4,

    spiritCost: 12,             // 精霊魔術の場合に詠唱中に段階消費する力（単純魔術では使わない）
    manaCost: 8,                // 単純魔術の場合に詠唱中に段階消費する自分の魔力
    size: { start: 0.12, cast: 0.45, max: 1.1 },

    // 溜め（任意）：溜めた分だけ大きさ・作用量・威力・射程が伸びる
    charge: {
      maxTicks: 40,
      spiritCost: 18,
      manaCost: 12,
      force: 1.0,   // 最大で +100%
      power: 1.5,   // 最大で +150%
      range: 1.0,   // 最大で +100%
    },

    // 溜め中の火の玉にも攻撃判定
    contact: { interval: 10, damage: 1, burnSeconds: 2 },
  },

  earth_wall: {
    id: "earth_wall",
    behavior: "wall",
    visual: false,              // 火の玉のような浮遊体はなく、ブロックの壁になる
    name: "土壁",
    kind: 1,
    category: "simple",         // 単純魔術
    attribute: "earth",
    shape: "wall",
    state: "rock",
    motion: "static",
    traits: { main: null, sub: null },
    burden: { base: 14, main: 0, sub: 0, pair: 0 },   // 火弾より少し重い → 詠唱 0.65秒

    force: 40,                  // 作用量：火弾(20)を2発まで受け止める
    interference: 1.0,
    power: 0,
    speed: 0,
    range: 0,
    penetrationBase: 0,
    reach: 8,                   // 壁を立てられる距離（ブロック）
    wall: { width: 3, height: 2, seconds: 8 },
    spiritCost: 14,
    manaCost: 14,
    // 溜めはない：詠唱が終わった瞬間に立つ
  },
};
