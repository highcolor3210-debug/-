// 画面表示（アクションバー）。契約精霊の力・詠唱・溜め
import { system } from "@minecraft/server";
import { SPIRITS, contractedSpirits, getPower } from "./Contracts.js";
import { casts, holdingWand } from "./CastingSystem.js";
import { currentNotice } from "./Notice.js";
import { getSelectedSpell } from "./Loadout.js";

function bar(ratio, n, on, off) {
  const k = Math.round(Math.max(0, Math.min(1, ratio)) * n);
  return on + "|".repeat(k) + off + "|".repeat(n - k);
}

const lastShown = new Map();

export function updateHud(player) {
  const c = casts.get(player.id);
  const notice = currentNotice(player);
  if (!c && !holdingWand(player) && !notice) {
    if (lastShown.get(player.id)) {
      lastShown.set(player.id, "");
      try { player.onScreenDisplay.setActionBar(" "); } catch {}
    }
    return;
  }

  const spirits = contractedSpirits(player);
  const lines = [];
  if (notice) lines.push(notice);

  {
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

  const line = lines.join("\n");
  const prev = lastShown.get(player.id);
  if (prev === line && system.currentTick % 30 !== 0) return;
  lastShown.set(player.id, line);
  try { player.onScreenDisplay.setActionBar(line); } catch {}
}

export function forgetHud(playerId) {
  lastShown.delete(playerId);
}
