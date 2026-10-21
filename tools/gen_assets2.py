"""魔術師のスキン（64x64・humanoid.custom配置）と、火の精霊の契約石（32x32）"""
import math, random, sys, os
from PIL import Image

RP = sys.argv[1]
rnd = random.Random(11)

# ---------------- 魔術師 ----------------
img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
px = img.putpixel

ROBE = [(70, 14, 20), (98, 22, 28), (124, 30, 36), (146, 42, 44)]   # 暗→明
GOLD = [(150, 104, 30), (214, 166, 60), (246, 210, 110)]
SKIN = [(150, 104, 80), (186, 134, 104), (206, 156, 124)]
LEATHER = [(58, 36, 24), (82, 52, 34)]
BOOT = [(38, 28, 26), (54, 40, 36)]

def fill(x0, y0, w, h, pal, shade=0, noise=0.42):
    """領域を布っぽく塗る。shade>0 で下ほど暗く"""
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            base = len(pal) - 2 + rnd.uniform(-noise, noise)
            base -= shade * (y - y0) / max(1, h - 1)
            i = int(max(0, min(len(pal) - 1, round(base))))
            px((x, y), pal[i] + (255,))

def faces(ox, oy, w, h, d):
    """箱UVの各面の矩形 {name:(x,y,w,h)}"""
    return {
        "top": (ox + d, oy, w, d), "bottom": (ox + d + w, oy, w, d),
        "right": (ox, oy + d, d, h), "front": (ox + d, oy + d, w, h),
        "left": (ox + d + w, oy + d, d, h), "back": (ox + 2 * d + w, oy + d, w, h),
    }

# 頭（顔はフードの影で暗め）
head = faces(0, 0, 8, 8, 8)
for k, (x, y, w, h) in head.items():
    fill(x, y, w, h, SKIN if k != "top" else [(60, 40, 30), (80, 54, 40), (90, 60, 44)], noise=0.4)
fx, fy, _, _ = head["front"]
for x in range(fx, fx + 8):              # フードの影
    px((x, fy), (60, 40, 32, 255)); px((x, fy + 1), (96, 66, 52, 255))
for x, c in ((fx + 1, (255, 196, 90)), (fx + 2, (255, 150, 40)), (fx + 5, (255, 150, 40)), (fx + 6, (255, 196, 90))):
    px((x, fy + 3), c + (255,))          # 炎色に光る目
for x in range(fx + 3, fx + 5):
    px((x, fy + 6), (120, 80, 64, 255))  # 口
for x in range(fx + 1, fx + 7):
    px((x, fy + 7), (110, 74, 58, 255))  # あご影

# フード（帽子レイヤー）
hood = faces(32, 0, 8, 8, 8)
for k, (x, y, w, h) in hood.items():
    if k == "front":
        continue
    fill(x, y, w, h, ROBE, shade=0.8 if k != "top" else 0)
hx, hy, _, _ = hood["front"]
for x in range(hx, hx + 8):
    for y in range(hy, hy + 2):
        px((x, y), ROBE[2] + (255,))
for y in range(hy, hy + 8):
    for x in (hx, hx + 7):
        px((x, y), ROBE[1] + (255,))
for x in range(hx, hx + 8):
    px((x, hy + 1), GOLD[1] + (255,))    # フードの縁取り
for (k, (x, y, w, h)) in hood.items():
    if k in ("right", "left", "back"):
        for xx in range(x, x + w):
            px((xx, y + h - 1), GOLD[0] + (255,))

# 胴（ローブ）
body = faces(16, 16, 8, 12, 4)
for k, (x, y, w, h) in body.items():
    fill(x, y, w, h, ROBE, shade=0.6)
bx, by, bw, bh = body["front"]
for y in range(by, by + bh):             # 前合わせの金の縁
    px((bx + 3, y), GOLD[1] + (255,)); px((bx + 4, y), GOLD[0] + (255,))
for x in range(bx, bx + bw):             # 革ベルト
    px((x, by + 7), LEATHER[1] + (255,)); px((x, by + 8), LEATHER[0] + (255,))
px((bx + 3, by + 7), GOLD[2] + (255,)); px((bx + 4, by + 7), GOLD[1] + (255,))
px((bx + 3, by + 8), GOLD[1] + (255,)); px((bx + 4, by + 8), GOLD[0] + (255,))
for x in range(bx + 1, bx + 7):          # 襟
    px((x, by), GOLD[0] + (255,))
