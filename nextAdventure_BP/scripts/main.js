// nextAdventure — 魔法編：杖・火弾・精霊契約・魔術師
import { world, system } from "@minecraft/server";
import { liveSpells, killSpell, SPELL_ENTITY } from "./magic/SpellRegistry.js";
import { WAND_ID, casts, startCast, fireCast, interrupt, tickCasting, isCasting, holdingWand } from "./magic/CastingSystem.js";
import { updateFlying } from "./magic/SpellUpdater.js";
import { detectCollisions } from "./magic/CollisionDetector.js";
import { onSpellContact } from "./magic/SpellInteractions.js";
import { tickWalls, earthWallBlockComponent, cleanupStandingWalls } from "./magic/WallSystem.js";
import { openSelector, closeSelector, tickSelector, isSelecting, resetPlayer, forgetLoadout } from "./magic/Loadout.js";
import { tickPower, savePower, useContractStone, forgetPlayer } from "./magic/Contracts.js";
import { updateHud, forgetHud } from "./magic/Hud.js";
import { tickMages, forgetMage, MAGE_ID } from "./magic/MageAI.js";
import { Fx } from "./magic/SpellEffects.js";
import { tickMana, saveMana, forgetMana } from "./magic/Mana.js";
import { DEBUG_BOOK_ID, openDebugBook, forgetDebug } from "./magic/Debug.js";

// 「壊す」ボタンの押し具合。押しっぱなしの間はゲーム側が腕を振り続けるので、
// 振りが続いていれば押している、途切れたら離した、とみなす
// （振りの間隔から間を縮めると、たまに来る間隔の短い振りで縮みすぎて溜められなくなったので固定）
const presses = new Map(); // playerId -> 最後に振った tick（押している、または離して発動待ちの間だけある）
const HOLD_GAP_TICKS = 10; // これだけ振りが来なければ「離した」とみなす

const SWING_ANIM = "animation.na.wand.vanilla_swing";
// 「壊す」ボタン以外の腕振り（置く・使う・投げる など）では発動しない
const NOT_ATTACK_SWINGS = new Set(["Build", "Use", "Interact", "DropItem", "ThrowItem"]);

// ---- 入力 ----
// 土壁ブロックの定期処理を登録（どの壁にも属さないものは崩れる）
system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("na:earth_wall", earthWallBlockComponent);
});

// 杖で「壊す」ボタン（腕はゲーム側が振るので、一人称でも三人称でも振りが見える）
// ・押す → 詠唱開始。押している間、詠唱が終わったあとは溜まっていく
// ・離す → 発動。詠唱の途中で離したら、詠唱が終わった瞬間に発動
world.afterEvents.playerSwingStart.subscribe((ev) => {
  if (ev.heldItemStack?.typeId !== WAND_ID) return;
  if (ev.swingSource !== undefined && NOT_ATTACK_SWINGS.has(ev.swingSource)) return;
  const player = ev.player;
  const now = system.currentTick;
  const pressing = presses.has(player.id);
  presses.set(player.id, now);
  if (pressing) return; // 押しっぱなしで振り続けている
  system.run(() => {
    if (!player.isValid || isCasting(player)) return;
    if (!startCast(player)) presses.delete(player.id);
  });
});

// 杖でブロックは壊さない（壊すボタンは魔法に使う）
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (ev.itemStack?.typeId === WAND_ID) ev.cancel = true;
});

// 杖で「置く（使う）」ボタンを押している間 → 魔法の選択。離すと決定（詠唱・溜めの最中は出さない）
world.afterEvents.itemStartUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== WAND_ID || isCasting(ev.source)) return;
  openSelector(ev.source);
  updateHud(ev.source); // すぐ出す
});
world.afterEvents.itemStopUse.subscribe((ev) => {
  if (!isSelecting(ev.source)) return;
  closeSelector(ev.source, true);
  updateHud(ev.source);
});

