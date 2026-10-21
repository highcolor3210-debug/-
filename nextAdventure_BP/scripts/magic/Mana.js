// 自分の魔力（単純魔術で使う。精霊の力とは別）
// ・最大値・回復速度は暫定
// ・詠唱中は回復しない
import { isInfiniteMana } from "./Debug.js";

export const MANA = {
  max: 100,
  regenPerTick: 0.25, // 毎秒 5
};

const KEY_MANA = "na:mana";

const manas = new Map(); // playerId -> number

export function getMana(player) {
  let v = manas.get(player.id);
  if (v === undefined) {
    const saved = player.getDynamicProperty(KEY_MANA);
    v = typeof saved === "number" ? Math.min(MANA.max, saved) : MANA.max;
    manas.set(player.id, v);
  }
  return isInfiniteMana(player) ? MANA.max : v;
}

export function consumeMana(player, amount) {
  if (isInfiniteMana(player)) return true;
  const v = getMana(player);
  if (v + 1e-6 < amount) return false;
  manas.set(player.id, v - amount);
  return true;
}

export function tickMana(player, busy) {
  if (busy) return;
  manas.set(player.id, Math.min(MANA.max, getMana(player) + MANA.regenPerTick));
}

export function saveMana(player) {
  const v = manas.get(player.id);
  if (v === undefined) return;
  try { player.setDynamicProperty(KEY_MANA, Math.round(v * 10) / 10); } catch {}
}

export function forgetMana(playerId) {
  manas.delete(playerId);
}
