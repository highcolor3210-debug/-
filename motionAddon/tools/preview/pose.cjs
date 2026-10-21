// 1コマぶんのプレイヤーの姿勢（骨ごとの回転・位置）を、バニラ＋このアドオンのアニメーションから計算する
const fs = require("fs");
const path = require("path");
const { evaluate, run, makeScope } = require("./molang.cjs");

const TOOLS = path.join(__dirname, "..");
// MOTION_RP で別の出力先（アレックス体型の版など）を、MOTION_SLIM=1 でアレックス体型のスキンのモデルを使う
const RP = process.env.MOTION_RP || path.join(TOOLS, "..", "motionAddon_RP");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\s*\/\/.*$/gm, ""));

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

/** キーフレーム（{時刻: 値 または {post, lerp_mode}}）を時刻 t で補間 */
function sampleKeys(frames, t, scope) {
  const keys = Object.keys(frames).map(Number).sort((a, b) => a - b);
  const val = (k) => {
    const raw = frames[String(k)] ?? frames[k.toFixed(1)] ?? frames[Object.keys(frames).find((s) => Number(s) === k)];
    const v = Array.isArray(raw) ? raw : raw.post ?? raw.pre;
    return v.map((e) => evaluate(e, scope));
  };
  const mode = (k) => {
    const raw = frames[Object.keys(frames).find((s) => Number(s) === k)];
    return Array.isArray(raw) ? "linear" : raw.lerp_mode ?? "linear";
  };
  if (t <= keys[0]) return val(keys[0]);
  if (t >= keys[keys.length - 1]) return val(keys[keys.length - 1]);
  let i = 0;
  while (keys[i + 1] < t) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const u = (t - k1) / (k2 - k1);
  const p1 = val(k1), p2 = val(k2);
  if (mode(k1) !== "catmullrom") return p1.map((a, j) => a + (p2[j] - a) * u);
  const p0 = val(keys[Math.max(0, i - 1)]), p3 = val(keys[Math.min(keys.length - 1, i + 2)]);
  return p1.map((_, j) => {
    const a = p0[j], b = p1[j], c = p2[j], d = p3[j];
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  });
}

function applyAnimation(id, scope, bones, weight, time) {
  const def = ANIMS[id];
  if (!def) throw new Error(`アニメーションがない: ${id}`);
  let t = def.anim_time_update !== undefined ? evaluate(def.anim_time_update, scope) : time;
  const len = def.animation_length;
  if (len && def.loop === true) t = ((t % len) + len) % len;
  for (const [name, ch] of Object.entries(def.bones ?? {})) {
    const key = name.toLowerCase();
    // override_previous_animation：それまでのアニメーションの分を捨てて、この骨はこのアニメーションだけにする
    if (def.override_previous_animation) delete bones[key];
    const b = (bones[key] ??= { rot: [0, 0, 0], pos: [0, 0, 0] });
    for (const k of ["rotation", "position"]) {
      if (ch[k] === undefined) continue;
      const v = Array.isArray(ch[k]) ? ch[k].map((e) => evaluate(e, scope)) : sampleKeys(ch[k], t, scope);
      const out = k === "rotation" ? b.rot : b.pos;
      v.forEach((x, i) => (out[i] += x * weight));
    }
  }
}

/**
 * 1つの場面（時間を進めながら何コマか）を計算する
 * @param scenario.state(t) → { queries, vars } その時刻の入力
 */
function simulate(scenario) {
  const vars = {};
  const queries = {};
  const scope = makeScope(queries, vars);
  run(ENTITY.scripts.initialize ?? [], scope);
  const frames = [];
  const steps = scenario.substeps ?? 4; // コマの間も細かく進めて、なめらかに追う変数を正しくする
  for (let i = 0; i < scenario.frames; i++) {
    let t = 0;
    for (let s = 1; s <= steps; s++) {
      t = Math.max(0, (i - 1 + s / steps) * scenario.dt);
      const st = scenario.state(t, i);
      Object.assign(queries, { delta_time: scenario.dt / steps, life_time: 10 + t }, st.queries);
      Object.assign(vars, st.vars);
      run(ENTITY.scripts.pre_animation ?? [], scope);
    }
    const bones = {};
    const fp = !!vars.is_first_person;
    for (const [name, cond] of fp ? VANILLA_FIRST : VANILLA_THIRD) {
      if (cond && !evaluate(cond, scope)) continue;
      applyAnimation(ENTITY.animations[name], scope, bones, 1, t);
    }
    const mine = [];
    for (const entry of ENTITY.scripts.animate) {
      if (typeof entry !== "object") continue;
      const [name, cond] = Object.entries(entry)[0];
      if (!name.startsWith("motion.")) continue;
      const w = evaluate(cond, scope);
      if (!w) continue;
      applyAnimation(ENTITY.animations[name], scope, bones, w, t);
      mine.push(`${name}:${w.toFixed(2)}`);
    }
    frames.push({ bones, fp, mine, vars: { ...vars } });
  }
  return frames;
}

/** スキン（バニラの人型）と、関節つきの腕・脚のモデル */
function models() {
  const mobs = readJson(path.join(TOOLS, "vanilla", "mobs.json"));
  const limbs = readJson(path.join(RP, "models", "entity", "motion_limbs.geo.json"))["minecraft:geometry"][0].bones;
  const skin = process.env.MOTION_SLIM
    ? [...mobs["geometry.humanoid.customSlim"].bones, ...mobs["geometry.humanoid.custom:geometry.humanoid"].bones.filter((b) => b.name === "root")]
    : mobs["geometry.humanoid.custom:geometry.humanoid"].bones;
  return { skin, limbs };
}

module.exports = { simulate, models };
