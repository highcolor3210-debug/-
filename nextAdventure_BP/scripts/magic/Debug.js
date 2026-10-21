// デバッグ本：テスト用の切り替え（魔力無限など）
import { ModalFormData } from "@minecraft/server-ui";
import { notify } from "./Notice.js";

export const DEBUG_BOOK_ID = "na:debug_book";

const KEY_DEBUG = "na:debug";
const FLAGS = [
  { id: "infiniteMana", label: "魔力を無限にする" },
  { id: "infiniteSpirit", label: "精霊の力を無限にする" },
];

const settings = new Map(); // playerId -> { [flagId]: boolean }

function getSettings(player) {
  let s = settings.get(player.id);
  if (!s) {
    s = {};
    try {
      const raw = player.getDynamicProperty(KEY_DEBUG);
      if (typeof raw === "string") Object.assign(s, JSON.parse(raw));
    } catch {}
    settings.set(player.id, s);
  }
  return s;
}

export function isInfiniteMana(player) {
  return !!getSettings(player).infiniteMana;
}

export function isInfiniteSpirit(player) {
  return !!getSettings(player).infiniteSpirit;
}

export async function openDebugBook(player) {
  const s = getSettings(player);
  const form = new ModalFormData().title("デバッグ本");
  for (const f of FLAGS) form.toggle(f.label, { defaultValue: !!s[f.id] });
  form.submitButton("決定");

  let res;
  try { res = await form.show(player); } catch { return; }
  if (!player.isValid || res.canceled || !res.formValues) return;
  FLAGS.forEach((f, i) => (s[f.id] = !!res.formValues[i]));
  try { player.setDynamicProperty(KEY_DEBUG, JSON.stringify(s)); } catch {}
  notify(player, `§d[デバッグ] §f魔力無限 ${onOff(s.infiniteMana)} §7/ §f精霊の力無限 ${onOff(s.infiniteSpirit)}`, 60);
}

function onOff(v) {
  return v ? "§aON" : "§7OFF";
}

export function forgetDebug(playerId) {
  settings.delete(playerId);
}
