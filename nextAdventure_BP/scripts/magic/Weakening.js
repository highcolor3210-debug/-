// 作用量の残存率と弱体化（草案 12）
const TIERS = [
  { min: 0.75, power: 1.0, speed: 1.0, range: 1.0 },
  { min: 0.5, power: 0.8, speed: 0.9, range: 0.9 },
  { min: 0.25, power: 0.6, speed: 0.75, range: 0.75 },
  { min: 1e-9, power: 0.3, speed: 0.5, range: 0.5 },
];
const ZERO = { min: 0, power: 0, speed: 0, range: 0 };

export function remainingRatio(spell) {
  if (spell.forceMax <= 0) return 0;
  return Math.max(0, spell.force) / spell.forceMax;
}

export function tierFor(ratio) {
  if (ratio <= 0) return ZERO;
  for (const t of TIERS) if (ratio >= t.min) return t;
  return ZERO;
}

/** 現在の作用量から実効性能を一貫して計算する */
export function effectiveStats(spell) {
  const t = tierFor(remainingRatio(spell));
  return {
    power: spell.basePower * t.power,
    speed: spell.baseSpeed * t.speed,
    range: spell.baseRange * t.range,
    tier: t,
  };
}
