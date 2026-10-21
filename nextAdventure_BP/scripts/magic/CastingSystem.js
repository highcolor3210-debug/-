// 詠唱・溜め・発射（草案 5, 6：CastingSystem）
// プレイヤーも魔術師（モブ）も同じ仕組みで詠唱する
//
// プレイヤー：杖で「壊す」ボタン → 詠唱 → 詠唱が終わると構えたまま（火弾は溜まっていく）
//             → もう一度「壊す」ボタンで発動（そのときゲーム側が腕を振る）
// 魔術師    ：AI が詠唱を始め、決めた分だけ溜めて、標的へ撃つ
// 被弾する／持ち替える → 中断（使った力だけ失う）
import { system } from "@minecraft/server";
import { SPELLS, MEDIA, castTicks } from "./SpellData.js";
import { createSpell, setSize, moveSpell, killSpell } from "./SpellRegistry.js";
import { spiritFor, consumePower, hasAnyContract, SPIRITS } from "./Contracts.js";
import { damageEntity } from "./SpellUpdater.js";
import { Fx } from "./SpellEffects.js";
import { notify } from "./Notice.js";
import { previewWall, raiseWall } from "./WallSystem.js";
import { getSelectedSpell } from "./Loadout.js";
import { consumeMana } from "./Mana.js";
import { add, mul, norm, lerp, sub } from "./vec.js";

export const WAND_ID = "na:wand";

/** casterId -> 詠唱状態 */
export const casts = new Map();

export function isCasting(entity) {
  return casts.has(entity.id);
}

export function holdingWand(player) {
  try {
    const item = player.getComponent("minecraft:equippable")?.getEquipment("Mainhand");
    return item?.typeId === WAND_ID;
  } catch {
    return false;
  }
}

/** 杖の先（右手の前方） */
export function tipLocation(entity) {
  const head = entity.getHeadLocation();
  const v = entity.getViewDirection();
  const h = Math.hypot(v.x, v.z) || 1;
  const right = { x: -v.z / h, y: 0, z: v.x / h };
  const isPlayer = entity.typeId === "minecraft:player";
  const fwd = isPlayer ? 1.3 : 0.9;
  return add(add(head, mul(v, fwd)), add(mul(right, isPlayer ? 0.3 : 0.35), { x: 0, y: isPlayer ? -0.2 : -0.35, z: 0 }));
}

/** 標的の胴のあたり */
export function aimPoint(target) {
  const feet = target.location;
  let headY = feet.y + 1.6;
  try { headY = target.getHeadLocation().y; } catch {}
  return { x: feet.x, y: (feet.y + headY) / 2 + 0.2, z: feet.z };
}

/** いま選んでいる魔術（魔術師は火弾） */
function selectedSpell(caster) {
  if (caster.typeId === "minecraft:player") return getSelectedSpell(caster);
  return SPELLS.fire_bullet;
}

/**
 * 詠唱開始
 * @param ai 魔術師用 { target, chargeGoal }。プレイヤーは undefined
 */
export function startCast(caster, ai) {
  if (casts.has(caster.id)) return false;
  const isPlayer = caster.typeId === "minecraft:player";
  const def = selectedSpell(caster);
  const total = castTicks(def, def.traits, MEDIA.wand);

  // 単純魔術は精霊と契約していなくても使える（精霊の力ではなく自分の魔力を使う）
  const needsSpirit = def.category !== "simple";
  const needsMana = isPlayer && !needsSpirit;
  const perTick = (needsSpirit ? def.spiritCost : def.manaCost) / total;
  if (needsMana && !consumeMana(caster, perTick)) {
    notify(caster, "§b魔力が足りない");
    return false;
  }
  let spiritId;
  if (isPlayer && needsSpirit) {
    if (!hasAnyContract(caster)) {
      notify(caster, "§7精霊と契約していない");
      return false;
    }
    spiritId = spiritFor(caster, def.attribute);
    if (!spiritId) {
      notify(caster, "§7この魔術に応える精霊と契約していない");
      return false;
    }
    if (!consumePower(caster, spiritId, perTick)) {
      notify(caster, `§c${SPIRITS[spiritId].name}の力が足りない`);
      return false;
    }
  }

  const loc = tipLocation(caster);
  const spell = createSpell({ def, caster, dimension: caster.dimension, location: loc });
  if (!spell) return false;

  const c = {
    caster,
    isPlayer,
    spiritId,
    ai,
    spell,
    def,
    phase: "cast",
    tick: 1,
    castTicks: total,
    perTick,
    chargeTicks: 0,
    needsSpirit: isPlayer && needsSpirit,
    needsMana,
    consumed: isPlayer ? perTick : 0,
  };
  casts.set(caster.id, c);
  if (!isPlayer) setCastingPose(caster, true);
  updateForming(c);
  Fx.castStart(caster.dimension, loc, def.attribute);
  return true;
}

