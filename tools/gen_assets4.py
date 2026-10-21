"""デバッグ本のアイテムテクスチャ
（魔力ゲージなどの HUD の画像は gen_hud_ui.py で作る）
使い方: python gen_assets4.py <RPフォルダ> <プレビューpng>
"""
import math, sys, os
from PIL import Image, ImageDraw

RP = sys.argv[1]
PREVIEW = sys.argv[2]

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

# プレビュー
book.resize((128, 128), Image.NEAREST).save(PREVIEW)
print("ok")
