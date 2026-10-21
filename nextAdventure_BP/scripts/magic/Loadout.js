// 杖にセットした魔術（最大4つ）と、しゃがみで出す十字の選択表示
//
// 杖を持ってしゃがむ → 選択表示が出る（その間はその場にとどまる）
// 移動の方向（スティック／WASD）を倒すと、その方向のマスへ選択が動く
// しゃがみをやめる → 決定
//
// 十字の並び（時計回り）:
//        [1]
//     [4]   [2]
//        [3]
import { system, InputPermissionCategory } from "@minecraft/server";
import { SPELLS } from "./SpellData.js";
import { notify } from "./Notice.js";

export const SLOT_COUNT = 4;
// 「冒険の書」でセットできるようになるまでの初期構成
const DEFAULT_LOADOUT = ["fire_bullet", "earth_wall", null, null];

// アイコン（RP の font/glyph_E1.png）[通常, 選択中]
const ICON = {
  empty: ["", ""],
  fire_bullet: ["", ""],
  earth_wall: ["", ""],
};
const CENTER = "\uE106"; // 十字のまんなかの飾り（左右のマスの間を空ける）

const KEY_LOADOUT = "na:loadout";
const KEY_SELECTED = "na:selected_slot";

const loadouts = new Map();  // playerId -> string[]
const selected = new Map();  // playerId -> number
const selecting = new Map(); // playerId -> { hover, lastDrawn, anchor }

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

// 0.4.0 では移動の入力を止めていたが、止めると移動の向きも読めなくなる（選択が動かない）。
// いまはその場に引き戻すだけにしている。これは 0.4.0 で止めたまま保存された人を戻す用
function setWalk(player, enabled) {
  try { player.inputPermissions.setPermissionCategory(InputPermissionCategory.LateralMovement, enabled); } catch {}
}

/** 選択中は開いた場所から動かないように引き戻す（落下はそのまま） */
function holdInPlace(player, st) {
  const p = player.location;
  if (Math.hypot(p.x - st.anchor.x, p.z - st.anchor.z) < 0.05) return;
  try { player.teleport({ x: st.anchor.x, y: p.y, z: st.anchor.z }, { keepVelocity: false }); } catch {}
}

export function openSelector(player) {
  if (selecting.has(player.id)) return;
  const { x, z } = player.location;
  selecting.set(player.id, { hover: getSelectedIndex(player), lastDrawn: -1, anchor: { x, z } });
  try { player.dimension.playSound("random.click", player.location, { volume: 0.4, pitch: 1.6 }); } catch {}
  draw(player);
}

export function closeSelector(player, confirm = true) {
  const st = selecting.get(player.id);
  if (!st) return;
  selecting.delete(player.id);
  try { player.onScreenDisplay.setTitle(" ", { fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 4 }); } catch {}
  if (!confirm) return;
  const l = getLoadout(player);
  if (!l[st.hover]) return;
  selected.set(player.id, st.hover);
  try { player.setDynamicProperty(KEY_SELECTED, st.hover); } catch {}
  notify(player, `§f${SPELLS[l[st.hover]].name} §7を構えた`, 30);
}

/** 移動入力の向き → 十字のマス（0=上、時計回り） */
function slotFromInput(player) {
  let v;
  try { v = player.inputInfo.getMovementVector(); } catch { return undefined; }
  // しゃがみ中は入力が小さく出ることがあるので、しきい値は低めにして向きだけを見る
  if (!v || Math.hypot(v.x, v.y) < 0.2) return undefined;
  const right = -v.x; // 左が +x
  let deg = (Math.atan2(right, v.y) * 180) / Math.PI; // 上=0、右回り
  if (deg < 0) deg += 360;
  return Math.round(deg / (360 / SLOT_COUNT)) % SLOT_COUNT;
}

export function tickSelector(player, stillValid) {
  const st = selecting.get(player.id);
  if (!st) return;
  if (!stillValid) {
    closeSelector(player, true);
    return;
  }
  holdInPlace(player, st);
  const want = slotFromInput(player);
  const l = getLoadout(player);
  if (want !== undefined && want !== st.hover && l[want]) {
    st.hover = want;
    try { player.dimension.playSound("random.click", player.location, { volume: 0.3, pitch: 2.0 }); } catch {}
    st.lastDrawn = -1;
  }
  // タイトルが消えないよう、ときどき描き直す
  if (st.lastDrawn < 0 || system.currentTick - st.lastDrawn >= 10) draw(player);
}

function draw(player) {
  const st = selecting.get(player.id);
  if (!st) return;
  st.lastDrawn = system.currentTick;
  const l = getLoadout(player);
  const icon = (i) => (ICON[l[i]] ?? ICON.empty)[i === st.hover ? 1 : 0];
  // 行ごとに中央揃えになるので、上下の行はアイコン1つだけで真ん中にそろう。
  // アイコンは文字の行より背が高く、詰めると重なるので、行の間に空行をはさむ
  const lines = [
    icon(0),
    icon(3) + CENTER + icon(1),
    icon(2),
  ];
  const name = l[st.hover] ? SPELLS[l[st.hover]] : undefined;
  const sub = name ? `§6${name.name} §7— ${attrName(name.attribute)}・${name.category === "simple" ? "単純魔術" : "複雑魔術"}` : "§7（空き）";
  try {
    player.onScreenDisplay.setTitle(lines.join("\n \n"), {
      fadeInDuration: 0,
      stayDuration: 20,
      fadeOutDuration: 0,
      subtitle: sub,
    });
  } catch {}
}

function attrName(a) {
  return { fire: "火", water: "水", wind: "風", earth: "土" }[a] ?? a;
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
