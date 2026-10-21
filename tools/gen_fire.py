"""火弾の炎テクスチャ（32x32 × 4コマ）。中心が白熱、外へ黄→橙→赤、縁に炎の舌がゆらぐ"""
import math, random, sys, os
from PIL import Image

N = 32
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# パレット（明→暗）
PAL = [
    (255, 252, 230),  # 白熱
    (255, 238, 150),
    (255, 212, 80),
    (255, 170, 40),
    (245, 120, 25),
    (215, 70, 20),
    (160, 35, 15),
]

def noise_table(seed):
    rnd = random.Random(seed)
    return [rnd.uniform(-1, 1) for _ in range(64)]

def ang_noise(tab, a, k):
    # 角度方向の滑らかなノイズ
    x = (a / (2*math.pi)) * k
    i = int(math.floor(x)); f = x - i
    f = f*f*(3-2*f)
    return tab[i % 64]*(1-f) + tab[(i+1) % 64]*f

for frame in range(4):
    t1 = noise_table(100 + frame)
    t2 = noise_table(200 + frame*3)
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    cx = cy = (N-1)/2
    for y in range(N):
        for x in range(N):
            dx, dy = x-cx, y-cy
            r = math.hypot(dx, dy) / (N/2)          # 0..1+
            a = math.atan2(dy, dx) + frame*0.35
            # 縁のゆらぎ（炎の舌）
            edge = 0.78 + 0.13*ang_noise(t1, a, 7) + 0.06*ang_noise(t2, a, 15)
            if r > edge:
                continue
            v = r/edge                              # 0中心 … 1縁
            v += 0.08*ang_noise(t2, a*1.7 + r*4, 11)  # 内側の揺らぎ
            idx = int(max(0, min(len(PAL)-1, round(v*v*7.2 - 0.3))))
            img.putpixel((x, y), PAL[idx] + (255,))
    img.save(os.path.join(OUT, f"fire_bullet_{frame}.png"))

# プレビュー
prev = Image.new("RGBA", (N*4*8 + 3*16, N*8), (40, 40, 48, 255))
for f in range(4):
    im = Image.open(os.path.join(OUT, f"fire_bullet_{f}.png")).resize((N*8, N*8), Image.NEAREST)
    prev.alpha_composite(im, (f*(N*8+16), 0))
prev.save(os.path.join(OUT, "_preview.png"))
print("ok")