// 契約石：0.8秒かかげて契約（しゃがみながらで解除）
world.afterEvents.itemCompleteUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== "na:spirit_stone_fire") return;
  useContractStone(ev.source, "fire");
  Fx.ready(ev.source.dimension, ev.source.getHeadLocation());
});

// デバッグ本：魔力無限などを切り替える
world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== DEBUG_BOOK_ID) return;
  openDebugBook(ev.source);
});

// 詠唱中に被弾したら中断（プレイヤーも魔術師も）
world.afterEvents.entityHurt.subscribe(
  (ev) => {
    const e = ev.hurtEntity;
    if (!casts.has(e.id)) return;
    interrupt(e, "§c被弾して詠唱が途切れた");
  },
  { entityTypes: ["minecraft:player", MAGE_ID] }
);

// ---- 毎tick ----
system.runInterval(() => {
  tickMages();
  tickCasting();

  for (const spell of [...liveSpells.values()]) {
    if (spell.phase === "flying") updateFlying(spell);
  }

  detectCollisions(onSpellContact);
  tickWalls(liveSpells);

  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    tickPress(player, now);

    // 魔法の選択中（杖を持ち替えたら閉じる）
    if (isSelecting(player)) tickSelector(player, holdingWand(player));

    tickPower(player, casts.get(player.id)?.spiritId);
    tickMana(player, casts.get(player.id)?.needsMana);
    updateHud(player);
    if (now % 100 === 0) {
      savePower(player);
      saveMana(player);
    }
  }
}, 1);

/** 離したら発動する。詠唱の途中で離していたら、詠唱が終わるのを待って発動 */
function tickPress(player, now) {
  const last = presses.get(player.id);
  if (last === undefined) return;
  if (!casts.has(player.id)) {
    // 中断された：離すまで待ってから次の詠唱を受け付ける
    if (now - last > HOLD_GAP_TICKS) presses.delete(player.id);
    return;
  }
  const held = now - last <= HOLD_GAP_TICKS;
  if (held || casts.get(player.id).phase === "cast") return;
  presses.delete(player.id);
  if (fireCast(player)) swingArm(player);
}

/** 離して発動したときの腕振り（押したときの振りはゲーム側がする） */
function swingArm(player) {
  try { player.playAnimation(SWING_ANIM, { controller: "na_wand_swing", blendOutTime: 0 }); } catch {}
}

// ---- 後片付け ----
world.afterEvents.playerLeave.subscribe((ev) => {
  const id = ev.playerId;
  const c = casts.get(id);
  if (c) {
    casts.delete(id);
    killSpell(c.spell);
  }
  presses.delete(id);
  forgetPlayer(id);
  forgetLoadout(id);
  forgetHud(id);
  forgetMana(id);
  forgetDebug(id);
});

world.afterEvents.entityRemove.subscribe(
  (ev) => {
    const c = casts.get(ev.removedEntityId);
    if (c) {
      casts.delete(ev.removedEntityId);
      killSpell(c.spell);
    }
    forgetMage(ev.removedEntityId);
  },
  { entityTypes: [MAGE_ID] }
);

// 読み込み時、前回の残り（保存された火の玉・土壁）を消す
world.afterEvents.worldLoad.subscribe(() => {
  cleanupStandingWalls();
  for (const dimId of ["overworld", "nether", "the_end"]) {
    try {
      for (const e of world.getDimension(dimId).getEntities({ type: SPELL_ENTITY })) e.remove();
    } catch {}
  }
});

// 魔術師には杖を持たせる
world.afterEvents.entitySpawn.subscribe((ev) => {
  const e = ev.entity;
  if (e?.typeId !== MAGE_ID) return;
  system.run(() => {
    if (!e.isValid) return;
    try { e.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${WAND_ID}`); } catch {}
  });
});

// 入り直したとき、選択中に落ちて歩けないまま…を防ぐ
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (ev.initialSpawn) resetPlayer(ev.player);
});