/** 詠唱が終わっていれば発動する（詠唱中は何もしない）。撃てたら true */
export function fireCast(player) {
  const c = casts.get(player.id);
  if (!c || c.phase === "cast" || c.spell.phase === "dead") return false;
  if (c.def.behavior === "wall") return launchWall(c);
  launch(c, player.getViewDirection()); // 発動時の視線
  return true;
}

/** 土壁：見ている場所へ立てる（溜めはない） */
function launchWall(c) {
  casts.delete(c.caster.id);
  c.spell.forceMax = c.def.force;
  c.spell.force = c.spell.forceMax;
  return raiseWall(c.spell, c.caster);
}

/** 中断：火の玉は消え、すでに使った精霊の力だけ失う */
export function interrupt(caster, message) {
  const c = casts.get(caster.id);
  if (!c) return;
  casts.delete(caster.id);
  if (!c.isPlayer) setCastingPose(caster, false);
  if (c.spell.phase !== "dead") {
    if (c.def.behavior !== "wall") Fx.fizzle(c.spell.dimension, c.spell.pos);
    killSpell(c.spell);
  }
  if (message && c.isPlayer) notify(caster, message);
}

function launch(c, direction) {
  const { caster, spell } = c;
  casts.delete(caster.id);
  if (!c.isPlayer) setCastingPose(caster, false);
  if (spell.phase === "dead") return;
  spell.dir = norm(direction);
  spell.phase = "flying";
  spell.prevPos = spell.pos;
  Fx.launch(spell.dimension, spell.pos, spell.size);
  if (!c.isPlayer) {
    try { caster.playAnimation("animation.na.wand.vanilla_swing", { blendOutTime: 0 }); } catch {}
  }
}

function setCastingPose(entity, on) {
  try { entity.setProperty("na:casting", on); } catch {}
}

/** 詠唱・溜めの進み具合から、火の玉の大きさと性能を決める */
function updateForming(c) {
  const { def, spell } = c;
  if (def.behavior === "wall") return; // 壁の大きさは発動時に決める
  const ratioBefore = spell.forceMax > 0 ? spell.force / spell.forceMax : 1;

  let size, forceMax, power, range;
  if (c.phase === "cast") {
    const p = c.tick / c.castTicks;
    size = lerp(def.size.start, def.size.cast, p);
    forceMax = def.force * p;
    power = def.power;
    range = def.range;
  } else {
    const k = c.chargeTicks / def.charge.maxTicks;
    size = lerp(def.size.cast, def.size.max, k);
    forceMax = def.force * (1 + def.charge.force * k);
    power = def.power * (1 + def.charge.power * k);
    range = def.range * (1 + def.charge.range * k);
  }
  setSize(spell, size);
  spell.forceMax = forceMax;
  spell.force = forceMax * ratioBefore; // ぶつかって減っていた分の割合は保つ
  spell.basePower = power;
  spell.baseRange = range;
}

