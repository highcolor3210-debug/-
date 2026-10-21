"""バニラの player.entity.json に、このアドオンの変数とアニメーションを足して書き出す
使い方: python build_player_entity.py
  入力: tools/vanilla/player.entity.json（Mojang/bedrock-samples の resource_pack/entity/player.entity.json）
  出力: motionAddon_RP/entity/player.entity.json

バニラの中身は変えずに「足すだけ」にしているので、マイクラの更新で player.entity.json が
変わったら、tools/vanilla/ のファイルを差し替えてこのスクリプトを実行し直せばよい。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "vanilla", "player.entity.json")
DST = os.path.join(HERE, "..", "motionAddon_RP", "entity", "player.entity.json")

# 変数の初期値
INITIALIZE = [
    "v.motion_sprint = 0.0;",
    "v.motion_air = 0.0;",
    "v.motion_vy = 0.0;",
    "v.motion_was_ground = 1.0;",
    "v.motion_air_start = 0.0;",
    "v.motion_land_time = -10.0;",
]

# 毎フレームの計算（バニラの pre_animation のあとに足す）
PRE_ANIMATION = [
    "v.motion_dt = math.clamp(q.delta_time, 0.0, 0.1);",
    "v.motion_follow = math.min(1.0, v.motion_dt * 8.0);",
    # 歩きの位相と速さ（バニラの腕・脚の振りと同じ位相）
    "v.motion_phase = q.modified_distance_moved * 38.17;",
    "v.motion_speed = math.clamp(q.modified_move_speed, 0.0, 1.0);",
    # 地面にいるか（乗り物・泳ぎ・滑空中は「空中」の動きにしない）
    "v.motion_ground = q.is_on_ground || q.is_riding || q.is_swimming || q.is_gliding;",
    # 走り・空中は急に切り替わらないよう、なめらかに 0〜1 へ近づける
    "v.motion_sprint = math.lerp(v.motion_sprint, (q.is_sprinting && v.motion_ground && !q.is_swimming) ? 1.0 : 0.0, v.motion_follow);",
    "v.motion_air = math.lerp(v.motion_air, v.motion_ground ? 0.0 : 1.0, math.min(1.0, v.motion_dt * 10.0));",
    "v.motion_vy = math.lerp(v.motion_vy, v.motion_ground ? 0.0 : math.clamp(q.vertical_speed / 10.0, -1.0, 1.0), v.motion_follow);",
    # 着地：0.3秒より長く空中にいたあとに着地したら、0.3秒かけて 1→0
    "v.motion_air_start = (!v.motion_ground && v.motion_was_ground) ? q.life_time : v.motion_air_start;",
    "v.motion_land_time = (v.motion_ground && !v.motion_was_ground && (q.life_time - v.motion_air_start) > 0.3) ? q.life_time : v.motion_land_time;",
    "v.motion_was_ground = v.motion_ground;",
    "v.motion_land = math.clamp(1.0 - (q.life_time - v.motion_land_time) / 0.3, 0.0, 1.0);",
    # 剣の振り：attack_time（0→1）を、なめらかな進み具合と、0→1→0 の強さにする
    "v.motion_sword = q.equipped_item_any_tag('slot.weapon.mainhand', 'minecraft:is_sword');",
    "v.motion_slash = math.clamp(variable.attack_time, 0.0, 1.0);",
    "v.motion_slash_env = math.sin(v.motion_slash * 180.0);",
    "v.motion_slash = v.motion_slash * v.motion_slash * (3.0 - 2.0 * v.motion_slash);",
]

ANIMATIONS = {
    "motion.third_person.walk": "animation.motion.third_person.walk",
    "motion.third_person.sprint": "animation.motion.third_person.sprint",
    "motion.third_person.air": "animation.motion.third_person.air",
    "motion.third_person.sword_slash": "animation.motion.third_person.sword_slash",
    "motion.third_person.sword_slash_arm": "animation.motion.third_person.sword_slash_arm",
    "motion.first_person.move": "animation.motion.first_person.move",
    "motion.first_person.sword_slash": "animation.motion.first_person.sword_slash",
}

# 三人称で体を動かしてよいとき（インベントリの人形・地図・寝る・乗る・泳ぐ・這う は除く）
THIRD = "!variable.is_first_person && !variable.is_paperdoll && !variable.map_face_icon && !q.is_sleeping && !q.is_riding && variable.swim_amount <= 0.0 && !q.is_crawling"
FIRST = "variable.is_first_person && !variable.is_paperdoll"
SLASH = "v.motion_sword && variable.attack_time > 0.0"

ANIMATE = [
    {"motion.third_person.walk": THIRD},
    {"motion.third_person.sprint": f"{THIRD} && v.motion_sprint > 0.01"},
    {"motion.third_person.air": f"{THIRD} && (v.motion_air > 0.01 || v.motion_land > 0.0)"},
    {"motion.third_person.sword_slash": f"{THIRD} && {SLASH}"},
    {"motion.third_person.sword_slash_arm": f"{THIRD} && {SLASH}"},
    {"motion.first_person.move": FIRST},
    {"motion.first_person.sword_slash": f"{FIRST} && {SLASH}"},
]


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    desc = data["minecraft:client_entity"]["description"]
    scripts = desc["scripts"]
    scripts["initialize"] = scripts.get("initialize", []) + INITIALIZE
    scripts["pre_animation"] = scripts.get("pre_animation", []) + PRE_ANIMATION
    for k in ANIMATIONS:
        assert k not in desc["animations"], k
    desc["animations"].update(ANIMATIONS)
    scripts["animate"] = scripts.get("animate", []) + ANIMATE  # バニラ（root）のあとに足す
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("ok", os.path.relpath(DST))


if __name__ == "__main__":
    main()
