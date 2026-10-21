"""HUD（ui/hud_screen.json）とその画像を作る
使い方: python gen_hud_ui.py <RPフォルダ>

スクリプトはタイトルに「na_hud」を含むデータ文字列を送る（Hud.js）。そのタイトルは画面に出さない。
各画像はタイトルの文字列（#hud_title_text_string）を直接読み、含まれる記号で表示を切り替える。

記号:
  [m]        魔力ゲージを出す（サバイバル・アドベンチャーのみ）
  [m{i}F/H]  魔力ゲージ i 個目が満タン／半分（i=0 が右端、空腹ゲージと同じ並び）
  [n{p}{d}]  魔力の今の値の p 桁目（0=一の位）が数字 d
  [x{p}{d}]  魔力の最大値の p 桁目が数字 d
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

# 数字の下に敷く黒い板（半透明。UI 側で引き伸ばす）
save(Image.new("RGBA", (4, 4), (0, 0, 0, 170)), "num_bg")

# 数字（3x5 の文字に影をつけて 4x6）。魔力の「今/最大」に使う
FONT = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
    "slash": ["001", "001", "010", "100", "100"],
}
for ch, rows in FONT.items():
    im = Image.new("RGBA", (4, 6), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "1":
                im.putpixel((x + 1, y + 1), (40, 20, 56, 255))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "1":
                im.putpixel((x, y), (226, 200, 255, 255))
    save(im, f"digit_{ch}")

# ---------------- JSON UI ----------------
TITLE = "#hud_title_text_string"

def has(token):
    return f"(not (({TITLE} - '{token}') = {TITLE}))"

def lacks(token):
    return f"(({TITLE} - '{token}') = {TITLE})"

def image(name, texture, size, offset, cond, anchor_from="center", anchor_to="center", layer=2):
    return {name: {
        "type": "image",
        "texture": f"{TEX}/{texture}",
        "size": size,
        "offset": offset,
        "anchor_from": anchor_from,
        "anchor_to": anchor_to,
        "layer": layer,
        "bindings": [
            {"binding_name": TITLE, "binding_type": "global"},
            {"binding_type": "view", "source_property_name": cond, "target_property_name": "#visible"},
        ],
    }}

def mana_row(panel_width):
    """空腹ゲージと同じパネルに入れる魔力ゲージと数字。空腹ゲージ（hunger_rend）は x=パネル幅、y=-40 に置かれ、
    空気の泡はその1段上（y=-50）。魔力ゲージは泡と同じ段に、空腹ゲージと同じ間隔で右から並べる"""
    out = []
    pos = dict(anchor_from="bottom_left", anchor_to="bottom_left")
    for i in range(10):
        x, y = panel_width - 10 - 8 * i, -42
        out.append(image(f"na_mana_bg_{i}", "mana_empty", [9, 9], [x, y], has("[m]"), layer=2, **pos))
        out.append(image(f"na_mana_half_{i}", "mana_half", [9, 9], [x, y], has(f"[m{i}H]"), layer=3, **pos))
        out.append(image(f"na_mana_full_{i}", "mana_full", [9, 9], [x, y], has(f"[m{i}F]"), layer=3, **pos))
    # 「今/最大」：魔力ゲージのすぐ右の黒い板の中。今の値は右寄せ3桁、そのあとに / と最大値3桁
    box_x, box_w = panel_width + 2, 7 * 4 + 3
    out.append(image("na_num_bg", "num_bg", [box_w, 9], [box_x, -42], has("[m]"), layer=2, **pos))
    x0, y = box_x + 2, -43
    for p in range(3):  # 今の値（左から百・十・一の位）
        for dgt in "0123456789":
            out.append(image(f"na_num_n{p}_{dgt}", f"digit_{dgt}", [4, 6], [x0 + (2 - p) * 4, y], has(f"[n{p}{dgt}]"), layer=3, **pos))
    out.append(image("na_num_slash", "digit_slash", [4, 6], [x0 + 12, y], has("[m]"), layer=3, **pos))
    for p in range(3):  # 最大値（左詰め）
        for dgt in "0123456789":
            out.append(image(f"na_num_x{p}_{dgt}", f"digit_{dgt}", [4, 6], [x0 + 16 + (2 - p) * 4, y], has(f"[x{p}{dgt}]"), layer=3, **pos))
    return out

controls = []

# 詠唱・溜めのバー：照準の少し下。左端をそろえて置く（枠の左端が中央から -26、マスは枠の内側 1px から 5px おき）
left = dict(anchor_from="center", anchor_to="left_middle")
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

def insert(controls_to_add):
    return {"modifications": [{"array_name": "controls", "operation": "insert_back", "value": controls_to_add}]}

ui = {
    "namespace": "hud",
    "na_hud": {"type": "panel", "size": ["100%", "100%"], "layer": 20, "controls": controls},
    "root_panel": insert([{"na_hud@hud.na_hud": {}}]),
    # 魔力ゲージは空腹ゲージと同じパネルに入れる（PC 用 180 幅／タッチ用 200 幅）
    "centered_gui_elements_at_bottom_middle": insert(mana_row(180)),
    "centered_gui_elements_at_bottom_middle_touch": insert(mana_row(200)),
    # データのタイトル（na_hud を含む）は画面に出さない
    "hud_title_text": {
        "bindings": [
            {"binding_name": TITLE, "binding_type": "global"},
            {"binding_type": "view", "source_property_name": lacks(MARK), "target_property_name": "#visible"},
        ]
    },
}
with open(os.path.join(RP, "ui/hud_screen.json"), "w", encoding="utf-8") as f:
    json.dump(ui, f, ensure_ascii=False, indent=2)
print("ok", len(controls) + 2 * len(mana_row(180)), "controls")
