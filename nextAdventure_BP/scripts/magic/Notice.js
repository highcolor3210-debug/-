// 一時的なお知らせ（HUDの上に一定時間だけ出す）
import { system } from "@minecraft/server";

const notices = new Map(); // playerId -> { text, until }

export function notify(player, text, ticks = 30) {
  notices.set(player.id, { text, until: system.currentTick + ticks });
}

export function currentNotice(player) {
  const n = notices.get(player.id);
  if (!n) return undefined;
  if (system.currentTick > n.until) {
    notices.delete(player.id);
    return undefined;
  }
  return n.text;
}
