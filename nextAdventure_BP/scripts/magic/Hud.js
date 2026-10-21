// 画面表示
// ・魔力ゲージ／詠唱・溜めのバー／魔法の選択表示は RP の JSON UI（ui/hud_screen.json）で描く。
//   ここでは「na_hud」を含むデータ文字列をタイトルで送るだけ（そのタイトルは画面に出ない）。
//   UI はいま出ているタイトルの文字列を読むので、タイトルは長く出しっぱなしにし、ときどき送り直す。
//   記号の意味は tools/gen_hud_ui.py を参照
// ・お知らせと契約精霊の力はアクションバー
import { system } from "@minecraft/server";
import { SPIRITS, contractedSpirits, getPower } from "./Contracts.js";
import { casts, holdingWand } from "./CastingSystem.js";
import { currentNotice } from "./Notice.js";
import { selectorState } from "./Loadout.js";
import { MANA, getMana } from "./Mana.js";

const HUD_MARK = "na_hud";
const TITLE_TICKS = 20 * 60 * 10; // データのタイトルを出しておく長さ（10分）
const RESEND_TICKS = 100;         // 他のタイトルで上書きされても戻るよう、ときどき送り直す
const MANA_ICONS = 10; // 空腹ゲージと同じ10個
const BAR_SEGMENTS = 10;

function bar(ratio, n, on, off) {
  const k = Math.round(Math.max(0, Math.min(1, ratio)) * n);
  return on + "|".repeat(k) + off + "|".repeat(n - k);
}

/** 数字を桁ごとの記号に（75 → "[n05][n17]"。0=一の位） */
function digits(prefix, value) {
  return [...String(Math.max(0, Math.floor(value)))].reverse().map((d, p) => `[${prefix}${p}${d}]`).join("");
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
  let data = HUD_MARK;

  // 魔力：右端（0番）から埋まる。空腹ゲージと同じ並び。右下に「今/最大」
  if (showsSurvivalUi(player)) {
    const v = getMana(player);
    data += "[m]" + digits("n", v) + digits("x", MANA.max);
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
  if (lastData.get(player.id) !== data || system.currentTick % RESEND_TICKS === 0) {
    lastData.set(player.id, data);
    try { player.onScreenDisplay.setTitle(data, { fadeInDuration: 0, stayDuration: TITLE_TICKS, fadeOutDuration: 0 }); } catch {}
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
