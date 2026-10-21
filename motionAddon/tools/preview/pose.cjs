// 1コマぶんのプレイヤーの姿勢（骨ごとの回転・位置）を、バニラ＋このアドオンのアニメーションから計算する
const fs = require("fs");
const path = require("path");
const { evaluate, run, makeScope } = require("./molang.cjs");

const TOOLS = path.join(__dirname, "..");
const RP = path.join(TOOLS, "..", "motionAddon_RP");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\s*\/\/.*$/gm, ""));

// アニメーション（バニラ＋このアドオン）を id → 定義 にまとめる
const ANIMS = {};
for (const f of ["player.animation.json", "humanoid.animation.json", "player_firstperson.animation.json"]) {
  Object.assign(ANIMS, readJson(path.join(TOOLS, "vanilla", f)).animations);
}
Object.assign(ANIMS, readJson(path.join(RP, "animations", "motion.player.animation.json")).animations);

const ENTITY = readJson(path.join(RP, "entity", "player.entity.json"))["minecraft:client_entity"].description;

// バニラの root コントローラーの中から、プレビューで再現する分（三人称／一人称）
const VANILLA_THIRD = [
  ["humanoid_base_pose"], ["look_at_target_default"], ["move.arms"], ["move.legs"], ["holding"],
  ["bob"], ["attack.positions", "variable.attack_time >= 0.0"], ["attack.rotations", "variable.attack_time >= 0.0"],
];
const VANILLA_FIRST = [
  ["first_person_base_pose"], ["first_person_breathing_bob"], ["first_person_swap_item"],
  ["first_person_attack_rotation", "variable.attack_time > 0.0"], ["first_person_empty_hand"],
  ["first_person_walk", "variable.bob_animation"],
];

function applyAnimation(id, scope, bones) {
  const def = ANIMS[id];
  if (!def) throw new Error(`アニメーションがない: ${id}`);
  for (const [name, ch] of Object.entries(def.bones ?? {})) {
    // override_previous_animation：それまでのアニメーションの分を捨てて、この骨はこのアニメーションだけにする
    if (def.override_previous_animation) delete bones[name.toLowerCase()];
    const b = (bones[name.toLowerCase()] ??= { rot: [0, 0, 0], pos: [0, 0, 0] });
    for (const key of ["rotation", "position"]) {
      if (!Array.isArray(ch[key])) continue;
      const out = key === "rotation" ? b.rot : b.pos;
      ch[key].forEach((e, i) => (out[i] += evaluate(e, scope)));
    }
  }
}

/**
 * 1つの場面（時間を進めながら何コマか）を計算する
 * @param scenario.frames  コマ数
 * @param scenario.dt      1コマの秒数
 * @param scenario.state(t, i) → { queries, vars } その時刻の入力
 */
function simulate(scenario) {
  const vars = {};
  const queries = {};
  const scope = makeScope(queries, vars);
  run(ENTITY.scripts.initialize ?? [], scope);
  const frames = [];
  const steps = scenario.substeps ?? 4; // コマの間も細かく進めて、なめらかに追う変数を正しくする
  for (let i = 0; i < scenario.frames; i++) {
    for (let s = 1; s <= steps; s++) {
      const t = (i - 1 + s / steps) * scenario.dt;
      const st = scenario.state(Math.max(0, t), i);
      Object.assign(queries, { delta_time: scenario.dt / steps, life_time: 10 + t }, st.queries);
      Object.assign(vars, st.vars);
      run(ENTITY.scripts.pre_animation ?? [], scope);
    }
    const bones = {};
    const fp = !!vars.is_first_person;
    for (const [name, cond] of fp ? VANILLA_FIRST : VANILLA_THIRD) {
      if (cond && !evaluate(cond, scope)) continue;
      applyAnimation(ENTITY.animations[name], scope, bones);
    }
    const mine = [];
    for (const entry of ENTITY.scripts.animate) {
      if (typeof entry !== "object") continue;
      const [name, cond] = Object.entries(entry)[0];
      if (!name.startsWith("motion.")) continue;
      if (!evaluate(cond, scope)) continue;
      applyAnimation(ENTITY.animations[name], scope, bones);
      mine.push(name);
    }
    frames.push({ bones, fp, mine, vars: { ...vars } });
  }
  return frames;
}

/** 人型（geometry.humanoid.custom）の骨 */
function humanoidBones() {
  const mobs = readJson(path.join(TOOLS, "vanilla", "mobs.json"));
  return mobs["geometry.humanoid.custom:geometry.humanoid"].bones;
}

module.exports = { simulate, humanoidBones };
