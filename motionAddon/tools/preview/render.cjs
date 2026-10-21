// アニメーションの確認画像を作る
// 使い方: node render.cjs <出力フォルダ> [three.min.js のパス]
//   Playwright と Chromium が必要（three.js は node_modules/three/build/three.min.js）
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { simulate, humanoidBones } = require("./pose.cjs");

const OUT = path.resolve(process.argv[2] ?? "preview_out");
const THREE_JS = path.resolve(process.argv[3] ?? path.join(__dirname, "node_modules/three/build/three.min.js"));
const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(globalRoot, "playwright"));

// ---- 場面 ----
const WALK_SPEED = 4.3, SPRINT_SPEED = 5.6; // ブロック/秒
const base = (fp) => ({
  queries: {
    is_on_ground: 1, is_sprinting: 0, modified_move_speed: 0, modified_distance_moved: 0, walk_distance: 0, vertical_speed: 0, is_alive: 1,
    main_hand_item_max_duration: 1,
    // バニラが呼ぶ関数のクエリ（プレビューでは何も持っていない扱い）
    equipped_item_any_tag: () => 0, get_equipped_item_name: () => "", is_item_name_any: () => 0,
    position_delta: () => 0, is_riding_any_entity_of_type: () => 0, get_default_bone_pivot: () => 0,
  },
  vars: { is_first_person: fp ? 1 : 0, gliding_speed_value: 1, attack_time: 0, is_holding_right: 1, player_arm_height: 1, first_person_item_rotation_factor: 1, bob_animation: 0 },
});
function moving(speed, move, sprint, fp) {
  return (t) => {
    const s = base(fp);
    // modified_distance_moved は バニラの腕・脚の振りで 38.17°/単位。歩きで1歩 ≒ 0.47秒になるよう換算
    Object.assign(s.queries, { modified_move_speed: move, modified_distance_moved: t * speed * 4.4, walk_distance: t * speed * 0.6, is_sprinting: sprint });
    s.vars.bob_animation = fp ? 1 : 0;
    return s;
  };
}
function jumping(fp) {
  // 0.1秒後に跳んで、0.6秒空中、そのあと着地
  return (t) => {
    const s = base(fp);
    const air = t > 0.1 && t < 0.7;
    s.queries.is_on_ground = air ? 0 : 1;
    s.queries.vertical_speed = air ? 8.4 - (t - 0.1) * 28 : 0;
    return s;
  };
}
function attacking(fp, sword) {
  return (t) => {
    const s = base(fp);
    s.queries.equipped_item_any_tag = (slot, tag) => (sword && tag === "minecraft:is_sword" ? 1 : 0);
    s.vars.attack_time = t < 0.3 ? t / 0.3 : 0; // 0.3秒（6tick）の振り
    return s;
  };
}

const SCENES = [
  { name: "01_walk", title: "歩き（三人称）", frames: 8, dt: 0.06, state: moving(WALK_SPEED, 0.6, 0, false), views: ["front", "side"] },
  { name: "02_sprint", title: "走り（三人称）", frames: 8, dt: 0.05, state: moving(SPRINT_SPEED, 0.85, 1, false), views: ["front", "side"], warm: 0.6 },
  { name: "03_jump", title: "ジャンプと着地（三人称）", frames: 10, dt: 0.1, state: jumping(false), views: ["side"] },
  { name: "04_sword_tp", title: "剣の振り（三人称）", frames: 8, dt: 0.0375, state: attacking(false, true), views: ["front", "side"] },
  { name: "05_fp", title: "一人称：止まる・走り・ジャンプ・着地", frames: 1, custom: true },
  { name: "06_sword_fp", title: "剣の振り（一人称）", frames: 8, dt: 0.0375, state: attacking(true, true), views: ["fp"] },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2200, height: 1400 } });
  await page.goto("file://" + path.join(__dirname, "page.html"));
  await page.addScriptTag({ path: THREE_JS });
  await page.evaluate((bones) => window.setup(bones), humanoidBones());

  for (const sc of SCENES) {
    let cells = [];
    let cols;
    if (sc.custom) {
      // 一人称の比較：止まっている／走っている／空中（上り）／空中（下り）／着地直後
      const pick = (scene, at) => simulate({ frames: Math.round(at / 0.05) + 1, dt: 0.05, state: scene }).pop();
      const items = [
        ["止まる", pick((t) => base(true), 0.5)],
        ["走り", pick(moving(SPRINT_SPEED, 0.85, 1, true), 0.8)],
        ["上り", pick(jumping(true), 0.25)],
        ["下り", pick(jumping(true), 0.6)],
        ["着地直後", pick(jumping(true), 0.75)],
      ];
      cells = items.map(([label, f]) => ({ view: "fp", label, bones: f.bones }));
      cols = cells.length;
    } else {
      // warm：なめらかに追う変数（走りの度合いなど）が落ち着くまで先に進めてから並べる
      const skip = Math.round((sc.warm ?? 0) / sc.dt);
      const frames = simulate({ frames: skip + sc.frames, dt: sc.dt, state: sc.state, substeps: 4 }).slice(skip);
      for (const view of sc.views) frames.forEach((f, i) => cells.push({ view, label: `${view} ${((i * sc.dt) * 1000).toFixed(0)}ms`, bones: f.bones }));
      cols = sc.frames;
    }
    const rows = Math.ceil(cells.length / cols);
    await page.evaluate(([r, c, cl, t]) => window.drawSheet(r, c, cl, t), [rows, cols, cells, sc.title]);
    const el = await page.$("#grid");
    await el.screenshot({ path: path.join(OUT, sc.name + ".png") });
    console.log("wrote", sc.name);
  }
  await browser.close();
})();