/** プレイヤーだけ払う：精霊魔術は契約精霊の力、単純魔術は自分の魔力 */
function pay(c, amount) {
  if (c.needsSpirit) {
    if (!consumePower(c.caster, c.spiritId, amount)) return false;
  } else if (c.needsMana) {
    if (!consumeMana(c.caster, amount)) return false;
  } else {
    return true;
  }
  c.consumed += amount;
  return true;
}

function shortageMessage(c) {
  return c.needsSpirit ? `§c${SPIRITS[c.spiritId].name}の力が足りない` : "§b魔力が足りない";
}

export function tickCasting() {
  for (const [id, c] of [...casts.entries()]) {
    const { caster, spell, def } = c;
    if (!caster.isValid) {
      casts.delete(id);
      killSpell(spell);
      continue;
    }
    if (spell.phase === "dead") {
      // 魔術同士の衝突で火の玉が消えた
      casts.delete(id);
      if (!c.isPlayer) setCastingPose(caster, false);
      else notify(caster, "§7術式が打ち消された");
      continue;
    }
    if (c.isPlayer && !holdingWand(caster)) {
      interrupt(caster, "§7詠唱を中断した");
      continue;
    }

    // 魔術師は標的のほうを向く
    if (c.ai) {
      const t = c.ai.target;
      if (!t?.isValid) {
        interrupt(caster);
        continue;
      }
      faceToward(caster, aimPoint(t));
    }

    // 杖の先へついていく
    spell.prevPos = spell.pos;
    const loc = tipLocation(caster);
    if (spell.dimension.id !== caster.dimension.id || !moveSpell(spell, loc)) {
      interrupt(caster);
      continue;
    }

    if (c.phase === "cast") {
      if (!pay(c, c.perTick)) {
        interrupt(caster, shortageMessage(c));
        continue;
      }
      c.tick++;
      if (c.tick >= c.castTicks) {
        c.phase = "charge";
        Fx.ready(spell.dimension, loc, def.attribute);
      }
      updateForming(c);
    } else if (def.charge) {
      const goal = c.ai ? c.ai.chargeGoal : def.charge.maxTicks;
      if (c.chargeTicks < Math.min(goal, def.charge.maxTicks)) {
        const cost = c.needsMana ? def.charge.manaCost : def.charge.spiritCost;
        if (pay(c, cost / def.charge.maxTicks)) {
          c.chargeTicks++;
          updateForming(c);
        }
      } else if (c.ai) {
        // 溜め終わったら標的へ撃つ
        launch(c, sub(aimPoint(c.ai.target), spell.pos));
        continue;
      }
    }

    if (def.behavior === "wall") {
      previewWall(caster, def);
    } else {
      Fx.forming(spell.dimension, loc, spell.size);
      contactDamage(c);
    }
  }
}

function faceToward(entity, point) {
  const head = entity.getHeadLocation();
  const d = sub(point, head);
  const yaw = (Math.atan2(-d.x, d.z) * 180) / Math.PI;
  const pitch = (-Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
  try { entity.setRotation({ x: pitch, y: yaw }); } catch {}
}

/** 溜め中の火の玉にも攻撃判定 */
function contactDamage(c) {
  const { spell, def, caster } = c;
  if (!def.contact || system.currentTick % def.contact.interval !== 0) return;
  let near = [];
  try {
    near = spell.dimension.getEntities({
      location: spell.pos,
      maxDistance: spell.radius + 2,
      excludeFamilies: ["na_spell"],
      excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
    });
  } catch {}
  for (const e of near) {
    if (e.id === caster.id) continue;
    const feet = e.location;
    let headY = feet.y + 1.6;
    try { headY = e.getHeadLocation().y; } catch {}
    const y = Math.max(feet.y, Math.min(headY, spell.pos.y));
    const d = Math.hypot(spell.pos.x - feet.x, spell.pos.y - y, spell.pos.z - feet.z);
    if (d <= spell.radius + 0.35) damageEntity(e, def.contact.damage, def.contact.burnSeconds, spell);
  }
}
