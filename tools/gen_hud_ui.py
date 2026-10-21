"""HUD（ui/hud_screen.json）とその画像を作る
使い方: python gen_hud_ui.py <RPフォルダ>

スクリプトはタイトルに「na_hud」で始まるデータ文字列を送る（Hud.js）。
ここで作る JSON UI がその文字列を覚えておき、含まれる記号で各画像の表示を切り替える。
データのタイトルそのものは画面に出さない。

記号:
  [m]        魔力ゲージを出す（サバイバル・アドベンチャーのみ）
  [m{i}F/H]  魔力ゲージ i 個目が満タン／半分（i=0 が右端、空腹ゲージと同じ並び）
  [b]        詠唱・溜めのバーを出す
  [s{n}]     詠唱の進み n/10 マス目まで
  [c{n}]     溜めの進み n/10 マス目まで
  [o]        魔法の選択表示を出す
  [k{i}{X}]  スロット i の魔術（X は SPELL_CODES、N は空き）
  [h{i}]     スロット i を選んでいる
"""
import json, math, os, sys
from PIL import Image, ImageDraw

RP = sys.argv[1]
TEX = "textures/ui/na"
os.makedirs(os.path.join(RP, TEX), exist_ok=True)
os.makedirs(os.path.join(RP, "ui"), exist_ok=True)

MARK = "na_hud"
SPELL_CODES = {"fire_bullet": "F", "earth_wall": "E"}  # Loadout.js の HUD_CODE と合わせる
SLOT_COUNT = 4

def save(im, name):
    im.save(os.path.join(RP, TEX, name + ".png"))

# ---------------- 画像 ----------------
# 魔力のしずく（9x9、空腹ゲージのアイコンと同じ大きさ）。紫
OUT = (34, 12, 48, 255)
PURPLE = [(92, 30, 140), (140, 60, 200), (190, 110, 240), (236, 200, 255)]
EMPTY = (52, 36, 64, 255)
DROP = [
    "....#....",
    "...###...",
    "..#####..",
    ".#######.",
    "#########",
    "#########",
    "#########",
    ".#######.",
    "..#####..",
]

