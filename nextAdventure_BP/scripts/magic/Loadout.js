// 杖にセットした魔術（最大4つ）と、しゃがみで出す十字の選択表示
//
// 杖で「置く（使う）」ボタンを押し続ける → 選択表示が出る（その間も歩ける）
// 視点を動かすと、動かした方向（上下左右）のマスへ選択が動く
// ボタンを離す → 決定
//
// 十字の並び（時計回り）:
//        [1]
//     [4]   [2]
//        [3]
import { InputPermissionCategory } from "@minecraft/server";
import { SPELLS } from "./SpellData.js";

export const SLOT_COUNT = 4;
// 「冒険の書」でセットできるようになるまでの初期構成
const DEFAULT_LOADOUT = ["fire_bullet", "earth_wall", null, null];

// HUD に送る魔術の記号（RP の tools/gen_hud_ui.py の SPELL_CODES と合わせる。N は空き）
const HUD_CODE = {
  fire_bullet: "F",
  earth_wall: "E",
};

const KEY_LOADOUT = "na:loadout";
const KEY_SELECTED = "na:selected_slot";

const loadouts = new Map();  // playerId -> string[]
const selected = new Map();  // playerId -> number
const selecting = new Map(); // playerId -> { hover, base: 視点の基準 { x: 上下, y: 左右 } }
const TURN_DEGREES = 6; // これだけ視点を動かしたら、その方向のマスを選ぶ

export function getLoadout(player) {
  let l = loadouts.get(player.id);
  if (!l) {
    l = [...DEFAULT_LOADOUT];
    try {
      const raw = player.getDynamicProperty(KEY_LOADOUT);
      if (typeof raw === "string") {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) l = Array.from({ length: SLOT_COUNT }, (_, i) => (SPELLS[saved[i]] ? saved[i] : null));
      }
    } catch {}
    loadouts.set(player.id, l);
  }
  return l;
}

function getSelectedIndex(player) {
  let i = selected.get(player.id);
  if (i === undefined) {
    const raw = player.getDynamicProperty(KEY_SELECTED);
    i = typeof raw === "number" ? raw : 0;
    selected.set(player.id, i);
  }
  const l = getLoadout(player);
  if (!(i >= 0 && i < SLOT_COUNT) || !l[i]) i = Math.max(0, l.findIndex(Boolean));
  return i;
}

export function getSelectedSpell(player) {
  const l = getLoadout(player);
  return SPELLS[l[getSelectedIndex(player)]] ?? SPELLS.fire_bullet;
}

export function isSelecting(player) {
  return selecting.has(player.id);
}

// 0.4.0 では選択中に移動の入力を止めていた。これはそのまま保存された人を戻す用
function setWalk(player, enabled) {
  try { player.inputPermissions.setPermissionCategory(InputPermissionCategory.LateralMovement, enabled); } catch {}
}

export function openSelector(player) {
  if (selecting.has(player.id)) return;
  selecting.set(player.id, { hover: getSelectedIndex(player), base: player.getRotation() });
  try { player.dimension.playSound("random.click", player.location, { volume: 0.4, pitch: 1.6 }); } catch {}
}

export function closeSelector(player, confirm = true) {
  const st = selecting.get(player.id);
  if (!st) return;
  selecting.delete(player.id);
  if (!confirm) return;
  const l = getLoadout(player);
  if (!l[st.hover]) return;
  selected.set(player.id, st.hover);
  try { player.setDynamicProperty(KEY_SELECTED, st.hover); } catch {}
}

/** 基準から視点を動かした向き → 十字のマス（0=上、1=右、2=下、3=左）。動きが小さければ undefined */
function slotFromTurn(player, base) {
  const r = player.getRotation();
  let yaw = r.y - base.y; // 右を向くと増える
  yaw = ((yaw + 540) % 360) - 180;
  const pitch = r.x - base.x; // 下を向くと増える
  if (Math.hypot(yaw, pitch) < TURN_DEGREES) return undefined;
  if (Math.abs(yaw) >= Math.abs(pitch)) return yaw > 0 ? 1 : 3;
  return pitch > 0 ? 2 : 0;
}

export function tickSelector(player, stillValid) {
  const st = selecting.get(player.id);
  if (!st) return;
  if (!stillValid) {
    closeSelector(player, true);
    return;
  }
  const want = slotFromTurn(player, st.base);
  if (want === undefined) return;
  // 動かした先を新しい基準にする（続けて別の方向へ動かせば、そのマスへ移る）
  st.base = player.getRotation();
  if (want !== st.hover && getLoadout(player)[want]) {
    st.hover = want;
    try { player.dimension.playSound("random.click", player.location, { volume: 0.3, pitch: 2.0 }); } catch {}
  }
}

/** HUD 用：選択表示を開いていれば、各スロットの記号と選んでいるスロット */
export function selectorState(player) {
  const st = selecting.get(player.id);
  if (!st) return undefined;
  const l = getLoadout(player);
  return { codes: l.map((id) => HUD_CODE[id] ?? "N"), hover: st.hover };
}

/** 入り直したときなど、歩けないまま残らないように */
export function resetPlayer(player) {
  selecting.delete(player.id);
  setWalk(player, true);
}

export function forgetLoadout(playerId) {
  loadouts.delete(playerId);
  selected.delete(playerId);
  selecting.delete(playerId);
}
