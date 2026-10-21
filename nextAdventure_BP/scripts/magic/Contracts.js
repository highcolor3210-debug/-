// 精霊との契約と、精霊から借りる力（草案 3, 7）
// ・精霊の力は「契約している精霊ごと」に持つ。契約していなければ力はない
// ・主契約1体＋補助契約1体まで
// ・最大値・回復速度は精霊ごと（数値は暫定）
import { notify } from "./Notice.js";
import { isInfiniteSpirit } from "./Debug.js";

export const SPIRITS = {
  fire: {
    id: "fire",
    name: "火の精霊",
    attributes: ["fire"], // この精霊が応える属性（1対1とは限らない）
    max: 100,
    regenPerTick: 0.1,    // 毎秒 2
    color: "§6",
  },
};

const KEY_CONTRACT = "na:contract";
const keyPower = (id) => `na:spirit_${id}`;

const contracts = new Map(); // playerId -> { main, sub }
const powers = new Map();    // playerId -> { [spiritId]: number }

export function getContract(player) {
  let c = contracts.get(player.id);
  if (!c) {
    c = { main: null, sub: null };
    try {
      const raw = player.getDynamicProperty(KEY_CONTRACT);
      if (typeof raw === "string") Object.assign(c, JSON.parse(raw));
    } catch {}
    for (const slot of ["main", "sub"]) if (c[slot] && !SPIRITS[c[slot]]) c[slot] = null;
    contracts.set(player.id, c);
  }
  return c;
}

export function contractedSpirits(player) {
  const c = getContract(player);
  return [c.main, c.sub].filter(Boolean);
}

export function hasAnyContract(player) {
  return contractedSpirits(player).length > 0;
}

function saveContract(player) {
  try { player.setDynamicProperty(KEY_CONTRACT, JSON.stringify(getContract(player))); } catch {}
}

function pool(player) {
  let p = powers.get(player.id);
  if (!p) powers.set(player.id, (p = {}));
  return p;
}

export function getPower(player, spiritId) {
  const p = pool(player);
  if (p[spiritId] === undefined) {
    const saved = player.getDynamicProperty(keyPower(spiritId));
    p[spiritId] = typeof saved === "number" ? saved : SPIRITS[spiritId].max;
  }
  return p[spiritId];
}

/** この属性の魔術に力を貸してくれる契約精霊（主契約を優先） */
export function spiritFor(player, attribute) {
  return contractedSpirits(player).find((id) => SPIRITS[id].attributes.includes(attribute));
}

export function consumePower(player, spiritId, amount) {
  if (isInfiniteSpirit(player)) return true;
  const v = getPower(player, spiritId);
  if (v + 1e-6 < amount) return false;
  pool(player)[spiritId] = v - amount;
  return true;
}

/** 使っていない精霊の力は回復する */
export function tickPower(player, busySpiritId) {
  for (const id of contractedSpirits(player)) {
    if (id === busySpiritId) continue;
    const s = SPIRITS[id];
    pool(player)[id] = Math.min(s.max, getPower(player, id) + s.regenPerTick);
  }
}

export function savePower(player) {
  const p = powers.get(player.id);
  if (!p) return;
  for (const [id, v] of Object.entries(p)) {
    try { player.setDynamicProperty(keyPower(id), Math.round(v * 10) / 10); } catch {}
  }
}

/** 契約石を使ったとき。しゃがみながらだと契約を解く */
export function useContractStone(player, spiritId) {
  const s = SPIRITS[spiritId];
  const c = getContract(player);
  const slot = c.main === spiritId ? "main" : c.sub === spiritId ? "sub" : null;

  if (player.isSneaking) {
    if (!slot) return notify(player, `§7${s.name}とは契約していない`, 50);
    c[slot] = null;
    if (slot === "main" && c.sub) { c.main = c.sub; c.sub = null; } // 補助を主へ繰り上げ
    saveContract(player);
    return notify(player, `§7${s.name}との契約を解いた`, 50);
  }
  if (slot) return notify(player, `§7すでに${s.name}と契約している`, 50);
  if (!c.main) c.main = spiritId;
  else if (!c.sub) c.sub = spiritId;
  else return notify(player, "§cこれ以上の精霊とは契約できない（主1・補助1まで）", 60);
  saveContract(player);
  pool(player)[spiritId] = getPower(player, spiritId);
  notify(player, `${s.color}${s.name}と${c.main === spiritId ? "主契約" : "補助契約"}を結んだ`, 60);
  return true;
}

export function forgetPlayer(playerId) {
  contracts.delete(playerId);
  powers.delete(playerId);
}
