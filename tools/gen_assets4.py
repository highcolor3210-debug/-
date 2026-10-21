"""魔力ゲージのグリフ（font/glyph_E1.png の 0x20〜0x3F に書き足す）と、デバッグ本のアイテムテクスチャ
グリフのページを増やすと読み込まれない環境があったので、選択表示と同じ E1 にまとめている
使い方: python gen_assets4.py <RPフォルダ> <プレビューpng>
"""
import math, sys, os
from PIL import Image, ImageDraw

RP = sys.argv[1]
PREVIEW = sys.argv[2]

# 見えない間隔のグリフ：幅を持たせるため、左右の端に「ほぼ透明」な点を置く
# （透明度 1 だと幅ゼロ扱いになったので、目に見えない程度に少しだけ濃くする）
GHOST = (0, 0, 0, 24)

def spacer(width):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    im.putpixel((0, 15), GHOST)
    im.putpixel((width - 1, 15), GHOST)
    return im

# ---------------- 魔力のしずく（空腹ゲージのアイコンと同じくらいの大きさ） ----------------
OUTLINE = (20, 24, 56, 255)
BLUE = [(40, 70, 190), (60, 120, 235), (110, 180, 255), (210, 240, 255)]
EMPTY = (44, 46, 70, 255)

def drop_mask():
    """上がとがったしずく形（16x16 の中に 14x14 程度）"""
    m = [[False] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            cx, cy, r = 7.5, 9.5, 5.2
            dx, dy = x - cx, y - cy
            in_circle = dx * dx + dy * dy <= r * r
            # 上の三角（とがり）
            top = 1.0
            in_tip = top <= y <= cy and abs(dx) <= (y - top) / (cy - top) * r
            m[y][x] = in_circle or in_tip
    return m

MASK = drop_mask()

def drop(fill):
    """fill: 'full' / 'half' / 'empty'"""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y in range(16):
        for x in range(16):
            if not MASK[y][x]:
                continue
            edge = any(
                not (0 <= x + ox < 16 and 0 <= y + oy < 16 and MASK[y + oy][x + ox])
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            if edge:
                im.putpixel((x, y), OUTLINE)
                continue
            filled = fill == "full" or (fill == "half" and x <= 7)
            if not filled:
                im.putpixel((x, y), EMPTY)
                continue
            # 左上から光が当たる
            light = 1.0 - (math.hypot(x - 5.5, y - 7.5) / 7.0)
            im.putpixel((x, y), BLUE[int(max(0, min(3, round(light * 3.2))))] + (255,))
    if fill != "empty":
        im.putpixel((5, 7), BLUE[3] + (255,))
        im.putpixel((5, 8), BLUE[3] + (255,))
        im.putpixel((6, 6), BLUE[3] + (255,))
    return im

# ---------------- 数字（3x5 を 2倍、幅は半マス = 8） ----------------
DIGITS = {
    0: ["111", "101", "101", "101", "111"],
    1: ["010", "110", "010", "010", "111"],
    2: ["111", "001", "111", "100", "111"],
    3: ["111", "001", "111", "001", "111"],
    4: ["101", "101", "111", "001", "001"],
    5: ["111", "100", "111", "001", "111"],
    6: ["111", "100", "111", "101", "111"],
    7: ["111", "001", "010", "010", "010"],
    8: ["111", "101", "111", "101", "111"],
    9: ["111", "101", "111", "001", "111"],
}
TEXT = (200, 230, 255, 255)
SHADOW = (20, 24, 56, 255)

def digit(n):
    im = spacer(8)
    for y, row in enumerate(DIGITS[n]):
        for x, c in enumerate(row):
            if c != "1":
                continue
            for sx in range(2):
                for sy in range(2):
                    px, py = 1 + x * 2 + sx, 4 + y * 2 + sy
                    im.putpixel((px + 1, py + 1), SHADOW)
            for sx in range(2):
                for sy in range(2):
                    im.putpixel((1 + x * 2 + sx, 4 + y * 2 + sy), TEXT)
    return im

def infinity():
    im = spacer(16)
    d = ImageDraw.Draw(im)
    for off, col in ((1, SHADOW), (0, TEXT)):
        d.ellipse([1 + off, 5 + off, 8 + off, 12 + off], outline=col, width=2)
        d.ellipse([7 + off, 5 + off, 14 + off, 12 + off], outline=col, width=2)
    return im

glyphs = {
    0x20: drop("full"), 0x21: drop("half"), 0x22: drop("empty"),
    0x23: spacer(16), 0x24: spacer(8),
    0x2A: infinity(),
}
for n in range(10):
    glyphs[0x30 + n] = digit(n)

# 十字のまんなかの飾り（0x06）：金色の小さなひし形。幅はアイコン1つ分
def center_mark():
    im = spacer(16)
    gold, dark = (255, 214, 90, 255), (120, 84, 20, 255)
    for y in range(16):
        for x in range(16):
            dist = abs(x - 7.5) + abs(y - 7.5)
            if dist <= 3.0:
                im.putpixel((x, y), gold)
            elif dist <= 4.0:
                im.putpixel((x, y), dark)
    return im

glyphs[0x06] = center_mark()

# 選択表示（gen_assets3.py が作る glyph_E1）に書き足す。見えない間隔 0x0F も同じ作りに直す
e1_path = os.path.join(RP, "font/glyph_E1.png")
e1 = Image.open(e1_path).convert("RGBA")
e1.paste(spacer(16), (15 * 16, 0))
for code, im in glyphs.items():
    e1.paste(im, ((code % 16) * 16, (code // 16) * 16))
e1.save(e1_path)

# ---------------- デバッグ本（16x16） ----------------
book = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
d = ImageDraw.Draw(book)
d.rectangle([2, 1, 13, 14], fill=(30, 18, 50, 255))           # 縁
d.rectangle([3, 2, 12, 13], fill=(110, 50, 170, 255))         # 表紙
d.rectangle([3, 2, 4, 13], fill=(70, 30, 110, 255))           # 背
d.line([(5, 13), (12, 13)], fill=(235, 230, 210, 255))        # ページ
d.line([(6, 12), (12, 12)], fill=(200, 190, 170, 255))
# 表紙の歯車っぽい印
for a in range(8):
    t = a * math.pi / 4
    book.putpixel((8 + round(math.cos(t) * 2.6), 7 + round(math.sin(t) * 2.6)), (255, 214, 90, 255))
book.putpixel((8, 7), (255, 240, 170, 255))
os.makedirs(os.path.join(RP, "textures/items"), exist_ok=True)
book.save(os.path.join(RP, "textures/items/na_debug_book.png"))

# プレビュー：ゲージ（満タン7・半分1・空2 + 数字）とデバッグ本
S = 4
row = [0x20] * 7 + [0x21] + [0x22] * 2 + [0x37, 0x35]
pv = Image.new("RGBA", (16 * S * len(row) + 16 * S * 2, 16 * S * 2), (40, 40, 48, 255))
x = 0
for c in row:
    pv.alpha_composite(glyphs[c].resize((16 * S, 16 * S), Image.NEAREST), (x, 0))
    x += (8 if c >= 0x30 else 16) * S
pv.alpha_composite(glyphs[0x2A].resize((16 * S, 16 * S), Image.NEAREST), (0, 16 * S))
pv.alpha_composite(book.resize((16 * S, 16 * S), Image.NEAREST), (x, 0))
pv.save(PREVIEW)
print("ok")
