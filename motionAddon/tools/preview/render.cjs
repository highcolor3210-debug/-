// アニメーションの確認画像を作る
// 使い方: node render.cjs <出力フォルダ> <three.min.js のパス> <スキンの png>
//   Playwright と Chromium が必要
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { simulate, models } = require("./pose.cjs");

const OUT = path.resolve(process.argv[2] ?? "preview_out");
const THREE_JS = path.resolve(process.argv[3]);
const SKIN = path.resolve(process.argv[4]);
const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(globalRoot, "playwright"));

// ---- 場面 ----
const base = (fp, sword = false) => ({
  queries: {
    is_on_ground: 1, is_sprinting: 0, modified_move_speed: 0, modified_distance_moved: 0, walk_distance: 0, vertical_speed: 0, is_alive: 1,
    main_hand_item_max_duration: 1, is_persona_or_premium_skin: 0,
    equipped_item_any_tag: (slot, tag) => (sword && tag === "minecraft:is_sword" ? 1 : 0),
    get_equipped_item_name: () => (sword ? "iron_sword" : ""), is_item_name_any: () => 0,
    position_delta: () => 0, is_riding_any_entity_of_type: () => 0, get_default_bone_pivot: (bone, axis) => pivot(bone, axis),
  },
  vars: { is_first_person: fp ? 1 : 0, gliding_speed_value: 1, attack_time: 0, is_holding_right: sword ? 1 : 0, player_arm_height: 1, first_person_item_rotation_factor: 1, bob_animation: 0 },
});
const M = models();
function pivot(bone, axis) {
  const b = M.skin.find((x) => x.name.toLowerCase() === String(bone).toLowerCase());
  return b?.pivot?.[axis] ?? 0;
}
// modified_distance_moved は バニラの腕・脚の振りで 38.17°/単位。walk_distance は一人称の揺れ（180°/ブロック）
function moving(speed, move, sprint, fp, sword) {
  return (t) => {
    const s = base(fp, sword);
    Object.assign(s.queries, { modified_move_speed: move, modified_distance_moved: t * speed * 4.4, walk_distance: t * speed * 0.6, is_sprinting: sprint });
    s.vars.bob_animation = fp ? 1 : 0;
    return s;
  };
}
function jumping(fp, sword) {
  return (t) => {
    const s = base(fp, sword);
    const air = t > 0.1 && t < 0.7;
    s.queries.is_on_ground = air ? 0 : 1;
    s.queries.vertical_speed = air ? 8.4 - (t - 0.1) * 28 : 0;
    return s;
  };
}
function attacking(fp, sword = true) {
  return (t) => {
    const s = base(fp, sword);
    s.vars.attack_time = t < 0.3 ? t / 0.3 : 0; // 0.3秒（6tick）の振り
    return s;
  };
}

const SCENES = [
  { name: "00_idle", title: "止まっている（スキンの貼り方の確認）", frames: 1, dt: 0.05, state: () => base(false, true), views: ["front", "side", "back"], holding: true },
  { name: "01_walk", title: "歩き（三人称）", frames: 8, dt: 0.06, state: moving(4.3, 0.6, 0, false, true), views: ["front", "side"], holding: true },
  { name: "02_run", title: "走り（三人称）", frames: 8, dt: 0.045, state: moving(5.6, 0.9, 1, false, true), views: ["front", "side"], holding: true, warm: 0.6 },
  { name: "02b_run_fallback", title: "走り（q.is_sprinting が 0 でも、振りの大きさ 1.0 で走りになるか）", frames: 8, dt: 0.045, state: moving(5.6, 1.0, 0, false, true), views: ["side"], holding: true, warm: 0.6 },
  { name: "02c_custom_shape", title: "形が違うスキン（肩の位置が 1 ずれている）→ 関節を使わずバニラの腕・脚になるか", frames: 4, dt: 0.06,
    state: (t) => { const st = moving(4.3, 0.6, 0, false, true)(t); st.queries.get_default_bone_pivot = (b, a) => (String(b).toLowerCase() === "rightarm" && a === 1 ? 23 : pivot(b, a)); return st; },
    views: ["front"], holding: true },
  { name: "03_jump", title: "ジャンプと着地（三人称）", frames: 10, dt: 0.09, state: jumping(false, true), views: ["side"], holding: true },
  { name: "04_sword_tp", title: "剣の振り（三人称）", frames: 9, dt: 0.0333, state: attacking(false), views: ["front", "side"], holding: true },
  { name: "04b_punch_tp", title: "素手のパンチ（三人称）", frames: 9, dt: 0.0333, state: attacking(false, false), views: ["front", "side"], holding: false },
  { name: "05_fp", title: "一人称：止まる・走り・上り・下り・着地", custom: true },
  { name: "06b_punch_fp", title: "素手のパンチ（一人称）", frames: 9, dt: 0.0333, state: attacking(true, false), views: ["fp"], holding: false },
  { name: "06_sword_fp", title: "剣の振り（一人称）", frames: 9, dt: 0.0333, state: attacking(true), views: ["fp"], holding: true },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2600, height: 1400 } });
  await page.goto("file://" + path.join(__dirname, "page.html"));
  await page.addScriptTag({ path: THREE_JS });
  const skinUrl = "data:image/png;base64," + fs.readFileSync(SKIN).toString("base64");
  await page.evaluate(([m, s]) => window.setup(m, s), [M, skinUrl]);

  for (const sc of SCENES) {
    let cells = [];
    let cols;
    if (sc.custom) {
      const pick = (scene, at) => simulate({ frames: Math.round(at / 0.05) + 1, dt: 0.05, state: scene }).pop();
      const items = [
        ["止まる", pick(() => base(true, true), 0.5)],
        ["走り", pick(moving(5.6, 0.9, 1, true, true), 0.8)],
        ["上り", pick(jumping(true, true), 0.25)],
        ["下り", pick(jumping(true, true), 0.6)],
        ["着地直後", pick(jumping(true, true), 0.75)],
        ["素手", pick(() => base(true, false), 0.5)],
      ];
      cells = items.map(([label, f], i) => ({ view: "fp", label, bones: f.bones, holding: i < 5, joints: !!f.vars.motion_joints, slim: f.vars.motion_slim }));
      cols = cells.length;
    } else {
      const skip = Math.round((sc.warm ?? 0) / sc.dt);
      const frames = simulate({ frames: skip + sc.frames, dt: sc.dt, state: sc.state, substeps: 4 }).slice(skip);
      for (const view of sc.views) {
        frames.forEach((f, i) => cells.push({ view, label: `${view} ${(i * sc.dt * 1000).toFixed(0)}ms${f.vars.motion_slim ? " (細)" : ""}`, bones: f.bones, holding: sc.holding, joints: !!f.vars.motion_joints, slim: f.vars.motion_slim }));
      }
      cols = Math.max(sc.frames, sc.views.length === 3 ? 3 : 1);
      if (sc.frames === 1) cols = sc.views.length;
    }
    const rows = Math.ceil(cells.length / cols);
    await page.evaluate(([r, c, cl, t]) => window.drawSheet(r, c, cl, t), [rows, cols, cells, sc.title]);
    await (await page.$("#grid")).screenshot({ path: path.join(OUT, sc.name + ".png") });
    console.log("wrote", sc.name);
  }
  await browser.close();
})();
