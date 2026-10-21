"""杖テクスチャ生成（32x32、手持ち時に左下が持ち手になる向き）"""
import math, random, sys
from PIL import Image

N = 64          # 出力解像度
SS = 6          # スーパーサンプリング
random.seed(7)

# 軸：左下（柄尻）→右上（先端）
P0 = (5.0, 59.0)
P1 = (59.5, 4.5)
L = math.dist(P0, P1)
d = ((P1[0]-P0[0])/L, (P1[1]-P0[1])/L)     # 軸方向
n = (-d[1], d[0])                           # 垂直（右下向き＝影側）
if n[0] + n[1] < 0:
    n = (-n[0], -n[1])

def smooth(a, b, x):
    t = min(1, max(0, (x-a)/(b-a)))
    return t*t*(3-2*t)

def radius(s):
    return 1.62*_radius(s)

def _radius(s):
    """軸上の位置 s(0..1) における半径(px)。旋盤で削った持ち手を再現"""
    # 柄尻：小さなとんがり → 飾り玉
    if s < 0.028: return 0.45 + 0.9*smooth(0.0, 0.028, s)
    if s < 0.072: return 1.35 + 0.3*math.sin((s-0.028)/0.044*math.pi)
    if s < 0.088: return 0.98                     # くびれ
    if s < 0.128: return 1.82 + 0.12*math.sin((s-0.088)/0.04*math.pi)  # リング1
    if s < 0.142: return 1.12                     # 溝
    if s < 0.232:                                 # 胴（樽型）
        t = (s-0.142)/0.09
        return 1.38 + 0.18*math.sin(t*math.pi)
    if s < 0.246: return 1.1                      # 溝
    if s < 0.278: return 1.78 + 0.1*math.sin((s-0.246)/0.032*math.pi)  # リング2
    if s < 0.292: return 1.08                     # 溝
    if s < 0.34: return 1.42 - 0.2*smooth(0.292, 0.34, s)    # 襟→シャフトへ
    # シャフト：先へ行くほど細く
    t = (s-0.34)/(1-0.34)
    return 1.2 - 0.82*t**0.85

def groove(s):
    """溝・境目の暗さ(0..1)"""
    marks = [0.028, 0.072, 0.088, 0.128, 0.142, 0.232, 0.246, 0.278, 0.292]
    g = 0
    for m in marks:
        g = max(g, 1 - min(1, abs(s-m)/0.014))
    return g

def offset(s):
    """シャフトのうねり（軸からの横ずれ）"""
    if s < 0.33: return 0.0
    t = (s-0.33)/(1-0.33)
    amp = 3.1*smooth(0, 0.18, t) * (1 - 0.2*t)
    return amp*math.sin(t*math.pi*3.0 + 0.1)

# 木目ノイズ（軸方向に伸びた筋）
grain = [random.uniform(-1, 1) for _ in range(400)]
def grain_at(s, v):
    i = int((v+3)*40 + s*7) % 400
    j = int(s*90) % 400
    return 0.6*grain[i] + 0.4*grain[j]

# パレット（濃いウォルナット）
PAL = [
    (38, 19, 12),    # 0 最暗（輪郭・溝）
    (62, 32, 20),    # 1 影
    (86, 46, 28),    # 2 暗
    (110, 62, 38),   # 3 基本
    (134, 80, 50),   # 4 明
    (162, 104, 68),  # 5 ハイライト
    (192, 138, 96),  # 6 反射
]

cov = [[0]*N for _ in range(N)]
shade = [[0.0]*N for _ in range(N)]
gro = [[0.0]*N for _ in range(N)]
sval = [[0.0]*N for _ in range(N)]

for py in range(N):
    for px in range(N):
        hits = 0; sh = 0; gr = 0; ss_ = 0
        for sy in range(SS):
            for sx in range(SS):
                x = px + (sx+0.5)/SS
                y = py + (sy+0.5)/SS
                rx, ry = x-P0[0], y-P0[1]
                u = rx*d[0] + ry*d[1]
                v = rx*n[0] + ry*n[1]
                s = u/L
                if s < 0 or s > 1: continue
                vv = v - offset(s)
                r = radius(s)
                if abs(vv) <= r:
                    hits += 1
                    k = vv/r                        # -1 光側 … +1 影側
                    sh += k
                    gr += groove(s)
                    ss_ += s
        c = hits/(SS*SS)
        cov[py][px] = c
        if hits:
            shade[py][px] = sh/hits
            gro[py][px] = gr/hits
            sval[py][px] = ss_/hits

img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
solid = [[cov[y][x] >= 0.38 for x in range(N)] for y in range(N)]

for y in range(N):
    for x in range(N):
        if not solid[y][x]: continue
        k = shade[y][x]; s = sval[y][x]
        # 円柱の陰影：光は左上から
        lvl = 3.6 - 2.1*k
        lvl += 0.55*grain_at(s, k)               # 木目
        lvl -= 4.0*gro[y][x]                      # 溝は暗く
        if s < 0.34 and k < -0.35: lvl += 0.8    # 持ち手は磨かれてツヤがある
        if 0.095 < s < 0.122 or 0.252 < s < 0.272:    # リングの山にハイライト
            lvl += 0.4
        # 縁（透明に接する画素）は暗く締める
        edge = any(not (0 <= x+dx < N and 0 <= y+dy < N and solid[y+dy][x+dx])
                   for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)))
        if edge:
            lvl -= 1.6 if k > -0.2 else 0.9
        i = max(0, min(len(PAL)-1, int(round(lvl))))
        img.putpixel((x, y), PAL[i] + (255,))

out = sys.argv[1] if len(sys.argv) > 1 else "fs_wand.png"
img.save(out)
img.resize((N*8, N*8), Image.NEAREST).save(out.replace(".png", "_x16.png"))
print("saved", out)
