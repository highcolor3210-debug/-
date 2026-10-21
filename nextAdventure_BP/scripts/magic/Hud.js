// 画面表示
// ・魔力ゲージ／詠唱・溜めのバー／魔法の選択表示は RP の JSON UI（ui/hud_screen.json）で描く。
//   ここでは「na_hud」で始まるデータ文字列をタイトルで送るだけ（そのタイトルは画面に出ない）。
//   記号の意味は tools/gen_hud_ui.py を参照
// ・お知らせと契約精霊の力はアクションバー
import { system } from "@minecraft/server";
import { SPIRITS, contractedSpirits, getPower } from "./Contracts.js";
import { casts, holdingWand } from "./CastingSystem.js";
import { currentNotice } from "./Notice.js";
import { selectorState } from "./Loadout.js";
import { MANA, getMana } from "./Mana.js";

const HUD_MARK = "na_hud";
const MANA_TEXT_WIDTH = 7; // 先頭の「今/最大」の欄の文字数（UI 側は '%.7s' で読む）
const MANA_ICONS = 10; // 空腹ゲージと同じ10個
const BAR_SEGMENTS = 10;

function bar(ratio, n, on, off) {
  const k = Math.round(Math.max(0, Math.min(1, ratio)) * n);
  return on + "|".repeat(k) + off + "|".repeat(n - k);
}

/** "[s1][s2]…[sN]" のように 1..k の記号を並べる */
function upTo(prefix, ratio) {
  const k = Math.round(Math.max(0, Math.min(1, ratio)) * BAR_SEGMENTS);
  let out = "";
  for (let n = 1; n <= k; n++) out += `[${prefix}${n}]`;
  return out;
}

function showsSurvivalUi(player) {
  try {
    const mode = String(player.getGameMode()).toLowerCase();
    return mode === "survival" || mode === "adventure";
  } catch {
    return true;
  }
}

function hudData(player) {
  // 先頭は魔力の「今/最大」（幅をそろえるため後ろを空白で埋める）
  const v = getMana(player);
  let data = `${Math.floor(v)}/${MANA.max}`.padEnd(MANA_TEXT_WIDTH, " ").slice(0, MANA_TEXT_WIDTH) + HUD_MARK;

  // 魔力：右端（0番）から埋まる。空腹ゲージと同じ並び
  if (showsSurvivalUi(player)) {
    data += "[m]";
    const per = MANA.max / MANA_ICONS;
    for (let i = 0; i < MANA_ICONS; i++) {
      const rest = v - i * per;
      if (rest >= per - 1e-6) data += `[m${i}F]`;
      else if (rest >= per / 2) data += `[m${i}H]`;
    }
  }

  // 詠唱・溜め
  const c = casts.get(player.id);
  if (c) {
    data += "[b]";
    data += c.phase === "cast"
      ? upTo("s", c.tick / c.castTicks)
      : upTo("c", c.def.charge ? c.chargeTicks / c.def.charge.maxTicks : 1); // 溜めのない魔術は「構え済み」で満タン
  }

  // 魔法の選択表示
  const sel = selectorState(player);
  if (sel) {
    data += "[o]";
    sel.codes.forEach((code, i) => (data += `[k${i}${code}]`));
    data += `[h${sel.hover}]`;
  }
  return data;
}

const lastData = new Map();
const lastShown = new Map();

export function updateHud(player) {
  const data = hudData(player);
  if (lastData.get(player.id) !== data) {
    lastData.set(player.id, data);
    try { player.onScreenDisplay.setTitle(data, { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 0 }); } catch {}
  }

  const lines = [];
  const notice = currentNotice(player);
  if (notice) lines.push(notice);
  // 契約精霊の力は杖を持っているときだけ（契約していなければ出ない）
  if (casts.has(player.id) || holdingWand(player)) {
    const gauges = contractedSpirits(player).map((id) => {
      const s = SPIRITS[id];
      const v = getPower(player, id);
      return `${s.color}${s.name} ${bar(v / s.max, 16, s.color, "§8")} §f${Math.floor(v)}`;
    });
    if (gauges.length) lines.push(gauges.join("  "));
  }

  const line = lines.join("\n");
  const prev = lastShown.get(player.id) ?? "";
  if (prev === line && (line === "" || system.currentTick % 30 !== 0)) return;
  lastShown.set(player.id, line);
  try { player.onScreenDisplay.setActionBar(line || " "); } catch {}
}

export function forgetHud(playerId) {
  lastData.delete(playerId);
  lastShown.delete(playerId);
}