k = body["back"]
for x in range(k[0], k[0] + k[2]):
    px((x, k[1] + 7), LEATHER[1] + (255,)); px((x, k[1] + 8), LEATHER[0] + (255,))

# 腕（袖＋金の袖口＋手）
def arm(ox, oy):
    f = faces(ox, oy, 4, 12, 4)
    for k2, (x, y, w, h) in f.items():
        fill(x, y, w, h, ROBE, shade=0.5)
        if k2 in ("right", "front", "left", "back"):
            for xx in range(x, x + w):
                px((xx, y + 8), GOLD[1] + (255,))
                for yy in range(y + 9, y + 12):
                    px((xx, yy), SKIN[1 if yy < y + 11 else 0] + (255,))
    x, y, w, h = f["bottom"]
    fill(x, y, w, h, SKIN, noise=0.3)
arm(40, 16)   # 右腕
arm(32, 48)   # 左腕

# 脚（ローブの裾＋ブーツ）
def leg(ox, oy):
    f = faces(ox, oy, 4, 12, 4)
    for k2, (x, y, w, h) in f.items():
        fill(x, y, w, h, ROBE, shade=0.9)
        if k2 in ("right", "front", "left", "back"):
            for xx in range(x, x + w):
                px((xx, y + 7), GOLD[0] + (255,))
                for yy in range(y + 9, y + 12):
                    px((xx, yy), BOOT[1 if yy == y + 9 else 0] + (255,))
    x, y, w, h = f["bottom"]
    fill(x, y, w, h, BOOT, noise=0.3)
leg(0, 16)    # 右脚
leg(16, 48)   # 左脚

os.makedirs(os.path.join(RP, "textures/entity"), exist_ok=True)
img.save(os.path.join(RP, "textures/entity/na_mage.png"))

# ---------------- 契約石 ----------------
N = 32
st = Image.new("RGBA", (N, N), (0, 0, 0, 0))
STONE = [(34, 30, 40), (52, 46, 60), (74, 66, 84), (100, 92, 112)]
FLAME = [(160, 40, 16), (230, 100, 30), (255, 170, 60), (255, 236, 160)]
cx, cy = 15.5, 16.5
for y in range(N):
    for x in range(N):
        dx, dy = (x - cx) / 12.5, (y - cy) / 13.5
        r = math.hypot(dx, dy) + 0.06 * math.sin(math.atan2(dy, dx) * 5 + 1)
        if r > 1:
            continue
        light = -(dx * 0.7 + dy * 0.7)          # 左上から光
        lvl = 1.6 + light * 1.4 - r * 0.6 + rnd.uniform(-0.3, 0.3)
        if r > 0.86:
            lvl -= 1.2
        st.putpixel((x, y), STONE[int(max(0, min(3, round(lvl))))] + (255,))
# 中に灯る炎の紋（しずく型）
for y in range(N):
    for x in range(N):
        dx = (x - 15.5) / 5.0
        t = (y - 9) / 14.0                      # 0上 … 1下
        if not (0 <= t <= 1):
            continue
        width = math.sin(t * math.pi) ** 0.8 * (0.3 + 0.7 * t)
        if abs(dx) > width:
            continue
        core = 1 - abs(dx) / max(width, 1e-3)
        lvl = core * 2.2 + t * 1.0
        st.putpixel((x, y), FLAME[int(max(0, min(3, round(lvl))))] + (255,))
# 外周のほのかな光
glow = st.copy()
for y in range(N):
    for x in range(N):
        if st.getpixel((x, y))[3]:
            continue
        for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = x + ddx, y + ddy
            if 0 <= xx < N and 0 <= yy < N and st.getpixel((xx, yy))[3] and rnd.random() < 0.35:
                glow.putpixel((x, y), (255, 140, 50, 255))
                break
os.makedirs(os.path.join(RP, "textures/items"), exist_ok=True)
glow.save(os.path.join(RP, "textures/items/na_spirit_stone_fire.png"))

# プレビュー
prev = Image.new("RGBA", (64 * 8 + 32 * 8 + 24, 64 * 8), (40, 40, 48, 255))
prev.alpha_composite(img.resize((512, 512), Image.NEAREST), (0, 0))
prev.alpha_composite(glow.resize((256, 256), Image.NEAREST), (512 + 24, 0))
prev.save(sys.argv[2])
print("ok")