def drop(fill):
    im = Image.new("RGBA", (9, 9), (0, 0, 0, 0))
    inside = lambda x, y: 0 <= x < 9 and 0 <= y < 9 and DROP[y][x] == "#"
    for y in range(9):
        for x in range(9):
            if not inside(x, y):
                continue
            if not all(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                im.putpixel((x, y), OUT)
            elif fill == "full" or (fill == "half" and x <= 4):
                light = 1.0 - math.hypot(x - 3.0, y - 4.0) / 5.0
                im.putpixel((x, y), PURPLE[int(max(0, min(3, round(light * 3.2))))] + (255,))
            else:
                im.putpixel((x, y), EMPTY)
    if fill != "empty":
        im.putpixel((3, 4), PURPLE[3] + (255,))
    return im

save(drop("full"), "mana_full")
save(drop("half"), "mana_half")
save(drop("empty"), "mana_empty")

# 詠唱・溜めのバー：枠 52x7、中に 5x5 のマスが10個
SEG = 10
frame = Image.new("RGBA", (52, 7), (0, 0, 0, 0))
d = ImageDraw.Draw(frame)
d.rectangle([0, 0, 51, 6], fill=(20, 14, 28, 200), outline=(10, 6, 14, 255))
for i in range(SEG):
    d.rectangle([1 + i * 5, 1, 1 + i * 5 + 4, 5], outline=(48, 36, 60, 255))
save(frame, "bar_frame")

def seg(colors):
    im = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
    for y in range(5):
        for x in range(5):
            c = colors[0] if y == 0 else colors[2] if y == 4 else colors[1]
            im.putpixel((x, y), c + (255,))
    return im

save(seg([(220, 200, 255), (170, 120, 240), (110, 60, 180)]), "bar_cast")    # 詠唱：紫
save(seg([(255, 240, 160), (255, 190, 60), (210, 110, 20)]), "bar_charge")   # 溜め：金

# 選択表示：glyph_E1 のアイコン（スロット枠つき）を 32x32 に拡大して使う
e1 = Image.open(os.path.join(RP, "font/glyph_E1.png")).convert("RGBA")
cell = lambda c: e1.crop(((c % 16) * 16, (c // 16) * 16, (c % 16) * 16 + 16, (c // 16) * 16 + 16)).resize((32, 32), Image.NEAREST)
SLOT_GLYPH = {"N": (0x00, 0x01), "F": (0x02, 0x03), "E": (0x04, 0x05)}
for code, (normal, hover) in SLOT_GLYPH.items():
    save(cell(normal), f"slot_{code}_0")
    save(cell(hover), f"slot_{code}_1")

# ---------------- JSON UI ----------------
SRC = "na_hud_data"

def has(token):
    return f"(not ((#preserved_text - '{token}') = #preserved_text))"

def lacks(token):
    return f"((#preserved_text - '{token}') = #preserved_text)"

def image(name, texture, size, offset, cond, anchor_from="center", anchor_to="center", layer=2):
    return {name: {
        "type": "image",
        "texture": f"{TEX}/{texture}",
        "size": size,
        "offset": offset,
        "anchor_from": anchor_from,
        "anchor_to": anchor_to,
        "layer": layer,
        "bindings": [{
            "binding_type": "view",
            "source_control_name": SRC,
            "source_property_name": cond,
            "target_property_name": "#visible",
        }],
    }}

controls = [{
    # タイトルの文字列を覚えておく（データのタイトルが来たときだけ書き換わる）
    SRC: {
        "type": "panel",
        "size": [0, 0],
        "bindings": [
            {"binding_name": "#hud_title_text_string", "binding_type": "global"},
            {
                "binding_name": "#hud_title_text_string",
                "binding_name_override": "#preserved_text",
                "binding_condition": "visibility_changed",
                "binding_type": "global",
            },
            {
                "binding_type": "view",
                "source_property_name": f"((not (#hud_title_text_string = #preserved_text)) and (not ((#hud_title_text_string - '{MARK}') = #hud_title_text_string)))",
                "target_property_name": "#visible",
            },
        ],
    }
}]

# 魔力ゲージ：空腹ゲージ（hunger_rend）の1段上。右端が 0 番
for i in range(10):
    x, y = 80 - 8 * i, -38
    pos = dict(anchor_from="bottom_middle", anchor_to="bottom_left")
    controls.append(image(f"na_mana_bg_{i}", "mana_empty", [9, 9], [x, y], has("[m]"), layer=2, **pos))
    controls.append(image(f"na_mana_half_{i}", "mana_half", [9, 9], [x, y], has(f"[m{i}H]"), layer=3, **pos))
    controls.append(image(f"na_mana_full_{i}", "mana_full", [9, 9], [x, y], has(f"[m{i}F]"), layer=3, **pos))

# 詠唱・溜めのバー：照準の少し下
# 左端をそろえて置く（枠の左端が中央から -26、マスは枠の内側 1px から 5px おき）
left = dict(anchor_from="center", anchor_to="left")
controls.append(image("na_bar_frame", "bar_frame", [52, 7], [-26, 14], has("[b]"), layer=2, **left))
for n in range(1, SEG + 1):
    x = -25 + (n - 1) * 5
    controls.append(image(f"na_bar_cast_{n}", "bar_cast", [5, 5], [x, 14], has(f"[s{n}]"), layer=3, **left))
    controls.append(image(f"na_bar_charge_{n}", "bar_charge", [5, 5], [x, 14], has(f"[c{n}]"), layer=3, **left))

# 魔法の選択表示：画面の中央に十字（0=上、時計回り）
SLOT_POS = [(0, -36), (36, 0), (0, 36), (-36, 0)]
for i, (x, y) in enumerate(SLOT_POS):
    for code in SLOT_GLYPH:
        for hover in (0, 1):
            cond = f"({has('[o]')} and {has(f'[k{i}{code}]')} and {has(f'[h{i}]') if hover else lacks(f'[h{i}]')})"
            controls.append(image(f"na_slot_{i}_{code}_{hover}", f"slot_{code}_{hover}", [32, 32], [x, y], cond, layer=4))

ui = {
    "namespace": "hud",
    "na_hud": {"type": "panel", "size": ["100%", "100%"], "layer": 20, "controls": controls},
    "root_panel": {
        "modifications": [{
            "array_name": "controls",
            "operation": "insert_back",
            "value": [{"na_hud@hud.na_hud": {}}],
        }]
    },
    # データのタイトル（na_hud を含む）は画面に出さない
    "hud_title_text": {
        "bindings": [
            {"binding_name": "#hud_title_text_string", "binding_type": "global"},
            {
                "binding_type": "view",
                "source_property_name": f"((#hud_title_text_string - '{MARK}') = #hud_title_text_string)",
                "target_property_name": "#visible",
            },
        ]
    },
}
with open(os.path.join(RP, "ui/hud_screen.json"), "w", encoding="utf-8") as f:
    json.dump(ui, f, ensure_ascii=False, indent=2)
print("ok", len(controls), "controls")
