// 魔術師（na:mage）の思考：標的が見えたら火弾を詠唱して撃つ
import { world, system, GameMode } from "@minecraft/server";
import { startCast, isCasting, aimPoint } from "./CastingSystem.js";
import { sub, len } from "./vec.js";

export const MAGE_ID = "na:mage";
const SIGHT = 18;            // この距離以内の標的を狙う
const THINK_INTERVAL = 5;    // 何tickごとに考えるか
const cooldownUntil = new Map(); // mageId -> tick

function canSee(mage, target) {
  const from = mage.getHeadLocation();
  const to = aimPoint(target);
  const d = sub(to, from);
  const dist = len(d);
  if (dist > SIGHT) return false;
  try {
    const hit = mage.dimension.getBlockFromRay(from, d, { maxDistance: dist, includePassableBlocks: false, includeLiquidBlocks: false });
    return !hit;
  } catch {
    return false;
  }
}

function validTarget(e) {
  if (!e?.isValid) return false;
  if (e.typeId === "minecraft:player") {
    try {
      const gm = e.getGameMode();
      if (gm === GameMode.Creative || gm === GameMode.Spectator) return false;
    } catch {}
  }
  return true;
}

function pickTarget(mage) {
  let t;
  try { t = mage.target; } catch {}
  if (validTarget(t)) return t;
  // AIの標的がまだなければ、近くのプレイヤー
  let best, bestD = Infinity;
  for (const p of mage.dimension.getPlayers({ location: mage.location, maxDistance: SIGHT })) {
    if (!validTarget(p)) continue;
    const d = len(sub(p.location, mage.location));
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

export function tickMages() {
  if (system.currentTick % THINK_INTERVAL !== 0) return;
  const now = system.currentTick;
  for (const dimId of ["overworld", "nether", "the_end"]) {
    let mages = [];
    try { mages = world.getDimension(dimId).getEntities({ type: MAGE_ID }); } catch {}
    for (const mage of mages) {
      if (isCasting(mage)) continue;
      if ((cooldownUntil.get(mage.id) ?? 0) > now) continue;
      const target = pickTarget(mage);
      if (!target || !canSee(mage, target)) continue;
      const chargeGoal = Math.floor(Math.random() * 26); // 0〜1.3秒ぶん溜める
      if (startCast(mage, { target, chargeGoal })) {
        // 詠唱＋溜め＋次までの間
        cooldownUntil.set(mage.id, now + 10 + chargeGoal + 40 + Math.floor(Math.random() * 40));
      }
    }
  }
}

export function forgetMage(id) {
  cooldownUntil.delete(id);
}
