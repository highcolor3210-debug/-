"""Motion Addon を組み立てる
使い方: python build.py [出力先のリソースパック]（既定は motionAddon_RP/。manifest.json と pack_icon.png はそのまま使う）

作るもの（motionAddon_RP/ の中）
  models/entity/motion_limbs.geo.json          ひじ・ひざのある腕と脚（プレイヤーのスキンで描く）
  render_controllers/motion.player.render_controllers.json
      プレイヤーの描き方。バニラの腕・脚を隠して、関節つきの腕・脚を出す
  animations/motion.player.animation.json      歩き・走り・ジャンプ・着地・剣の振り
  entity/player.entity.json                    バニラ（tools/vanilla/）に上のものを足したもの

しくみ
- 関節つきの腕・脚は、マントと同じやり方（別のモデルを同じ骨の名前で重ねて、別の描画で出す）。
  上腕・ふとももは バニラと同じ骨の名前なので、バニラのアニメーションもそのまま効く。
  前腕（forearm）とすね（shin）だけがこのアドオンの骨。
- キャラクタークリエイターのスキン・マーケットプレイスのスキンは描き方が違うので、関節を使わずバニラのまま
  （v.motion_joints が 0）。
- スキンの腕の太さ（スティーブ体型／アレックス体型）は、スキンのモデルの rightItem の高さで見分ける
  （太い 15.0、細い 14.5。このアドオンのモデルには rightItem がないので、必ずスキンのモデルの値になる）。
  関節つきのモデルは両方の体型ぶん入れておき、描くときに選ぶ。
- 手に持つ物はバニラの腕の rightItem に付く（ひじがない）。前腕を曲げたときは、rightItem の骨を
  ひじを中心に同じだけ回したのと同じ位置・向きへ動かして、手から離れないようにしている（hand_follow）。
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "motionAddon_RP")


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.loads(re.sub(r"(?m)^\s*//.*$", "", f.read()))


def write_json(rel, data):
    path = os.path.join(RP, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", rel)


MOBS = read_json(os.path.join(HERE, "vanilla", "mobs.json"))
SKIN_GEO = {
    "wide": {b["name"]: b for b in MOBS["geometry.humanoid.custom:geometry.humanoid"]["bones"]},
    "slim": {b["name"]: b for b in MOBS["geometry.humanoid.customSlim"]["bones"]},
}
# root・waist・body の骨組みは custom から取る（customSlim は親から受け継ぐ前提で持っていないものがある）
SKELETON = SKIN_GEO["wide"]
GEO_ID = {"wide": "geometry.motion.limbs", "slim": "geometry.motion.limbs_slim"}
SLIM_CHECK = "(q.get_default_bone_pivot('rightitem', 1) > 14.25 && q.get_default_bone_pivot('rightitem', 1) < 14.75)"

# ---------------------------------------------------------------- モデル
def face_uvs(u0, v0, w, h, d, y_from, y_to):
    """箱UV（統合版のスキンの並び）のうち、高さ y_from..y_to（上から数えたピクセル）の部分だけを面ごとに切り出す"""
    hh = y_to - y_from
    side_v = v0 + d + y_from
    return {
        "east": {"uv": [u0, side_v], "uv_size": [d, hh]},
        "north": {"uv": [u0 + d, side_v], "uv_size": [w, hh]},
        "west": {"uv": [u0 + d + w, side_v], "uv_size": [d, hh]},
        "south": {"uv": [u0 + 2 * d + w, side_v], "uv_size": [w, hh]},
        "up": {"uv": [u0 + d, v0], "uv_size": [w, d]},
        "down": {"uv": [u0 + d + w, v0 + d], "uv_size": [w, -d]},
    }


def split_cubes(cube, cut):
    """縦に長い箱を、高さ cut（下から）で上下2つに分ける。uv はスキンの同じ場所を指す"""
    (ox, oy, oz), (w, h, d) = cube["origin"], cube["size"]
    u0, v0 = cube["uv"]
    inflate = cube.get("inflate")
    top_h = oy + h - cut  # 上の箱の高さ
    upper = {"origin": [ox, cut, oz], "size": [w, top_h, d], "uv": face_uvs(u0, v0, w, h, d, 0, top_h)}
    lower = {"origin": [ox, oy, oz], "size": [w, cut - oy, d], "uv": face_uvs(u0, v0, w, h, d, top_h, h)}
    if inflate:
        upper["inflate"] = lower["inflate"] = inflate
    return upper, lower


LIMBS = [
    # 上の骨（バニラと同じ名前）, 重ね着の骨, 下の骨（このアドオン）, 関節の高さ
    ("rightArm", "rightSleeve", "rightForearm"),
    ("leftArm", "leftSleeve", "leftForearm"),
    ("rightLeg", "rightPants", "rightShin"),
    ("leftLeg", "leftPants", "leftShin"),
]


def joint_height(bone):
    c = bone["cubes"][0]
    return c["origin"][1] + c["size"][1] / 2  # 箱の真ん中


def build_geometry(variant):
    BONES = SKIN_GEO[variant]
    bones = []
    for name in ("root", "waist", "body"):
        b = SKELETON[name]
        bones.append({k: v for k, v in b.items() if k in ("name", "parent", "pivot")})
    for upper_name, layer_name, lower_name in LIMBS:
        up = BONES[upper_name]
        cut = joint_height(up)
        cubes_up, cubes_low = [], []
        for c in up["cubes"] + BONES[layer_name]["cubes"]:
            a, b = split_cubes(c, cut)
            cubes_up.append(a)
            cubes_low.append(b)
        bones.append({"name": upper_name, "parent": up["parent"], "pivot": up["pivot"], "cubes": cubes_up})
        bones.append({"name": lower_name, "parent": upper_name, "pivot": [up["pivot"][0], cut, up["pivot"][2]], "cubes": cubes_low})
    return {
            "description": {
                "identifier": GEO_ID[variant],
                "texture_width": 64, "texture_height": 64,
                "visible_bounds_width": 2, "visible_bounds_height": 3, "visible_bounds_offset": [0, 1.5, 0],
            },
            "bones": bones,
    }


# ---------------------------------------------------------------- 手に持つ物をひじに合わせて動かす
def item_offset(variant):
    b = SKIN_GEO[variant]
    item = b["rightItem"]["pivot"]
    return item[1] - joint_height(b["rightArm"]), item[2] - b["rightArm"]["pivot"][2]


# ひじから rightItem までの距離は どちらの体型でも同じ（3 下・1 前）なので、ひとつの式で両方に使える
D_Y, D_Z = item_offset("wide")
assert (D_Y, D_Z) == item_offset("slim")


def hand_follow(theta):
    """前腕を x 軸まわりに theta 度（統合版の値）曲げたとき、rightItem に足す位置（統合版の値）"""
    phi = math.radians(-theta)  # 統合版の x 回転は数学の向きと逆
    y2 = D_Y * math.cos(phi) - D_Z * math.sin(phi)
    z2 = D_Y * math.sin(phi) + D_Z * math.cos(phi)
    return [0.0, round(y2 - D_Y, 3), round(z2 - D_Z, 3)]


def hand_follow_molang(theta_expr):
    """同じことを Molang で（手続き的に曲げるとき用）"""
    c, s = f"math.cos({theta_expr})", f"math.sin({theta_expr})"
    # phi = -theta → cos(phi)=cos(theta), sin(phi)=-sin(theta)
    y = f"(({D_Y}) * {c} + ({D_Z}) * {s} - ({D_Y}))"
    z = f"(({-D_Y}) * {s} + ({D_Z}) * {c} - ({D_Z}))"
    return [0.0, f"{y} * v.motion_joints", f"{z} * v.motion_joints"]


# ---------------------------------------------------------------- キーフレーム
def keys(points, fn=lambda v: v):
    """{時刻: 値} → 統合版のキーフレーム（なめらかな catmullrom）"""
    out = {}
    for t, v in sorted(points.items()):
        out[f"{t:g}"] = {"post": fn(v), "lerp_mode": "catmullrom"}
    return out


def shift(points, dt):
    """周期 1.0 のキーを dt ずらす（左右の脚・腕は半周期ずれ）"""
    out = {}
    for t, v in points.items():
        out[round((t + dt) % 1.0, 4)] = v
    if 0.0 in out:
        out[1.0] = out[0.0]
    if 1.0 in out and 0.0 not in out:
        out[0.0] = out[1.0]
    return out


def xyz(v):
    return v if isinstance(v, list) else [v, 0.0, 0.0]


# 歩き（周期 1.0。0.0 で右脚が後ろ＝けり出し、0.5 で右脚が前＝着地）
WALK = {
    "thigh": {0: 22, 0.12: 10, 0.25: -8, 0.38: -22, 0.5: -25, 0.62: -12, 0.75: 2, 0.88: 14, 1: 22},
    "shin": {0: 8, 0.1: 35, 0.2: 50, 0.32: 28, 0.45: 4, 0.5: 2, 0.6: 10, 0.75: 4, 0.9: 4, 1: 8},
    "arm": {0: -24, 0.25: -2, 0.5: 20, 0.75: 0, 1: -24},
    "forearm": {0: -28, 0.25: -16, 0.5: -10, 0.75: -16, 1: -28},
    "body_y": {0: -5, 0.25: 0, 0.5: 5, 0.75: 0, 1: -5},
    "root_y": {0: -0.4, 0.25: 0.2, 0.5: -0.4, 0.75: 0.2, 1: -0.4},
    "lean": 3,
    "arm_out": 3,
}
# 走り
RUN = {
    "thigh": {0: 35, 0.1: 15, 0.2: -15, 0.32: -45, 0.42: -48, 0.5: -32, 0.62: -8, 0.75: 15, 0.88: 30, 1: 35},
    "shin": {0: 25, 0.08: 70, 0.16: 105, 0.26: 90, 0.38: 45, 0.46: 12, 0.5: 10, 0.58: 28, 0.7: 18, 0.85: 12, 0.95: 15, 1: 25},
    "arm": {0: -55, 0.25: -5, 0.5: 45, 0.75: -5, 1: -55},
    "forearm": {0: -110, 0.25: -90, 0.5: -70, 0.75: -90, 1: -110},
    "body_y": {0: -8, 0.25: 0, 0.5: 8, 0.75: 0, 1: -8},
    "root_y": {0: -1.0, 0.25: 1.2, 0.5: -1.0, 0.75: 1.2, 1: -1.0},
    "lean": 14,
    "arm_out": 8,
}


def cycle_animation(c):
    # 左は右の半周期ずれ。右腕は「左脚が前」のとき前（＝右脚が後ろの 0.0 で前）
    right_item = {t: hand_follow(v) for t, v in c["forearm"].items()}
    return {
        "loop": True,
        "animation_length": 1.0,
        "anim_time_update": "math.mod(v.motion_phase, 360.0) / 360.0",
        "bones": {
            "root": {"position": keys(c["root_y"], lambda v: [0.0, v, 0.0])},
            "waist": {"rotation": [c["lean"], 0.0, 0.0]},
            "body": {"rotation": keys(c["body_y"], lambda v: [0.0, v, 0.0])},
            "rightleg": {"rotation": keys(c["thigh"], xyz)},
            "rightshin": {"rotation": keys(c["shin"], xyz)},
            "leftleg": {"rotation": keys(shift(c["thigh"], 0.5), xyz)},
            "leftshin": {"rotation": keys(shift(c["shin"], 0.5), xyz)},
            "rightarm": {"rotation": keys(c["arm"], lambda v: [v, 0.0, c["arm_out"]])},
            "rightforearm": {"rotation": keys(c["forearm"], xyz)},
            "rightitem": {
                "rotation": keys(c["forearm"], lambda v: [f"{v} * v.motion_joints", 0.0, 0.0]),
                "position": keys(right_item, lambda p: [0.0, f"{p[1]} * v.motion_joints", f"{p[2]} * v.motion_joints"]),
            },
            "leftarm": {"rotation": keys(shift(c["arm"], 0.5), lambda v: [v, 0.0, -c["arm_out"]])},
            "leftforearm": {"rotation": keys(shift(c["forearm"], 0.5), xyz)},
        },
    }


# 剣の振り（三人称）。時刻は attack_time（0→1、6tick）
SLASH_TP = {
    #       上腕 [x, y, z]       前腕   刃の傾き  体 [x, y]    左腕 x
    0.00: ([-18, 0, 0], -10, 0, [0, 0], 0),
    0.18: ([-160, 25, 25], -70, -40, [-6, 22], -10),
    0.42: ([-75, -45, -5], -15, 55, [10, -28], -35),
    0.62: ([-35, -65, -10], -25, 40, [6, -25], -30),
    1.00: ([-18, 0, 0], -10, 0, [0, 0], 0),
}
# 剣の振り（一人称）。バニラの一人称の腕の位置（first_person.empty_hand）に足す量
FP_BASE_POS, FP_BASE_ROT = [13.5, -10.0, 12.0], [95.0, -45.0, 115.0]
SLASH_FP = {
    # 右上へ振りかぶって、画面の真ん中を通り、左下へ斜めに切り下ろす（tools/preview で確認した向き：
    # 位置 +x＝右、+y＝上、+z＝奥。回転 z＋で刃が立ち、z−で寝る）
    #       位置の足し          回転の足し
    0.00: ([0, 0, 0], [0, 0, 0]),
    0.18: ([-1, 5, 1], [-10, 0, 25]),
    0.40: ([-5, 1, -1], [0, 0, -5]),
    0.58: ([-11, -4, -2], [10, 0, -40]),
    0.75: ([-13, -7, -1], [10, 0, -55]),
    1.00: ([0, 0, 0], [0, 0, 0]),
}


def slash_tp_animation():
    return {
        "loop": True,
        "animation_length": 1.0,
        "anim_time_update": "variable.attack_time",
        "override_previous_animation": True,  # 右腕はバニラの攻撃の振りを置き換える
        "bones": {
            "rightarm": {"rotation": keys({t: k[0] for t, k in SLASH_TP.items()})},
            "rightforearm": {"rotation": keys({t: k[1] for t, k in SLASH_TP.items()}, xyz)},
            "rightitem": {
                "rotation": keys({t: (k[1], k[2]) for t, k in SLASH_TP.items()},
                                 lambda v: [f"{v[0]} * v.motion_joints + {v[1]}", 0.0, 0.0]),
                "position": keys({t: hand_follow(k[1]) for t, k in SLASH_TP.items()},
                                 lambda p: [0.0, f"{p[1]} * v.motion_joints", f"{p[2]} * v.motion_joints"]),
            },
        },
    }


def slash_tp_body_animation():
    # 体のひねりと左腕は足し算（歩きながらでも混ざる）
    return {
        "loop": True,
        "animation_length": 1.0,
        "anim_time_update": "variable.attack_time",
        "bones": {
            "body": {"rotation": keys({t: k[3] for t, k in SLASH_TP.items()}, lambda v: [v[0], v[1], 0.0])},
            "leftarm": {"rotation": keys({t: k[4] for t, k in SLASH_TP.items()}, lambda v: [v, 0.0, -10.0 if v else 0.0])},
        },
    }


def slash_fp_animation():
    add = lambda a, b: [round(x + y, 3) for x, y in zip(a, b)]
    return {
        "loop": True,
        "animation_length": 1.0,
        "anim_time_update": "variable.attack_time",
        "override_previous_animation": True,  # 一人称の腕はバニラの振りを置き換える
        "bones": {
            "rightarm": {
                "position": keys({t: add(FP_BASE_POS, k[0]) for t, k in SLASH_FP.items()}),
                "rotation": keys({t: add(FP_BASE_ROT, k[1]) for t, k in SLASH_FP.items()}),
            },
            # バニラの empty_hand と同じく、手に持つ物を腕の先へ
            "rightitem": {"position": [0.0, "q.get_default_bone_pivot('rightarm', 1) - q.get_default_bone_pivot('rightitem', 1) - 7.0",
                                       "-q.get_default_bone_pivot('rightitem', 2)"]},
        },
    }


def procedural_animations():
    elbow_r = "(-40.0 * v.motion_air - 30.0 * v.motion_land)"
    elbow_l = "(-35.0 * v.motion_air - 30.0 * v.motion_land)"
    return {
        # バニラの歩きの腕・脚の振りを打ち消す（その分をこのアドオンの歩き・走りで描く）。ひじは少しだけ曲げておく
        "animation.motion.cancel_vanilla_swing": {
            "loop": True,
            "bones": {
                "rightarm": {"rotation": ["variable.tcos0", 0.0, 0.0]},
                "leftarm": {"rotation": ["-variable.tcos0", 0.0, 0.0]},
                "rightleg": {"rotation": ["-variable.tcos0 * 1.4", 0.0, 0.0]},
                "leftleg": {"rotation": ["variable.tcos0 * 1.4", 0.0, 0.0]},
                "rightforearm": {"rotation": [-8.0, 0.0, 0.0]},
                "leftforearm": {"rotation": [-8.0, 0.0, 0.0]},
                "rightitem": {"rotation": ["-8.0 * v.motion_joints", 0.0, 0.0], "position": [0.0, f"{hand_follow(-8)[1]} * v.motion_joints", f"{hand_follow(-8)[2]} * v.motion_joints"]},
            },
        },
        # 空中：上りはひざを抱え、下りは脚を伸ばす。着地はひざを曲げて沈む
        "animation.motion.air": {
            "loop": True,
            "bones": {
                "root": {"position": [0.0, "-3.0 * v.motion_land", 0.0]},
                "waist": {"rotation": ["12.0 * v.motion_land", 0.0, 0.0]},
                "rightarm": {"rotation": ["-40.0 * v.motion_air - 20.0 * v.motion_land", 0.0, "25.0 * v.motion_air"]},
                "rightforearm": {"rotation": [elbow_r, 0.0, 0.0]},
                "rightitem": {"rotation": [f"{elbow_r} * v.motion_joints", 0.0, 0.0], "position": hand_follow_molang(elbow_r)},
                "leftarm": {"rotation": ["-30.0 * v.motion_air - 20.0 * v.motion_land", 0.0, "-25.0 * v.motion_air"]},
                "leftforearm": {"rotation": [elbow_l, 0.0, 0.0]},
                "rightleg": {"rotation": ["(-35.0 * v.motion_tuck - 10.0 * (1.0 - v.motion_tuck)) * v.motion_air - 35.0 * v.motion_land", 0.0, 0.0]},
                "rightshin": {"rotation": ["(60.0 * v.motion_tuck + 15.0 * (1.0 - v.motion_tuck)) * v.motion_air + 55.0 * v.motion_land", 0.0, 0.0]},
                "leftleg": {"rotation": ["(15.0 * v.motion_tuck + 5.0 * (1.0 - v.motion_tuck)) * v.motion_air - 35.0 * v.motion_land", 0.0, 0.0]},
                "leftshin": {"rotation": ["(45.0 * v.motion_tuck + 10.0 * (1.0 - v.motion_tuck)) * v.motion_air + 55.0 * v.motion_land", 0.0, 0.0]},
            },
        },
        # 一人称の移動：走りで持ち物を下げる、ジャンプの上り下りと着地で上下
        "animation.motion.first_person.move": {
            "loop": True,
            "bones": {
                "rightarm": {
                    "position": ["-1.5 * v.motion_sprint", "-2.5 * v.motion_sprint - v.motion_vy * 1.5 - 1.5 * v.motion_land", "1.5 * v.motion_sprint"],
                    "rotation": ["6.0 * v.motion_land - 6.0 * v.motion_sprint", "18.0 * v.motion_sprint", "-8.0 * v.motion_sprint"],
                },
            },
        },
    }


ANIMATIONS = {
    "animation.motion.walk": lambda: cycle_animation(WALK),
    "animation.motion.run": lambda: cycle_animation(RUN),
    "animation.motion.sword_slash": slash_tp_animation,
    "animation.motion.sword_slash_body": slash_tp_body_animation,
    "animation.motion.first_person.sword_slash": slash_fp_animation,
}

# ---------------------------------------------------------------- プレイヤー
INITIALIZE = [
    "v.motion_sprint = 0.0;", "v.motion_air = 0.0;", "v.motion_vy = 0.0;", "v.motion_was_ground = 1.0;",
    "v.motion_air_start = 0.0;", "v.motion_land_time = -10.0;", "v.motion_last_life = 0.0;",
]
PRE_ANIMATION = [
    "v.motion_joints = !q.is_persona_or_premium_skin;",
    f"v.motion_slim = {SLIM_CHECK};",
    "v.motion_dt = math.clamp(q.delta_time, 0.0, 0.1);",
    "v.motion_follow = math.min(1.0, v.motion_dt * 8.0);",
    "v.motion_phase = q.modified_distance_moved * 38.17;",
    "v.motion_move = math.clamp(q.modified_move_speed * 1.5, 0.0, 1.0);",
    "v.motion_ground = q.is_on_ground || q.is_riding || q.is_swimming || q.is_gliding;",
    "v.motion_sprint = math.lerp(v.motion_sprint, (q.is_sprinting && v.motion_ground && !q.is_swimming) ? 1.0 : 0.0, v.motion_follow);",
    "v.motion_air = math.lerp(v.motion_air, v.motion_ground ? 0.0 : 1.0, math.min(1.0, v.motion_dt * 10.0));",
    "v.motion_vy = math.lerp(v.motion_vy, v.motion_ground ? 0.0 : math.clamp(q.vertical_speed / 10.0, -1.0, 1.0), v.motion_follow);",
    "v.motion_tuck = math.clamp(0.5 + v.motion_vy, 0.0, 1.0);",
    "v.motion_air_start = (!v.motion_ground && v.motion_was_ground) ? q.life_time : v.motion_air_start;",
    "v.motion_land_time = (v.motion_ground && !v.motion_was_ground && (q.life_time - v.motion_air_start) > 0.3) ? q.life_time : v.motion_land_time;",
    "v.motion_was_ground = v.motion_ground;",
    "v.motion_land = math.clamp(1.0 - (q.life_time - v.motion_land_time) / 0.35, 0.0, 1.0);",
    "v.motion_sword = q.equipped_item_any_tag('slot.weapon.mainhand', 'minecraft:is_sword');",
]

THIRD = ("!variable.is_first_person && !variable.is_paperdoll && !variable.map_face_icon && !q.is_sleeping && !q.is_riding"
         " && variable.swim_amount <= 0.0 && !q.is_crawling && !q.is_gliding")
FIRST = "variable.is_first_person && !variable.is_paperdoll"
SLASH = "v.motion_sword && variable.attack_time > 0.0"
ENTITY_ANIMATIONS = {
    "motion.cancel_vanilla_swing": "animation.motion.cancel_vanilla_swing",
    "motion.walk": "animation.motion.walk",
    "motion.run": "animation.motion.run",
    "motion.air": "animation.motion.air",
    "motion.sword_slash": "animation.motion.sword_slash",
    "motion.sword_slash_body": "animation.motion.sword_slash_body",
    "motion.first_person.move": "animation.motion.first_person.move",
    "motion.first_person.sword_slash": "animation.motion.first_person.sword_slash",
}
# 値が 0〜1 のものは「混ぜる強さ」（歩き↔走り↔止まる）
ANIMATE = [
    {"motion.cancel_vanilla_swing": THIRD},
    {"motion.walk": f"({THIRD}) ? v.motion_move * (1.0 - v.motion_sprint) * (1.0 - v.motion_air) : 0.0"},
    {"motion.run": f"({THIRD}) ? v.motion_move * v.motion_sprint * (1.0 - v.motion_air) : 0.0"},
    {"motion.air": f"{THIRD} && (v.motion_air > 0.01 || v.motion_land > 0.0)"},
    {"motion.sword_slash": f"{THIRD} && {SLASH}"},
    {"motion.sword_slash_body": f"{THIRD} && {SLASH}"},
    {"motion.first_person.move": FIRST},
    {"motion.first_person.sword_slash": f"{FIRST} && {SLASH}"},
]

LIMB_PARTS = ["rightArm", "rightSleeve", "leftArm", "leftSleeve", "rightLeg", "rightPants", "leftLeg", "leftPants"]


def build_render_controllers():
    vanilla = read_json(os.path.join(HERE, "vanilla", "player.render_controllers.json"))["render_controllers"]
    tp = json.loads(json.dumps(vanilla["controller.render.player.third_person"]))
    # 関節を使うときは バニラの腕・脚（と重ね着）を出さない
    tp["part_visibility"] += [{p: "!v.motion_joints"} for p in LIMB_PARTS]
    fp = json.loads(json.dumps(vanilla["controller.render.player.first_person"]))
    fp_arm_cond = None
    for entry in fp["part_visibility"]:
        if "rightArm" in entry:
            fp_arm_cond = entry["rightArm"]
            entry["rightArm"] = f"({fp_arm_cond}) && !v.motion_joints"
        elif "rightSleeve" in entry:
            entry["rightSleeve"] = f"({entry['rightSleeve']}) && !v.motion_joints"
    assert fp_arm_cond
    arrays = {"geometries": {"Array.motion_limbs": ["Geometry.motion_limbs", "Geometry.motion_limbs_slim"]}}
    limbs_tp = {
        "rebuild_animation_matrices": True,
        "arrays": arrays,
        "geometry": "Array.motion_limbs[v.motion_slim]",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        "part_visibility": [{"*": "v.motion_joints"}],
    }
    limbs_fp = {
        "rebuild_animation_matrices": True,
        "arrays": arrays,
        "geometry": "Array.motion_limbs[v.motion_slim]",
        "materials": [{"*": "Material.default"}],
        "textures": ["Texture.default"],
        "part_visibility": [{"*": False}, {"rightArm": f"v.motion_joints && ({fp_arm_cond})"}, {"rightForearm": f"v.motion_joints && ({fp_arm_cond})"}],
    }
    return {
        "format_version": "1.10.0",
        "render_controllers": {
            "controller.render.motion.player.third_person": tp,
            "controller.render.motion.player.first_person": fp,
            "controller.render.motion.limbs.third_person": limbs_tp,
            "controller.render.motion.limbs.first_person": limbs_fp,
        },
    }


def build_entity():
    data = read_json(os.path.join(HERE, "vanilla", "player.entity.json"))
    desc = data["minecraft:client_entity"]["description"]
    scripts = desc["scripts"]
    scripts["initialize"] = scripts.get("initialize", []) + INITIALIZE
    scripts["pre_animation"] = scripts.get("pre_animation", []) + PRE_ANIMATION
    for k in ENTITY_ANIMATIONS:
        assert k not in desc["animations"], k
    desc["animations"].update(ENTITY_ANIMATIONS)
    scripts["animate"] = scripts.get("animate", []) + ANIMATE  # バニラ（root）のあとに足す
    desc["geometry"]["motion_limbs"] = GEO_ID["wide"]
    desc["geometry"]["motion_limbs_slim"] = GEO_ID["slim"]
    # バニラの一人称・三人称の描き方を、このアドオンのもの（腕・脚を隠す版）に差し替えて、関節つきの腕・脚を足す
    rcs = []
    for entry in desc["render_controllers"]:
        (name, cond), = entry.items()
        if name == "controller.render.player.third_person":
            rcs.append({"controller.render.motion.player.third_person": cond})
            rcs.append({"controller.render.motion.limbs.third_person": cond})
        elif name == "controller.render.player.first_person":
            rcs.append({"controller.render.motion.player.first_person": cond})
            rcs.append({"controller.render.motion.limbs.first_person": cond})
        else:
            rcs.append(entry)
    desc["render_controllers"] = rcs
    return data


def main():
    write_json("models/entity/motion_limbs.geo.json", {
        "format_version": "1.12.0",
        "minecraft:geometry": [build_geometry("wide"), build_geometry("slim")],
    })
    write_json("render_controllers/motion.player.render_controllers.json", build_render_controllers())
    anims = procedural_animations()
    for k, f in ANIMATIONS.items():
        anims[k] = f()
    write_json("animations/motion.player.animation.json", {"format_version": "1.8.0", "animations": anims})
    write_json("entity/player.entity.json", build_entity())


if __name__ == "__main__":
    main()
