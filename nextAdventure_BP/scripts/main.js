// nextAdventure — 魔法編：杖・火弾・精霊契約・魔術師
import { world, system } from "@minecraft/server";
import { liveSpells, killSpell, SPELL_ENTITY } from "./magic/SpellRegistry.js";
import { WAND_ID, casts, startCast, releaseCast, interrupt, tickCasting, isCasting, holdingWand } from "./magic/CastingSystem.js";
import { updateFlying } from "./magic/SpellUpdater.js";
import { detectCollisions } from "./magic/CollisionDetector.js";
import { onSpellContact } from "./magic/SpellInteractions.js";
import { tickWalls, earthWallBlockComponent } from "./magic/WallSystem.js";
import { openSelector, tickSelector, isSelecting, resetPlayer, forgetLoadout } from "./magic/Loadout.js";
import { tickPower, savePower, useContractStone, forgetPlayer } from "./magic/Contracts.js";
import { updateHud, forgetHud } from "./magic/Hud.js";
import { tickMages, forgetMage, MAGE_ID } from "./magic/MageAI.js";
import { Fx } from "./magic/SpellEffects.js";
import { tickMana, saveMana, forgetMana } from "./magic/Mana.js";
import { DEBUG_BOOK_ID, openDebugBook, forgetDebug } from "./magic/Debug.js";

const SWING_ANIM = "animation.na.wand.vanilla_swing";
const SWING_TICKS = 6;
const lastSwing = new Map(); // playerId -> tick

// ---- 入力 ----
// 土壁ブロックの定期処理を登録（どの壁にも属さないものは崩れる）
system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("na:earth_wall", earthWallBlockComponent);
});

// 杖で「使う」を押す → 詠唱開始（魔法を選んでいる最中は除く）
world.afterEvents.itemStartUse.subscribe((ev) => {
  if (ev.itemStack?.typeId !== WAND_ID) return;
  if (isSelecting(ev.source)) return;
  startCast(ev.source);
});

// 指を離した → 発動（撃てたら杖を振る）／詠唱が終わる前なら中断
world.afterEvents.itemStopUse.subscribe((ev) => {
  if (!isCasting(ev.source)) return;
  if (releaseCast(ev.source)) swingArm(ev.source);
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

// バニラの腕振り（壊すボタンなど）を記録して、二重に振らないようにする
world.afterEvents.playerSwingStart.subscribe((ev) => {
  if (ev.heldItemStack?.typeId !== WAND_ID) return;
  lastSwing.set(ev.player.id, system.currentTick);
});

/** 魔法を撃った瞬間に腕を振る（バニラと同じ形の振り） */
function swingArm(player) {
  system.run(() => {
    if (!player.isValid) return;
    const last = lastSwing.get(player.id) ?? -999;
    if (system.currentTick - last < SWING_TICKS) return; // ゲーム側がもう振っている
    lastSwing.set(player.id, system.currentTick);
    try {
      player.playAnimation(SWING_ANIM, { controller: "na_wand_swing", blendOutTime: 0 });
    } catch {}
  });
}

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
    // 杖を持ってしゃがむ → 魔法の選択
    const canSelect = player.isSneaking && !isCasting(player) && holdingWand(player);
    if (isSelecting(player)) tickSelector(player, canSelect);
    else if (canSelect) openSelector(player);

    tickPower(player, casts.get(player.id)?.spiritId);
    tickMana(player, casts.get(player.id)?.needsMana);
    if (now % 2 === 0) updateHud(player);
    if (now % 100 === 0) {
      savePower(player);
      saveMana(player);
    }
  }
}, 1);

// ---- 後片付け ----
world.afterEvents.playerLeave.subscribe((ev) => {
  const id = ev.playerId;
  const c = casts.get(id);
  if (c) {
    casts.delete(id);
    killSpell(c.spell);
  }
  lastSwing.delete(id);
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

// 読み込み時、前回の残り（保存された火の玉）を消す
world.afterEvents.worldLoad.subscribe(() => {
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
