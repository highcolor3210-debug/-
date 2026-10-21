"""土壁ブロック（16x16：通常／ひび割れ）と、魔法選択UI用のグリフ（font/glyph_E1.png）"""
import math, random, sys, os
from PIL import Image, ImageDraw

RP = sys.argv[1]
PREVIEW = sys.argv[2]
rnd = random.Random(23)

# ---------------- 土壁ブロック ----------------
EARTH = [(62, 44, 30), (84, 60, 40), (106, 78, 52), (128, 96, 66), (150, 116, 82)]
STONE = [(88, 86, 84), (112, 110, 106), (136, 134, 128)]

def earth_block(cracked):
    im = Image.new("RGBA", (16, 16))
    # 地の土（横方向に層っぽく）
    for y in range(16):
        layer = math.sin(y * 0.9) * 0.4
        for x in range(16):
            v = 2.2 + layer + rnd.uniform(-0.7, 0.7)
            im.putpixel((x, y), EARTH[int(max(0, min(4, round(v))))] + (255,))
    # 埋まった小石
    for _ in range(7):
        cx, cy = rnd.randrange(1, 15), rnd.randrange(1, 15)
        w = rnd.choice((1, 2))
        for dx in range(w):
            for dy in range(w if w == 1 else rnd.choice((1, 2))):
                x, y = (cx + dx) % 16, (cy + dy) % 16
                im.putpixel((x, y), STONE[rnd.randrange(3)] + (255,))
    # 固めた縁（上が明るく、下が暗い）
    for x in range(16):
        im.putpixel((x, 0), EARTH[4] + (255,))
        im.putpixel((x, 15), EARTH[0] + (255,))
    for y in range(16):
        im.putpixel((0, y), EARTH[3] + (255,))
        im.putpixel((15, y), EARTH[1] + (255,))
    if cracked:
        dark = (36, 24, 16, 255)
        for start in ((3, 0), (12, 15), (0, 9)):
            x, y = start
            for _ in range(9):
                if 0 <= x < 16 and 0 <= y < 16:
                    im.putpixel((x, y), dark)
                    if 0 <= x + 1 < 16 and rnd.random() < 0.3:
                        im.putpixel((x + 1, y), (60, 42, 28, 255))
                x += rnd.choice((-1, 0, 1, 1))
                y += 1 if start[1] == 0 else -1 if start[1] == 15 else rnd.choice((-1, 0, 1))
                if start == (0, 9):
                    x += 1
    return im

os.makedirs(os.path.join(RP, "textures/blocks"), exist_ok=True)
wall = earth_block(False)
rnd = random.Random(23)
cracked = earth_block(True)
wall.save(os.path.join(RP, "textures/blocks/na_earth_wall.png"))
cracked.save(os.path.join(RP, "textures/blocks/na_earth_wall_cracked.png"))

# ---------------- 選択UIのアイコン（グリフ 16x16 × 16x16マス） ----------------
sheet = Image.new("RGBA", (256, 256), (0, 0, 0, 0))

def slot(selected):
    """インベントリのマスっぽい枠。選択中はホットバーの選択枠のように白く縁取る"""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 15, 15], fill=(139, 139, 139, 255))
    d.line([(0, 0), (14, 0)], fill=(55, 55, 55, 255)); d.line([(0, 0), (0, 14)], fill=(55, 55, 55, 255))
    d.line([(1, 15), (15, 15)], fill=(255, 255, 255, 255)); d.line([(15, 1), (15, 15)], fill=(255, 255, 255, 255))
    if selected:
        d.rectangle([0, 0, 15, 15], outline=(255, 255, 255, 255))
        d.rectangle([1, 1, 14, 14], outline=(255, 214, 90, 255))
        d.rectangle([2, 2, 13, 13], fill=(170, 160, 130, 255))
    else:
        d.rectangle([2, 2, 13, 13], fill=(120, 120, 120, 255))
    return im

def fire_icon():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    pal = [(170, 40, 16), (235, 105, 30), (255, 176, 60), (255, 240, 170)]
    for y in range(16):
        for x in range(16):
            dx, dy = (x - 7.5) / 4.2, (y - 8.5) / 4.6
            r = math.hypot(dx, dy) + 0.15 * math.sin(math.atan2(dy, dx) * 5)
            if r > 1:
                continue
            im.putpixel((x, y), pal[int(max(0, min(3, round((1 - r) * 3.4))))] + (255,))
    return im

def earth_icon():
    """3x2段に積んだ土のブロックの壁"""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    tile = wall.crop((3, 3, 7, 7))
    for row in range(2):
        for col in range(3):
            x, y = 2 + col * 4, 5 + row * 4
            im.alpha_composite(tile, (x, y))
    d = ImageDraw.Draw(im)
    for col in range(1, 3):
        d.line([(2 + col * 4, 5), (2 + col * 4, 12)], fill=(52, 36, 24, 255))
    d.line([(2, 9), (13, 9)], fill=(52, 36, 24, 255))
    d.line([(2, 5), (13, 5)], fill=(160, 126, 90, 255))
    d.line([(1, 13), (14, 13)], fill=(70, 110, 50, 255))  # 地面の草
    return im

def with_icon(selected, icon):
    s = slot(selected)
    if icon is not None:
        s.alpha_composite(icon.crop((2, 2, 14, 14)), (2, 2))
    return s

glyphs = {
    0x00: with_icon(False, None), 0x01: with_icon(True, None),
    0x02: with_icon(False, fire_icon()), 0x03: with_icon(True, fire_icon()),
    0x04: with_icon(False, earth_icon()), 0x05: with_icon(True, earth_icon()),
}
for code, im in glyphs.items():
    sheet.alpha_composite(im, ((code % 16) * 16, (code // 16) * 16))
# 0x0F：見えない間隔用（幅を持たせるため両端にほぼ透明な点。gen_assets4.py と同じ作り）
for x in (0, 15):
    sheet.putpixel((15 * 16 + x, 15), (0, 0, 0, 24))

os.makedirs(os.path.join(RP, "font"), exist_ok=True)
sheet.save(os.path.join(RP, "font/glyph_E1.png"))

# プレビュー：ブロック2種と五角形の並び
pv = Image.new("RGBA", (16 * 12 * 2 + 40 + 16 * 3 * 8, 16 * 12), (40, 40, 48, 255))
pv.alpha_composite(wall.resize((192, 192), Image.NEAREST), (0, 0))
pv.alpha_composite(cracked.resize((192, 192), Image.NEAREST), (200, 0))
S = 6
g = lambda c: glyphs[c].resize((16 * S // 2, 16 * S // 2), Image.NEAREST)
ox = 400
pv.alpha_composite(g(0x03), (ox + 60, 0))
pv.alpha_composite(g(0x00), (ox + 0, 60)); pv.alpha_composite(g(0x04), (ox + 120, 60))
pv.alpha_composite(g(0x00), (ox + 25, 120)); pv.alpha_composite(g(0x00), (ox + 95, 120))
pv.save(PREVIEW)
print("ok")
