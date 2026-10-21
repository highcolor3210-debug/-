// 画面表示（アクションバー）。契約精霊の力・詠唱・溜め・魔力ゲージ
import { system } from "@minecraft/server";
import { SPIRITS, contractedSpirits, getPower } from "./Contracts.js";
import { casts, holdingWand } from "./CastingSystem.js";
import { currentNotice } from "./Notice.js";
import { getSelectedSpell } from "./Loadout.js";
import { MANA, getMana } from "./Mana.js";
import { isInfiniteMana } from "./Debug.js";

// 魔力ゲージのグリフ（RP の font/glyph_E2.png）
const MANA_GLYPH = {
  full: "\uE200",
  half: "\uE201",
  empty: "\uE202",
  infinite: "\uE21A",
  digit: (n) => String.fromCharCode(0xe210 + n),
};
// 見えない間隔（幅：アイコン1つ分／半分）
const SPACE_FULL = "\uE203";
const SPACE_HALF = "\uE204";
const MANA_ICONS = 10; // 空腹ゲージと同じ10個

/**
 * 魔力ゲージの行。アクションバーは中央揃えなので、左に同じ幅の見えない間隔を置き、
 * 見える部分が画面の右半分（空腹ゲージの真上）に来るようにする
 */
function manaLine(player) {
  const infinite = isInfiniteMana(player);
  const v = getMana(player);
  const per = MANA.max / MANA_ICONS;
  let shown = "";
  let pad = "";
  for (let i = 0; i < MANA_ICONS; i++) {
    const rest = v - i * per;
    shown += infinite || rest >= per - 1e-6 ? MANA_GLYPH.full : rest >= per / 2 ? MANA_GLYPH.half : MANA_GLYPH.empty;
    pad += SPACE_FULL;
  }
  if (infinite) {
    shown += MANA_GLYPH.infinite;
    pad += SPACE_FULL;
  } else {
    for (const ch of String(Math.floor(v))) {
      shown += MANA_GLYPH.digit(Number(ch));
      pad += SPACE_HALF;
    }
  }
  return "§r" + pad + shown;
}

function bar(ratio, n, on, off) {
  const k = Math.round(Math.max(0, Math.min(1, ratio)) * n);
  return on + "|".repeat(k) + off + "|".repeat(n - k);
}

const lastShown = new Map();

export function updateHud(player) {
  const c = casts.get(player.id);
  const notice = currentNotice(player);
  const lines = [];
  if (notice) lines.push(notice);

  // 魔術の行は杖を持っているときだけ
  if (c || holdingWand(player)) {
    const spirits = contractedSpirits(player);
    let head = "";
    if (c) {
      head = c.phase === "cast"
        ? `§6${c.def.name} §e詠唱 ${bar(c.tick / c.castTicks, 10, "§e", "§8")}  `
        : `§6${c.def.name} §c溜め ${Math.round((c.chargeTicks / c.def.charge.maxTicks) * 100)}%  `;
    } else {
      head = `§6${getSelectedSpell(player).name}  `;
    }
    const gauges = spirits.map((id) => {
      const s = SPIRITS[id];
      const v = getPower(player, id);
      return `${s.color}${s.name} ${bar(v / s.max, 16, s.color, "§8")} §f${Math.floor(v)}`;
    });
    lines.push(head + gauges.join("  ")); // 契約していなければゲージは出ない
  }

  // 魔力ゲージはいちばん下（空腹ゲージのすぐ上）
  lines.push(manaLine(player));

  const line = lines.join("\n");
  const prev = lastShown.get(player.id);
  if (prev === line && system.currentTick % 30 !== 0) return;
  lastShown.set(player.id, line);
  try { player.onScreenDisplay.setActionBar(line); } catch {}
}

export function forgetHud(playerId) {
  lastShown.delete(playerId);
}
