"""數讀房市 Echo Forest 11 位吉祥物的像素圖產生器（Pixel-art sprites for the 11 Echo Forest mascots）.

每隻角色都在 40x48 的格子上用基本形狀（橢圓、三角形、線條、矩形）程式化繪製，
最後統一加上邊緣陰影與深色外框。造型依據：mascot-concepts-latest-2026-08-13 的 Character Bible。

執行：python generator/mascots.py   （需要 Python 3.8+ 與 Pillow）
輸出（皆在本資料夾的上一層）：
  sprites/1x/<id>.png          正面待機圖，40x48，透明背景
  sprites/1x/<id>_blink.png    眨眼圖
  sprites/4x/...               以最近鄰放大 4 倍（160x192），可直接用在網頁
  sprites/extras/...           影片用的特殊姿勢（背面、滑雪、肉球手等），1x
  preview/sheet.png            全員預覽圖（含名稱）
  characters.json              角色清單（id、名稱、物種、識別物、檔名）
"""
from PIL import Image, ImageDraw, ImageFont
import json, math, os

W, H = 40, 48
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # pixel-mascots/
OUT1 = os.path.join(ROOT, 'sprites', '1x')
OUT4 = os.path.join(ROOT, 'sprites', '4x')
OUTX = os.path.join(ROOT, 'sprites', 'extras')
FONT = os.path.join(ROOT, 'fonts', 'Cubic_11.ttf')                     # only used for the preview sheet labels

INK = (38, 30, 26)        # outline
EYE = (26, 22, 20)
HI = (255, 255, 250)      # eye highlight
BRONZE = (184, 128, 58)
BRONZE_D = (120, 80, 34)
SILVER = (205, 208, 212)


class S:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            return self.px[y][x]
        return None

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.set(x, y, c)

    def ell(self, cx, cy, rx, ry, c, clip=None):
        for y in range(H):
            for x in range(W):
                if clip and not (clip[0] <= x < clip[2] and clip[1] <= y < clip[3]):
                    continue
                dx = (x + 0.5 - cx) / rx
                dy = (y + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    self.set(x, y, c)

    def ring(self, cx, cy, r, t, c, arc=None):
        for y in range(H):
            for x in range(W):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if r - t <= d <= r:
                    if arc:
                        a = math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx)) % 360
                        lo, hi = arc
                        if not (lo <= a <= hi if lo <= hi else (a >= lo or a <= hi)):
                            continue
                    self.set(x, y, c)

    def tri(self, p1, p2, p3, c):
        def sgn(a, b, p):
            return (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1])
        for y in range(H):
            for x in range(W):
                p = (x + 0.5, y + 0.5)
                d1, d2, d3 = sgn(p, p1, p2), sgn(p, p2, p3), sgn(p, p3, p1)
                neg = d1 < 0 or d2 < 0 or d3 < 0
                pos = d1 > 0 or d2 > 0 or d3 > 0
                if not (neg and pos):
                    self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c, t=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for ox in range(t):
                for oy in range(t):
                    self.set(round(x) + ox, round(y) + oy, c)

    def mirror(self, fn):
        """Run fn(m) twice: m(x) = x and m(x) = W - x (mirror around centre)."""
        fn(lambda x: x)
        fn(lambda x: W - x)

    def eye(self, x, y, blink, w=2, h=2, iris=None):
        if blink:
            self.rect(x, y + h - 1, x + w, y + h, EYE)
            return
        if iris:
            self.rect(x, y, x + w, y + h, iris)
            self.rect(x + w // 2, y, x + w // 2 + 1, y + h, EYE)
        else:
            self.rect(x, y, x + w, y + h, EYE)
        self.set(x, y, HI)

    def badge(self, x, y):
        self.rect(x - 1, y - 1, x + 2, y + 2, BRONZE)
        self.set(x, y, BRONZE_D)

    def finish(self, shade=True):
        if shade:
            # darken pixels on the right/bottom rim for a little volume
            src = [row[:] for row in self.px]
            for y in range(H):
                for x in range(W):
                    c = src[y][x]
                    if c is None:
                        continue
                    r = src[y][x + 1] if x + 1 < W else None
                    b = src[y + 1][x] if y + 1 < H else None
                    if r is None or b is None:
                        self.px[y][x] = tuple(int(v * 0.82) for v in c)
        src = [row[:] for row in self.px]
        for y in range(H):
            for x in range(W):
                if src[y][x] is not None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and src[yy][xx] is not None and src[yy][xx] != INK:
                        self.px[y][x] = INK
                        break
        return self

    def image(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for y in range(H):
            for x in range(W):
                c = self.px[y][x]
                if c is not None:
                    im.putpixel((x, y), c + (255,))
        return im


# ---------------------------------------------------------------- characters
# Each character follows its own Character Bible (mascot-concepts-latest):
# silhouette, proportions, palette, outfit and instrument come from the front
# view. Shared cute bits: 3x4 glossy eyes, "^" eyes when blinking.


def ceye(s, x, y, blink, iris=None, pupil='dot'):
    """3x4 cute eye. iris: coloured eye with a dark pupil."""
    if blink:
        s.set(x, y + 3, EYE); s.set(x + 1, y + 2, EYE); s.set(x + 2, y + 3, EYE)
        return
    if iris:
        s.rect(x, y, x + 3, y + 4, iris)
        if pupil == 'slit':
            s.rect(x + 1, y, x + 2, y + 4, EYE)
        else:
            s.rect(x + 1, y + 1, x + 3, y + 4, EYE)
    else:
        s.rect(x, y, x + 3, y + 4, EYE)
    s.set(x, y, HI); s.set(x + 1, y, HI); s.set(x, y + 1, HI)
    s.set(x + 2, y + 3, (200, 210, 230))


def medal(s, x, y):
    """Round bronze head badge (5x5)."""
    s.rect(x - 1, y - 2, x + 2, y + 3, BRONZE)
    s.rect(x - 2, y - 1, x + 3, y + 2, BRONZE)
    s.rect(x - 1, y - 1, x + 2, y + 2, BRONZE_D)
    s.set(x, y, BRONZE)
    s.set(x - 1, y - 2, (230, 186, 110))


def owl(blink=False, flag=None):
    s = S()
    G, g, C = (146, 156, 124), (114, 124, 96), (238, 228, 204)
    V, T, Y = (56, 72, 66), (74, 112, 122), (214, 170, 60)
    N, O, R = (96, 110, 118), (214, 160, 60), (112, 72, 46)
    Br = (86, 70, 58)
    s.mirror(lambda m: s.tri((m(8), 2), (m(11), 10), (m(16), 7), G))
    s.mirror(lambda m: s.line(m(10), 4, m(12), 8, C))
    s.ell(20, 33, 12.5, 11, G)
    s.ell(20, 17, 12, 10.5, G)
    for (x, y) in [(14, 9), (18, 8), (22, 8), (26, 9), (16, 11), (24, 11)]:
        s.set(x, y, g)
    # goggle-shaped face mask, sage V between the eyes
    s.ell(15.5, 17.5, 5.2, 5, C); s.ell(24.5, 17.5, 5.2, 5, C)
    s.ell(20, 22, 5, 3, C)
    s.tri((17.5, 12), (22.5, 12), (20, 16.5), G)
    s.line(11, 12, 15, 11, Br); s.line(25, 11, 29, 12, Br)
    s.ring(15.5, 17.5, 4.0, 1.0, Y); s.ring(24.5, 17.5, 4.0, 1.0, Y)
    s.rect(19, 17, 21, 18, Y)
    ceye(s, 14, 16, blink, iris=(140, 90, 40)); ceye(s, 23, 16, blink, iris=(140, 90, 40))
    s.tri((18.5, 21), (21.5, 21), (20, 24.5), N)
    # vest over a cream shirt, teal bow tie, gold buttons
    s.ell(20, 35, 11, 9, V, clip=(0, 27, W, 43))
    s.tri((16.5, 27), (23.5, 27), (20, 35), C)
    s.ell(20, 42, 6, 2.8, C)
    s.tri((16.5, 26), (16.5, 29.5), (20, 27.7), T); s.tri((23.5, 26), (23.5, 29.5), (20, 27.7), T)
    s.rect(19, 27, 21, 29, T)
    s.set(17, 32, Y); s.set(18, 35, Y)
    medal(s, 26, 33)
    # wings: left raises the gold baton, right holds the book
    s.ell(8.5, 34, 3, 6.5, g)
    if flag is None:
        s.line(8, 30, 4, 17, Y)
    elif flag == 'up':                      # start flag held high
        s.line(8, 30, 5, 2, (70, 70, 80))
        for fy in range(2, 12):
            for fx in range(6, 18):
                s.set(fx, fy, INK if ((fx - 6) // 3 + (fy - 2) // 3) % 2 else (250, 250, 250))
    else:                                   # swept down and out on GO
        s.line(8, 30, 1, 40, (70, 70, 80))
        for fy in range(36, 46):
            for fx in range(0, 7):
                s.set(fx, fy, INK if (fx // 3 + (fy - 36) // 3) % 2 else (250, 250, 250))
    s.ell(8, 30, 2.2, 2.2, g)
    s.rect(29, 32, 35, 40, R); s.rect(29, 32, 30, 40, (86, 54, 34)); s.line(34, 33, 34, 38, C)
    s.ell(31.5, 37, 2.2, 3, g)
    s.rect(14, 44, 18, 47, O); s.rect(22, 44, 26, 47, O)
    for x in (14, 16, 22, 24):
        s.set(x, 46, (60, 50, 44))
    return s.finish()


def anji(blink=False):
    s = S()
    Wt, w = (248, 247, 243), (200, 200, 198)
    H_, L = (92, 128, 156), (190, 140, 84)
    Dr, dr = (58, 108, 150), (92, 144, 180)
    Y = (232, 170, 50)
    s.mirror(lambda m: s.tri((m(8), 2), (m(11), 10), (m(16), 7), Wt))
    s.ell(20, 33, 12, 10.5, Wt)
    s.ell(20, 16.5, 12, 10.5, Wt)
    for (x, y) in [(14, 9), (17, 8), (20, 7), (23, 8), (26, 9), (12, 12), (28, 12)]:
        s.set(x, y, w)
    s.mirror(lambda m: s.set(m(10), 5, w))
    # black-framed glasses (canon)
    s.ring(15.5, 17.5, 4.3, 1.3, INK); s.ring(24.5, 17.5, 4.3, 1.3, INK)
    s.rect(19, 17, 21, 18, INK)
    ceye(s, 14, 16, blink, iris=Y); ceye(s, 23, 16, blink, iris=Y)
    s.tri((19, 21.5), (21, 21.5), (20, 24), (64, 64, 68))
    # speckled wings
    s.ell(8.5, 33, 3, 7, Wt); s.ell(31.5, 33, 3, 7, Wt)
    for (x, y) in [(8, 30), (9, 33), (8, 36), (32, 30), (31, 33), (32, 36)]:
        s.set(x, y, w)
    # drum harness: shoulder straps, chest band, badge in the middle
    s.line(13, 25, 17, 30, H_, 2); s.line(27, 25, 23, 30, H_, 2)
    s.rect(14, 30, 27, 32, H_)
    s.line(15, 32, 14, 37, H_); s.line(25, 32, 26, 37, H_)
    medal(s, 20, 31)
    # snare drum hanging from the harness
    s.rect(11, 36, 30, 44, Dr)
    for (x, y) in [(14, 40), (16, 39), (16, 41), (20, 40), (22, 39), (22, 41), (26, 40)]:
        s.set(x, y, dr)
    s.ell(20.5, 36, 9.5, 1.4, (240, 236, 228))
    s.rect(11, 37, 30, 38, SILVER); s.rect(11, 43, 30, 44, SILVER)
    for x in (12, 18, 24, 29):
        s.line(x, 38, x, 42, (176, 182, 188))
    # sticks: one raised, one on the drum
    s.line(9, 30, 6, 22, (150, 104, 60)); s.ell(6, 21, 1, 1, L)
    s.line(31, 32, 26, 35, (150, 104, 60)); s.set(25, 35, L)
    s.rect(14, 44, 18, 47, (150, 150, 150)); s.rect(22, 44, 26, 47, (150, 150, 150))
    return s.finish()


def anje(blink=False):
    s = S()
    Wt, w = (250, 249, 246), (214, 212, 206)
    P, Tr = (100, 84, 126), (128, 124, 120)
    X, x_ = (54, 54, 58), (150, 150, 156)
    # long black tail with white edges, behind the body
    s.line(26, 40, 38, 47, X, 2)
    s.line(27, 39, 38, 45, x_)
    # egg-shaped body: taller than wide, narrower at the head, fuller at the belly
    for y in range(H):
        for x in range(W):
            dy = (y + .5 - 29.5) / 14
            rx = 9.6 * (1 + 0.10 * dy)
            e = 2.5 if dy < 0 else 2.0                # fuller, rounder crown
            if abs((x + .5 - 20) / rx) ** e + abs(dy) ** e <= 1:
                s.set(x, y, Wt)
    s.ell(20, 38.5, 6, 3, (238, 236, 230), clip=(0, 38, W, 43))
    # dark wings with a pale stripe
    s.ell(11, 35, 2.6, 6, X); s.ell(29, 35, 2.6, 6, X)
    s.line(10.5, 33, 11.5, 39, x_); s.line(29.5, 33, 28.5, 39, x_)
    if blink:
        ceye(s, 14, 22, True); ceye(s, 23, 22, True)
    else:
        for x0 in (14, 24):
            s.rect(x0, 23, x0 + 2, 26, EYE); s.set(x0, 23, HI)
    s.tri((19, 26.5), (21, 26.5), (20, 28.5), X)
    # short capelet with grey trim, badge at the centre
    s.ell(20, 34, 10.5, 4.2, P, clip=(0, 31, W, 40))
    for x in range(W):
        ys = [y for y in range(H) if s.get(x, y) == P]
        if ys:
            s.set(x, max(ys), Tr)
    medal(s, 20, 35)
    s.rect(17, 41, 18, 46, X); s.rect(22, 41, 23, 46, X)
    s.rect(16, 46, 19, 47, X); s.rect(21, 46, 24, 47, X)
    # crescent frame with exactly five bells, held up in the left wing
    for y in range(H):
        for x in range(W):
            if ((x + .5 - 7) / 6.5) ** 2 + ((y + .5 - 29) / 6.5) ** 2 <= 1 and                ((x + .5 - 9.8) / 5.4) ** 2 + ((y + .5 - 27.4) / 5.4) ** 2 > 1:
                s.set(x, y, BRONZE)
    s.line(2, 24, 12, 24, BRONZE_D)
    for x in (3, 5, 7, 9, 11):
        s.set(x, 25, (150, 150, 156)); s.set(x, 26, (214, 176, 96))
    s.ell(8, 35, 2.2, 2, X)
    s.finish()
    # three curly head feathers (canon: 三根自然呆毛)
    Cr = (132, 132, 142)
    for (x, y) in [(19, 16), (18, 15), (17, 14), (17, 13), (16, 12),
                   (20, 16), (20, 15), (20, 14), (20, 13), (21, 12), (21, 11),
                   (21, 16), (22, 15), (23, 14), (23, 13), (24, 12)]:
        s.set(x, y, Cr)
    return s


def blazer(s, J, right_end=39):
    """Jacket + sleeves; shoulders are rounded corners, not square or steep."""
    inset = [4, 2, 1]                      # rows 27-29: rounded shoulder, then straight sleeves
    for y in range(27, 42):
        k = inset[y - 27] if y - 27 < len(inset) else 0
        xl = 9 + k if y < 40 else 12
        xr = 31 - k if y < right_end else 28
        for x in range(xl, xr):
            s.set(x, y, J)


def shiba_head(s, c, cy=16.6, rx=11.3, ry=9.4):
    """Round crown; the lower half is a squircle so the cheeks stay full and the chin wide."""
    for y in range(H):
        for x in range(W):
            dx, dy = abs(x + .5 - 20) / rx, (y + .5 - cy) / ry
            if (dx * dx + dy * dy <= 1) if dy < 0 else (dx ** 2.3 + dy ** 2.3 <= 1):
                s.set(x, y, c)


def anbo(blink=False):
    s = S()
    O, C = (232, 136, 48), (250, 236, 210)
    Pk, Od = (242, 202, 172), (204, 112, 38)
    J, j = (50, 52, 60), (78, 82, 92)
    R, TB = (190, 98, 44), (160, 80, 40)
    # upright ears with pale insides
    s.mirror(lambda m: s.tri((m(9), 13), (m(9), 2), (m(16.5), 8), O))
    s.mirror(lambda m: s.tri((m(10.4), 10.8), (m(10.3), 4.6), (m(14.4), 7.8), Pk))
    s.rect(15, 25, 26, 27, R)
    s.ell(20, 16.5, 11.3, 9.5, O)          # same oval head as Angoo
    # cream lower face: cheeks up to the eyes, muzzle bump in the middle
    for y in range(19, H):
        for x in range(W):
            if s.get(x, y) == O:
                s.set(x, y, C)
    s.ell(20, 19, 3.8, 2.1, C)
    s.rect(13, 11, 16, 12, C); s.rect(24, 11, 27, 12, C)
    # glossy eyes (same as the first version)
    ceye(s, 13, 14, blink); ceye(s, 24, 14, blink)
    # black nose, smile, tongue
    s.rect(19, 19, 21, 20, INK)
    s.set(18, 21, INK); s.set(19, 22, INK); s.set(20, 22, INK); s.set(21, 21, INK)
    s.rect(19, 23, 21, 24, (230, 110, 110))
    # blazer: shoulders, open front over the cream chest, sleeves, pocket flaps
    blazer(s, J, right_end=38)
    s.rect(17, 27, 24, 41, C)
    s.ell(20, 40.5, 4, 2.2, C)
    for y in range(27, 34):
        s.set(16 + (y - 27) // 3, y, j); s.set(24 - (y - 27) // 3, y, j)
    s.line(13, 36, 15, 36, j); s.line(25, 36, 27, 36, j)
    medal(s, 20, 29)
    s.line(12, 31, 12, 39, j); s.line(27, 31, 27, 38, j)
    s.rect(9, 39, 12, 42, O); s.set(9, 41, None)
    # tambourine held in the right paw
    s.ring(33.5, 38.5, 4.3, 1.6, TB)
    for (x, y) in [(33, 34), (37, 38), (33, 42), (29, 38)]:
        s.rect(x, y, x + 2, y + 1, (214, 176, 96))
    s.rect(28, 38, 31, 41, O); s.set(30, 40, None)
    # orange legs and paws
    s.rect(14, 41, 19, 47, O); s.rect(21, 41, 26, 47, O)
    for x in (15, 17, 22, 24):
        s.set(x, 46, Od)
    return s.finish()


def anbo_back():
    s = S()
    O, C, J, j = (232, 136, 48), (250, 236, 210), (50, 52, 60), (78, 82, 92)
    s.mirror(lambda m: s.tri((m(9), 13), (m(9), 2), (m(16.5), 8), O))
    s.rect(15, 25, 26, 27, (190, 98, 44))
    s.ell(20, 16.5, 11.3, 9.5, O)
    blazer(s, J)
    s.line(20, 30, 20, 40, j)
    s.rect(9, 39, 12, 42, O); s.rect(28, 39, 31, 42, O)
    s.rect(14, 41, 19, 47, O); s.rect(21, 41, 26, 47, O)
    s.finish()
    # seated in the car: keep head + upper body (down to the waist) and drop it to
    # the bottom of the canvas, so the car roof hides the legs
    CUT = 37
    top = [row[:] for row in s.px[:CUT]]
    s.px = [[None] * W for _ in range(H - CUT)] + top
    for x in range(W):
        if s.px[H - 1][x] is not None:
            s.px[H - 1][x] = INK
    return s


def ansey(blink=False):
    s = S()
    A, a = (116, 124, 140), (90, 98, 112)
    PK, GR = (176, 128, 128), (140, 192, 70)
    N, CU = (48, 54, 74), (192, 120, 62)
    V, v = (170, 88, 36), (120, 60, 26)
    BW = (214, 180, 120)
    # tail curling up behind the legs
    s.line(24, 43, 31, 44, A, 2); s.line(31, 44, 34, 38, A, 2); s.set(33, 37, A)
    # tall ears, wedge-shaped head
    s.mirror(lambda m: s.tri((m(9), 1), (m(12), 11), (m(17.5), 7), A))
    s.mirror(lambda m: s.tri((m(10.5), 4), (m(12.5), 10), (m(15.5), 7.5), PK))
    s.ell(20, 13.5, 9, 7.5, A)
    s.tri((11.5, 15), (28.5, 15), (20, 23), A)
    s.ell(20, 19, 3.5, 2.3, (138, 146, 160))
    ceye(s, 14, 12, blink, iris=GR, pupil='slit'); ceye(s, 23, 12, blink, iris=GR, pupil='slit')
    if not blink:
        s.set(13, 12, EYE); s.set(26, 12, EYE)
    s.rect(19, 18, 21, 19, (122, 92, 100))
    s.set(18, 20, a); s.set(19, 21, a); s.set(20, 21, a); s.set(21, 20, a)
    # high collar, short tailcoat with copper piping, slim trousers
    s.rect(18, 22, 22, 24, A)
    s.rect(15, 21, 17, 25, N); s.rect(23, 21, 25, 25, N)
    s.ell(20, 25.5, 6, 2, N)
    s.rect(15, 25, 25, 34, N)
    s.line(17, 24, 19, 29, CU); s.line(23, 24, 21, 29, CU)
    s.line(15, 33, 24, 33, CU)
    s.tri((15, 33), (12, 42), (17, 40), N); s.tri((25, 33), (28, 42), (23, 40), N)
    s.line(15, 34, 13, 41, CU); s.line(25, 34, 27, 41, CU)
    s.rect(16, 34, 19, 45, N); s.rect(21, 34, 24, 45, N)
    s.rect(15, 45, 19, 47, A); s.rect(21, 45, 25, 47, A)
    medal(s, 20, 28)
    # left arm holds the bow, right arm the violin neck
    s.ell(13.5, 29, 1.8, 4, N); s.ell(13.5, 33, 1.5, 1.5, A)
    s.line(26, 26, 31, 23, N, 2); s.ell(32.5, 22.5, 1.4, 1.4, A)
    # violin under the chin
    s.ell(26.5, 23.5, 3.6, 2.3, V)
    s.line(24, 24, 29, 23, v)
    s.line(29, 22, 34, 20, (80, 44, 22)); s.ell(35, 19.5, 1.2, 1.2, (80, 44, 22))
    s.line(12, 34, 30, 23, BW)
    return s.finish()


def angoo(blink=False):
    s = S()
    F, C = (236, 130, 42), (250, 238, 216)
    Br, T, t = (104, 62, 38), (32, 152, 160), (22, 118, 126)
    Ft = (214, 110, 34)                    # tail one shade darker so it reads behind the body
    for (cx, cy, r) in [(27, 40, 2.5), (30.5, 37.5, 3.3), (32.5, 33.5, 3.6), (33, 29.5, 3.2)]:
        s.ell(cx, cy, r, r, Ft)
    s.ell(33, 27.5, 2.6, 2.3, C)
    s.mirror(lambda m: s.tri((m(6), 1), (m(10), 12), (m(17), 7), F))
    s.mirror(lambda m: s.tri((m(8), 4.5), (m(10.5), 10.5), (m(14.5), 7.5), C))
    s.mirror(lambda m: s.tri((m(6), 1), (m(7.6), 5), (m(9.8), 3.5), Br))
    s.ell(20, 16, 11.5, 9.5, F)
    # wide cream cheeks and muzzle
    s.ell(13.5, 21.5, 4.5, 3, C); s.ell(26.5, 21.5, 4.5, 3, C)
    s.ell(20, 21.5, 4, 3.2, C)
    s.set(8, 20, C); s.set(31, 20, C)
    ceye(s, 13, 15, blink, iris=(120, 66, 30)); ceye(s, 24, 15, blink, iris=(120, 66, 30))
    if not blink:
        s.set(12, 14, EYE); s.set(27, 14, EYE)
    s.rect(19, 20, 21, 21, (70, 44, 30))
    s.set(18, 22, INK); s.set(19, 23, INK); s.set(20, 23, INK); s.set(21, 22, INK)
    # teal bow at the base of her left ear
    s.tri((26, 5), (26, 9), (29, 7), T); s.tri((32, 5), (32, 9), (29, 7), T); s.set(29, 7, t)
    s.ell(20, 36, 7, 7, F)
    s.ell(20, 37.5, 3.5, 4, C)
    # thick scarf wrap, fringed end hanging in front, badge on the scarf
    s.ell(20, 27, 8.5, 2.4, T)
    s.rect(13, 28, 17, 36, T)
    for x in (13, 15):
        s.set(x, 36, t)
    s.line(13, 28, 16, 28, t)
    medal(s, 21, 31)
    s.ell(11.5, 34, 2, 3.8, F); s.ell(11.5, 37.5, 1.8, 1.6, Br)
    s.ell(28.5, 34, 2, 3.8, F); s.ell(28.5, 37.5, 1.8, 1.6, Br)
    s.rect(15, 41, 19, 45, F); s.rect(21, 41, 25, 45, F)
    s.rect(14, 44, 19, 47, Br); s.rect(21, 44, 26, 47, Br)
    return s.finish()


def anmi(blink=False):
    s = S()
    B, b, C = (112, 78, 54), (86, 58, 40), (236, 220, 196)
    T, t, Or = (30, 150, 160), (22, 116, 124), (220, 104, 56)
    M, Wd = (228, 100, 54), (176, 116, 62)
    # long tapered tail
    s.line(24, 37, 31, 40, B, 3); s.line(31, 41, 36, 42, B, 2); s.set(37, 42, B)
    s.ell(9.5, 9, 2.4, 2.4, B); s.ell(30.5, 9, 2.4, 2.4, B)
    s.set(9, 9, b); s.set(30, 9, b)
    s.ell(20, 15.5, 11, 9.5, B)
    s.ell(20, 21, 8.5, 4.5, C)
    s.line(12, 11, 14, 11, b); s.line(25, 11, 27, 11, b)
    ceye(s, 13, 13, blink, iris=(92, 56, 30)); ceye(s, 24, 13, blink, iris=(92, 56, 30))
    s.rect(18, 18, 22, 20, INK); s.set(19, 18, (120, 120, 130))
    s.set(18, 21, INK); s.set(19, 22, INK); s.set(20, 22, INK); s.set(21, 21, INK)
    for (x, y) in [(15, 20), (14, 22), (25, 20), (26, 22)]:
        s.set(x, y, (168, 136, 112))
    # cream belly under a sleeveless teal hoodie, orange neckerchief
    s.ell(20, 39.5, 7, 5, B)
    s.ell(20, 40, 4, 3.5, C)
    s.ell(20, 32, 8.5, 6, T)
    s.ell(20, 26.5, 9, 1.8, t)
    s.rect(16, 34, 25, 36, t)
    s.tri((16, 26), (24, 26), (20, 30), Or)
    medal(s, 20, 31)
    # arms out to the sides, one maraca in each paw
    s.ell(10, 30, 2.2, 3.6, B); s.ell(30, 30, 2.2, 3.6, B)
    s.line(8, 31, 6, 25, Wd); s.line(32, 31, 34, 25, Wd)
    s.ell(5.5, 21.5, 2.4, 3, M); s.ell(34.5, 21.5, 2.4, 3, M)
    s.rect(3, 22, 8, 23, C); s.rect(32, 22, 37, 23, C)
    s.ell(8.5, 31.5, 1.6, 1.6, B); s.ell(31.5, 31.5, 1.6, 1.6, B)
    s.line(16, 41, 14, 43, B, 3); s.line(22, 41, 24, 43, B, 3)
    s.rect(12, 45, 17, 47, B); s.rect(23, 45, 28, 47, B)
    return s.finish()


def anka(blink=False):
    s = S()
    Ca, Lt, Pw = (204, 142, 74), (226, 176, 112), (118, 84, 60)
    Nz, nz = (112, 90, 80), (78, 62, 56)
    Ol, ol, Kc = (118, 128, 74), (94, 104, 58), (214, 138, 52)
    U = (246, 224, 178)
    # small round ears; head narrow at the crown, wide at the muzzle
    s.ell(13.5, 6, 2.2, 2.2, Ca); s.ell(26.5, 6, 2.2, 2.2, Ca)
    s.set(13, 6, (150, 100, 62)); s.set(27, 6, (150, 100, 62))
    for y in range(4, 25):
        yc = y + .5
        hw = 6.3 + 3.6 * (yc - 4.5) / 19.5
        if yc < 8:
            hw *= math.sqrt(max(0.0, 1 - ((8 - yc) / 3.6) ** 2))
        if yc > 21:
            hw *= math.sqrt(max(0.0, 1 - ((yc - 21) / 3.8) ** 2))
        for x in range(W):
            if abs(x + .5 - 20) <= hw:
                s.set(x, y, Ca)
    s.ell(20, 18.6, 4.6, 2.8, Nz)
    s.set(18, 18, nz); s.set(21, 18, nz)
    s.line(14, 9, 15, 9, (140, 90, 52)); s.line(25, 9, 26, 9, (140, 90, 52))
    if blink:
        s.rect(14, 12, 16, 13, EYE); s.rect(24, 12, 26, 13, EYE)
    else:
        s.rect(14, 11, 16, 14, EYE); s.set(14, 11, HI)
        s.rect(24, 11, 26, 14, EYE); s.set(24, 11, HI)
    s.set(19, 21, INK); s.set(20, 21, INK)
    s.rect(19, 22, 21, 23, (252, 250, 240))
    # big pear-shaped body, light belly, knit vest on the sides
    s.ell(20, 36, 12, 10, Ca)
    s.ell(20, 38, 7, 7, Lt)
    s.ell(12.5, 33, 4.5, 7.5, Ol, clip=(0, 26, 17, 42))
    s.ell(27.5, 33, 4.5, 7.5, Ol, clip=(23, 26, W, 42))
    for y in range(28, 41, 2):
        for x in (11, 14, 26, 29):
            s.set(x, y, ol)
    s.ell(20, 26.2, 9, 2, Kc)
    s.tri((18, 26), (22, 26), (20, 29), Kc)
    medal(s, 20, 30)
    s.ell(9, 35, 2.2, 4, Ca); s.ell(9, 38.5, 1.6, 1.4, Pw)
    # light-wood ukulele across the belly
    s.line(18, 35, 28, 29, (112, 70, 36), 2)
    s.rect(28, 27, 31, 30, (200, 120, 60))
    s.ell(14, 39, 4.5, 3.9, (128, 84, 44)); s.ell(16.8, 36.5, 3.5, 3.2, (128, 84, 44))
    s.ell(14, 39, 3.6, 3, U); s.ell(16.8, 36.5, 2.6, 2.3, U)
    s.ell(15, 38, 1, 1, (90, 60, 36))
    s.ell(22.5, 34, 1.7, 1.7, Pw)
    s.rect(12, 44, 18, 47, Ca); s.rect(22, 44, 28, 47, Ca)
    for x in (12, 14, 16, 23, 25, 27):
        s.set(x, 46, Pw)
    return s.finish()


def anzo(blink=False):
    s = S()
    G, g, Bl = (128, 148, 86), (100, 118, 66), (216, 210, 160)
    Or, Am = (214, 134, 58), (232, 166, 46)
    Wd, wd = (140, 90, 48), (104, 64, 34)
    # long tail curling inward, with orange bands
    s.ring(31, 36, 5, 2.2, G, arc=(180, 110))
    s.ell(31, 36, 1.4, 1.4, G)
    s.line(25, 42, 31, 41, G, 2)
    for (x, y) in [(27, 41), (35, 37), (31, 31), (27, 34)]:
        s.set(x, y, Or)
    # wide flat head, bulging eyes with heavy lids
    s.ell(20, 15.5, 12.5, 8, G)
    s.ell(13, 12.5, 4, 4, G); s.ell(27, 12.5, 4, 4, G)
    for cx in (13, 27):
        if blink:
            ceye(s, cx - 1, 11, True)
            continue
        s.ell(cx, 13, 3, 3, Am)
        s.rect(cx - 3, 9, cx + 4, 12, G)
        s.line(cx - 2, 12, cx + 2, 12, EYE)
        s.rect(cx, 13, cx + 2, 16, EYE)
        s.set(cx, 13, HI)
    # orange diamond on the forehead
    for (x, y) in [(20, 7), (19, 8), (21, 8), (18, 9), (22, 9), (19, 10), (21, 10), (20, 11)]:
        s.set(x, y, Or)
    s.set(18, 15, g); s.set(22, 15, g)
    # cream jaw under a wide smile
    s.ell(20, 20.5, 8.5, 2.8, Bl, clip=(0, 19, W, H))
    s.set(12, 17, INK); s.set(13, 18, INK); s.rect(14, 19, 27, 20, INK); s.set(27, 18, INK); s.set(28, 17, INK)
    # slim upright body with a cream belly
    s.ell(20, 32, 6.5, 9, G)
    s.ell(20, 33, 3.5, 7.5, Bl)
    s.line(15, 24, 22, 27, BRONZE_D); s.line(25, 24, 22, 27, BRONZE_D)
    medal(s, 22, 28)
    s.ell(26.5, 31, 2, 3.5, G); s.ell(27, 34.5, 1.4, 1.4, G)
    # round wooden kalimba held at the left
    s.ell(14, 33, 4.8, 5, Wd)
    s.ring(14, 33, 4.8, 1, wd)
    for x in (11, 13, 15, 17):
        s.line(x, 29, x, 32 - abs(x - 14) // 2, (226, 228, 232))
    s.set(14, 35, BRONZE)
    s.set(9, 31, Bl); s.set(9, 34, Bl)
    s.rect(14, 40, 18, 44, G); s.rect(22, 40, 26, 44, G)
    s.ell(15, 45, 3.2, 1.6, G); s.ell(25, 45, 3.2, 1.6, G)
    for x in (12, 15, 18, 22, 25, 28):
        s.set(x, 46, Bl)
    return s.finish()


def anbi(blink=False):
    s = S()
    D, C, Wt = (206, 124, 58), (246, 230, 206), (253, 251, 246)
    Hf, Bv, Er = (84, 56, 38), (118, 122, 146), (96, 64, 42)
    # fluffy tail: orange top, white underside
    s.ell(29.5, 39, 2.4, 3.5, D); s.ell(30, 40.5, 1.6, 2.2, Wt)
    # big upright ears with dark tips
    s.mirror(lambda m: s.tri((m(3), 1), (m(11), 11), (m(15.5), 6), D))
    s.mirror(lambda m: s.tri((m(5), 3), (m(11), 9.5), (m(13.5), 6.5), C))
    s.mirror(lambda m: s.tri((m(3), 1), (m(4.5), 4.5), (m(6.5), 2.5), Er))
    s.ell(20, 16, 10, 9, D)
    for (x, y) in [(16, 10), (19, 9), (22, 9), (24, 11), (18, 12), (21, 11)]:
        s.set(x, y, Wt)
    s.ell(13.5, 21, 3.5, 2.6, C); s.ell(26.5, 21, 3.5, 2.6, C)
    s.ell(20, 21.5, 4, 3, C)
    s.rect(19, 19, 21, 21, Hf)
    s.set(18, 22, INK); s.set(19, 23, INK); s.set(20, 23, INK); s.set(21, 22, INK)
    ceye(s, 13, 14, blink, iris=(120, 66, 30)); ceye(s, 24, 14, blink, iris=(120, 66, 30))
    if not blink:
        s.set(12, 13, EYE); s.set(27, 13, EYE)
    # slender body, cream chest, short grey-blue vest
    s.ell(20, 34, 6, 7, D)
    s.ell(20, 34, 2.8, 5.5, C)
    s.rect(14, 27, 18, 36, Bv); s.rect(22, 27, 26, 36, Bv)
    medal(s, 24, 31)
    # triangle hanging from the left hand, beater in the right
    s.ell(12, 30, 1.8, 3, D); s.ell(11.5, 27.5, 1.5, 1.5, Hf)
    s.line(10, 28, 8, 31, (150, 150, 156))
    s.line(8, 31, 4, 38, SILVER); s.line(4, 38, 12, 38, SILVER); s.line(12, 38, 9, 33, SILVER)
    s.ell(28, 32, 1.8, 3, D); s.ell(28, 35, 1.5, 1.5, Hf)
    s.line(27, 35, 20, 37, SILVER)
    s.ell(20, 38.5, 5.5, 3, D)
    s.rect(15, 39, 18, 45, D); s.rect(22, 39, 25, 45, D)
    s.set(16, 40, Wt); s.set(23, 40, Wt)
    s.rect(15, 45, 18, 47, Hf); s.rect(22, 45, 25, 47, Hf)
    return s.finish()


def anleo(blink=False):
    s = S()
    L, C = (214, 156, 72), (238, 216, 174)
    Mn, mn = (108, 67, 38), (84, 50, 28)
    Mr, St = (112, 46, 48), (124, 82, 42)
    Wd, Hd = (140, 92, 48), (234, 218, 186)
    # tail tuft
    s.line(12, 42, 5, 44, L); s.ell(4, 43, 2, 2, Mn)
    # full mane
    s.ell(20, 14, 13, 12, Mn)
    for a in range(0, 360, 30):
        x = 20 + 13.5 * math.cos(math.radians(a)); y = 14 + 12.5 * math.sin(math.radians(a))
        s.ell(x, y, 1.6, 1.6, mn)
    s.ell(10, 5, 2.4, 2.4, L); s.ell(30, 5, 2.4, 2.4, L)
    s.ell(20, 15, 8, 7.5, L)
    s.ell(20, 19, 4.5, 3, C)
    s.tri((18.5, 16.5), (21.5, 16.5), (20, 18.5), (92, 56, 40))
    s.eye(15, 12, blink, 2, 3)
    s.eye(23, 12, blink, 2, 3)
    s.rect(19, 21, 21, 22, (92, 56, 40))
    s.ell(20, 34, 9, 9.5, L)
    s.ell(20, 36, 4.5, 6, C)
    s.rect(11, 27, 16, 39, Mr); s.rect(24, 27, 29, 39, Mr)
    s.line(12, 26, 28, 40, St, 2)
    s.badge(26, 30)
    s.ell(9.5, 33, 2.4, 5, L)
    # djembe at the right hip
    s.rect(28, 35, 37, 46, Wd)
    s.ell(32.5, 35, 4.5, 1.6, Hd)
    for x in (29, 31, 33, 35):
        s.line(x, 37, x + 1, 44, (96, 60, 30))
    s.ell(30, 33, 2.3, 2.3, L)
    s.rect(14, 42, 19, 47, L); s.rect(21, 42, 26, 47, L)
    return s.finish()


def seated(s, cut):
    """Keep rows above `cut` and drop them to the bottom of the canvas (the car hides the rest)."""
    s.finish()
    top = [row[:] for row in s.px[:cut]]
    s.px = [[None] * W for _ in range(H - cut)] + top
    for x in range(W):
        if s.px[H - 1][x] is not None:
            s.px[H - 1][x] = INK
    return s


def anje_back():
    s = S()
    Wt, w, P, Tr, Cr = (250, 249, 246), (224, 222, 216), (100, 84, 126), (128, 124, 120), (132, 132, 142)
    for y in range(H):
        for x in range(W):
            dy = (y + .5 - 29.5) / 14
            rx = 9.6 * (1 + 0.10 * dy)
            e = 2.5 if dy < 0 else 2.0
            if abs((x + .5 - 20) / rx) ** e + abs(dy) ** e <= 1:
                s.set(x, y, Wt)
    s.ell(20, 22, 6, 4, w)                                  # soft shading on the back of the head
    s.ell(20, 34, 10.5, 3.6, P, clip=(0, 31, W, 40))        # capelet
    for x in range(W):
        ys = [y for y in range(H) if s.get(x, y) == P]
        if ys:
            s.set(x, max(ys), Tr)
    seated(s, 38)
    # three soft head feathers drawn after the outline so they stay thin
    for (x, y) in [(19, 26), (18, 25), (17, 24), (17, 23), (16, 22),
                   (20, 26), (20, 25), (20, 24), (20, 23), (21, 22), (21, 21),
                   (21, 26), (22, 25), (23, 24), (23, 23), (24, 22)]:
        s.set(x, y, Cr)
    return s


def anleo_back():
    s = S()
    L, Mn, mn, Mr = (214, 156, 72), (108, 67, 38), (84, 50, 28), (112, 46, 48)
    s.ell(20, 34, 10, 9, Mr)
    s.ell(20, 14, 13, 12, Mn)
    for a in range(0, 360, 30):
        x = 20 + 13.5 * math.cos(math.radians(a)); y = 14 + 12.5 * math.sin(math.radians(a))
        s.ell(x, y, 1.6, 1.6, mn)
    for (x, y) in [(15, 10), (20, 8), (25, 10), (17, 15), (23, 15), (20, 19)]:
        s.ell(x, y, 1.3, 1.6, mn)
    s.ell(10, 5, 2.4, 2.4, L); s.ell(30, 5, 2.4, 2.4, L)
    return seated(s, 34)


def anka_back():
    s = S()
    Ca, Ol, ol, Kc = (204, 142, 74), (118, 128, 74), (94, 104, 58), (214, 138, 52)
    s.ell(20, 35, 12, 9, Ol)
    for y in range(28, 36, 2):
        for x in range(11, 30, 3):
            s.set(x, y, ol)
    s.ell(13.5, 6, 2.2, 2.2, Ca); s.ell(26.5, 6, 2.2, 2.2, Ca)
    for y in range(4, 25):
        yc = y + .5
        hw = 6.3 + 3.6 * (yc - 4.5) / 19.5
        if yc < 8:
            hw *= math.sqrt(max(0.0, 1 - ((8 - yc) / 3.6) ** 2))
        if yc > 21:
            hw *= math.sqrt(max(0.0, 1 - ((yc - 21) / 3.8) ** 2))
        for x in range(W):
            if abs(x + .5 - 20) <= hw:
                s.set(x, y, Ca)
    s.ell(20, 26.2, 8, 1.8, Kc); s.tri((18, 26), (22, 26), (20, 30), Kc)
    return seated(s, 34)


def anzo_back():
    s = S()
    G, g, Or = (128, 148, 86), (100, 118, 66), (214, 134, 58)
    s.ell(20, 32, 7.5, 9, G)
    s.ell(20, 15.5, 12.5, 8, G)
    s.ell(13, 12.5, 4, 4, G); s.ell(27, 12.5, 4, 4, G)
    for (x, y) in [(15, 12), (20, 10), (25, 12), (17, 17), (23, 17), (20, 21), (20, 27), (17, 30), (23, 30)]:
        s.set(x, y, g); s.set(x + 1, y, g)
    for y in (24, 27, 30):
        s.set(20, y, Or)
    return seated(s, 33)


def angoo_back():
    s = S()
    F, Br, T, t = (236, 130, 42), (104, 62, 38), (32, 152, 160), (22, 118, 126)
    s.ell(20, 34, 8, 7, F)
    s.mirror(lambda m: s.tri((m(6), 1), (m(10), 12), (m(17), 7), F))
    s.mirror(lambda m: s.tri((m(6), 1), (m(7.6), 5), (m(9.8), 3.5), Br))
    s.ell(20, 16, 11.5, 9.5, F)
    s.ell(20, 27, 9, 2.6, T)
    s.rect(18, 28, 22, 34, T); s.line(18, 28, 21, 28, t)
    # bow on her left ear, which is on the viewer's left from behind
    s.tri((8, 5), (8, 9), (11, 7), T); s.tri((14, 5), (14, 9), (11, 7), T); s.set(11, 7, t)
    return seated(s, 35)


def ansey_back():
    s = S()
    A, a, N, CU = (116, 124, 140), (90, 98, 112), (48, 54, 74), (192, 120, 62)
    s.ell(20, 31, 8.5, 7, N)
    s.rect(15, 21, 25, 26, N)
    s.line(20, 24, 20, 34, CU)
    s.mirror(lambda m: s.tri((m(9), 1), (m(12), 11), (m(17.5), 7), A))
    s.mirror(lambda m: s.tri((m(10.5), 4), (m(12.5), 10), (m(15.5), 7.5), a))
    s.ell(20, 13.5, 9, 7.5, A)
    s.tri((11.5, 15), (28.5, 15), (20, 22), A)
    return seated(s, 34)


def anmi_back():
    s = S()
    B, b, T, t = (112, 78, 54), (86, 58, 40), (30, 150, 160), (22, 116, 124)
    s.ell(20, 33, 9, 7, T)
    s.ell(20, 26.5, 9.5, 3, t)                        # hood folded at the back of the neck
    s.ell(9.5, 9, 2.4, 2.4, B); s.ell(30.5, 9, 2.4, 2.4, B)
    s.set(9, 9, b); s.set(30, 9, b)
    s.ell(20, 15.5, 11, 9.5, B)
    return seated(s, 35)


def anbi_back():
    s = S()
    D, Wt, Bv, Er = (206, 124, 58), (253, 251, 246), (118, 122, 146), (96, 64, 42)
    s.ell(20, 33, 7.5, 7, Bv)
    s.mirror(lambda m: s.tri((m(3), 1), (m(11), 11), (m(15.5), 6), D))
    s.mirror(lambda m: s.tri((m(3), 1), (m(4.5), 4.5), (m(6.5), 2.5), Er))
    s.ell(20, 16, 10, 9, D)
    return seated(s, 35)


DRIVERS = [('anje', anje_back), ('anleo', anleo_back), ('anka', anka_back), ('anzo', anzo_back),
           ('angoo', angoo_back), ('ansey', ansey_back), ('anmi', anmi_back), ('anbi', anbi_back)]


def anbo_paw():
    """Anbo's paw for the match-3 stage, seen from above as it presses the screen: back of the paw (orange fur,
    toes split by ink creases), tilted about 40 degrees, the blazer sleeve coming in from the lower right. The toe tip at
    PAW_TIP is the point that touches the tile. The back of the paw is all orange fur (no cream)."""
    s = S()
    O, C, J, j, Od = (232, 136, 48), (250, 236, 210), (50, 52, 60), (78, 82, 92), (204, 112, 38)
    th = math.radians(40)
    d = (-math.sin(th), -math.cos(th))                        # along the arm, towards the toes (up-left)
    n = (math.cos(th), -math.sin(th))                         # across the arm
    P = (17.0, 18.0)                                          # centre of the paw

    def at(k_d, k_n):
        return (P[0] + d[0] * k_d + n[0] * k_n, P[1] + d[1] * k_d + n[1] * k_n)

    def blob(c0, ha, hb, col, box=False):
        for y in range(H):
            for x in range(W):
                vx, vy = x + 0.5 - c0[0], y + 0.5 - c0[1]
                u, v = vx * d[0] + vy * d[1], vx * n[0] + vy * n[1]
                if (abs(u) <= ha and abs(v) <= hb) if box else ((u / ha) ** 2 + (v / hb) ** 2 <= 1):
                    s.set(x, y, col)
    blob(at(-19.5, 0), 5.0, 6.0, J, box=True)                 # sleeve stub
    blob(at(-19.5, -4.2), 5.0, 1.2, j, box=True)
    blob(at(-13.2, 0), 1.8, 8.2, j, box=True)                 # cuff
    for k in (-4, 0, 4):
        x, y = at(-13.2, k); s.set(round(x - 0.5), round(y - 0.5), (200, 164, 80))
    blob(at(-8.5, 0), 4.0, 5.6, O, box=True)                  # wrist fur
    blob(P, 8.4, 9.8, O)                                      # back of the paw
    for k in (-1.5, -0.5, 0.5, 1.5):                          # four toes along the leading edge, same orange fur
        blob(at(8.6 - 1.1 * abs(k), k * 4.5), 3.6, 2.6, O)
    s.finish(shade=False)                                     # outline the mitten first ...
    for k in (-1, 0, 1):                                      # ... then ink dividers between the toes
        for t in (6.2, 7.2, 8.2, 9.2, 10.2):
            x, y = at(t - 0.8 * abs(k), k * 4.5)
            if s.get(int(x), int(y)) == O:
                s.set(int(x), int(y), INK)
    for t in (4.2, 5.0):                                      # short fur creases continuing the dividers
        for k in (-1, 1):
            x, y = at(t - 0.8, k * 4.5); s.set(int(x), int(y), Od)
    x, y = at(-2.5, -5.0); s.set(int(x), int(y), (246, 176, 96)); x, y = at(-1.5, -5.0); s.set(int(x), int(y), (246, 176, 96))
    return s.finish()


PAW_TIP = (9.3, 8.6)


def anje_ski(blink=False):
    """Anje on skis, turned three-quarters to the right (for STAGE 06's side view): eyes and beak shifted right,
    tail streaming out behind to the left, knees tucked, a pole trailing from the back wing, orange skis."""
    s = S()
    Wt = (250, 249, 246)
    P, Tr = (100, 84, 126), (128, 124, 120)
    X, x_ = (54, 54, 58), (150, 150, 156)
    SK, sk = (240, 84, 22), (255, 150, 90)
    # tail behind, streaming left
    s.line(12, 38, 1, 43, X, 2)
    s.line(12, 37, 2, 41, x_)
    # ski pole trailing from the back wing to the snow behind
    s.line(10, 34, 3, 46, (90, 90, 100))
    s.rect(2, 46, 5, 47, (90, 90, 100))
    # egg body, leaning slightly forward (shifted right at the top)
    for y in range(H):
        for x in range(W):
            dy = (y + .5 - 28.5) / 13.5
            cx = 20.5 - 1.2 * dy
            rx = 9.4 * (1 + 0.10 * dy)
            e = 2.5 if dy < 0 else 2.0
            if abs((x + .5 - cx) / rx) ** e + abs(dy) ** e <= 1:
                s.set(x, y, Wt)
    s.ell(20, 37.5, 6, 3, (238, 236, 230), clip=(0, 37, W, 42))
    # wings: back wing small (left), front wing on the right
    s.ell(12, 34, 2.2, 5, X); s.ell(28, 33, 2.6, 5.5, X)
    s.line(28.5, 31, 27.5, 37, x_)
    # eyes and beak turned right
    if blink:                                                     # profile: only the near eye shows
        ceye(s, 25, 21, True)
    else:
        s.rect(25, 22, 27, 25, EYE); s.set(25, 22, HI)
    s.tri((29.5, 24.6), (29.5, 27.6), (33.2, 26.1), X)
    # capelet + badge
    s.ell(21, 33, 10.2, 4, P, clip=(0, 30, W, 39))
    for x in range(W):
        ys = [y for y in range(H) if s.get(x, y) == P]
        if ys:
            s.set(x, max(ys), Tr)
    medal(s, 22, 34)
    # tucked legs on the skis
    s.rect(17, 40, 19, 44, X); s.rect(23, 40, 25, 44, X)
    # skis: long, tips curled up to the right
    s.rect(4, 44, 36, 46, SK)
    s.rect(5, 44, 35, 45, sk)
    s.rect(36, 42, 38, 45, SK); s.set(38, 41, SK)
    s.finish()
    Cr = (132, 132, 142)
    for (x, y) in [(21, 15), (20, 14), (19, 13), (19, 12), (18, 11),
                   (22, 15), (22, 14), (22, 13), (22, 12), (23, 11), (23, 10),
                   (23, 15), (24, 14), (25, 13), (25, 12), (26, 11)]:
        s.set(x, y, Cr)
    return s


def anbo_side(frame=0, blink=False):
    """Anbo in profile facing right (STAGE 05 side-scroller). frame 0/1 = the two running strides, 2 = standing."""
    s = S()
    O, C = (232, 136, 48), (250, 236, 210)
    Pk, Od = (242, 202, 172), (204, 112, 38)
    J, j = (50, 52, 60), (78, 82, 92)
    R = (190, 98, 44)
    # curled shiba tail on the back
    s.ring(10.5, 25, 4.6, 2.6, O)
    s.ell(10.5, 25, 1.6, 1.6, C)
    # legs (drawn first so the jacket overlaps the hips)
    if frame == 0:
        s.line(22, 37, 28, 43, O, 3); s.rect(28, 42, 32, 45, C)       # front leg reaching forward
        s.line(16, 37, 11, 43, Od, 3); s.rect(8, 42, 12, 45, C)       # back leg pushing off
    elif frame == 1:
        s.line(22, 37, 24, 44, Od, 3); s.rect(23, 43, 27, 46, C)
        s.line(17, 37, 18, 44, O, 3); s.rect(17, 43, 21, 46, C)
    else:
        s.rect(15, 37, 18, 45, O); s.rect(21, 37, 24, 45, O)
        s.rect(15, 44, 19, 47, C); s.rect(21, 44, 25, 47, C)
    # back arm (behind the body)
    s.line(18, 28, 13 if frame == 0 else 24, 34, j, 3)
    # body in the blazer, cream chest showing at the front
    s.ell(19.5, 31, 7.5, 8, J)
    s.rect(23, 25, 27, 36, C)
    s.line(23, 25, 23, 36, j)
    s.rect(18, 24, 27, 26, R)                                       # collar
    # front arm swinging, paw at the end
    if frame == 0:
        s.line(20, 28, 26, 33, J, 3); s.rect(26, 32, 29, 35, O)
    elif frame == 1:
        s.line(20, 28, 15, 34, J, 3); s.rect(13, 33, 16, 36, O)
    else:
        s.line(19, 28, 19, 35, J, 3); s.rect(18, 35, 21, 38, O)
    # ears (far one peeks behind), head, muzzle
    s.tri((20, 8), (23.5, 0.5), (26.5, 7), Od)
    s.tri((13, 9), (15.5, 0.5), (20.5, 7), O)
    s.tri((14.8, 7.5), (15.8, 3), (18.8, 6.5), Pk)
    s.ell(20, 14.5, 9, 8.5, O)
    s.ell(27, 17.6, 3.8, 3.2, O)                                 # short muzzle
    for y in range(16, 24):                                         # cream cheek + lower muzzle
        for x in range(14, W):
            if s.get(x, y) == O and (y >= 18 or x >= 26):
                s.set(x, y, C)
    s.rect(30, 16, 32, 18, INK)                                     # nose
    ceye(s, 25, 11, blink)
    return s.finish()


def anje_ski_back():
    """Anje skiing away from the camera (STAGE 06 chase view): back of the egg body, capelet, long tail streaming
    back towards us, wings out holding poles, two orange ski tails under her feet."""
    s = S()
    Wt, w, P, Tr, Cr = (250, 249, 246), (224, 222, 216), (100, 84, 126), (128, 124, 120), (132, 132, 142)
    X, x_, SK, sk, PL = (54, 54, 58), (150, 150, 156), (240, 84, 22), (255, 150, 90), (90, 90, 100)
    # poles planted out to the sides
    s.line(8, 32, 3, 46, PL); s.line(32, 32, 37, 46, PL)
    s.rect(2, 46, 5, 47, PL); s.rect(35, 46, 38, 47, PL)
    for y in range(H):
        for x in range(W):
            dy = (y + .5 - 27.5) / 13.5
            rx = 9.4 * (1 + 0.10 * dy)
            e = 2.5 if dy < 0 else 2.0
            if abs((x + .5 - 20) / rx) ** e + abs(dy) ** e <= 1:
                s.set(x, y, Wt)
    s.ell(20, 20, 6, 4, w)                                  # soft shading on the back of the head
    s.ell(9.5, 32, 2.2, 4.5, X); s.ell(30.5, 32, 2.2, 4.5, X)    # wings out to the poles
    s.ell(20, 32, 10.3, 3.6, P, clip=(0, 29, W, 38))        # capelet
    for x in range(W):
        ys = [y for y in range(H) if s.get(x, y) == P]
        if ys:
            s.set(x, max(ys), Tr)
    s.rect(16, 40, 18, 44, X); s.rect(22, 40, 24, 44, X)     # legs
    s.rect(14, 43, 19, 48, SK); s.rect(21, 43, 26, 48, SK)   # ski tails
    s.rect(15, 43, 16, 48, sk); s.rect(22, 43, 23, 48, sk)
    s.line(20, 38, 20, 46, X, 2)                             # tail streaming back towards us
    s.line(20, 39, 20, 45, x_)
    s.finish()
    for (x, y) in [(19, 14), (18, 13), (17, 12), (17, 11), (16, 10),
                   (20, 14), (20, 13), (20, 12), (20, 11), (21, 10), (21, 9),
                   (21, 14), (22, 13), (23, 12), (23, 11), (24, 10)]:
        s.set(x, y, Cr)
    return s


CHARS = [
    ('owl', 'Owl', '貓頭鷹', '指揮棒・書本', owl),
    ('anji', 'Anji', '雪鴞', '小鼓', anji),
    ('anje', 'Anje', '銀喉長尾山雀', '月弧五鈴', anje),
    ('anbo', 'Anbo', '柴犬', '鈴鼓', anbo),
    ('ansey', 'Ansey', '俄羅斯藍貓', '小提琴', ansey),
    ('angoo', 'Angoo', '赤狐', '圍巾・蝴蝶結', angoo),
    ('anmi', 'Anmi', '水獺', '沙鈴', anmi),
    ('anka', 'Anka', '水豚', '烏克麗麗', anka),
    ('anzo', 'Anzo', '守宮', '拇指琴', anzo),
    ('anbi', 'Anbi', '白尾鹿', '三角鐵', anbi),
    ('anleo', 'Anleo', '亞洲雄獅', '手鼓', anleo),
]


def save(im, name, extra=False):
    if extra:
        im.save(os.path.join(OUTX, name + '.png'))
        return
    im.save(os.path.join(OUT1, name + '.png'))
    im.resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(OUT4, name + '.png'))


def main():
    for d in (OUT1, OUT4, OUTX, os.path.join(ROOT, 'preview')):
        os.makedirs(d, exist_ok=True)
    manifest = []
    for cid, name, sp, inst, fn in CHARS:
        save(fn().image(), cid)
        save(fn(blink=True).image(), cid + '_blink')
        manifest.append({'id': cid, 'name': name, 'species': sp, 'identity': inst, 'size': [W, H],
                         'files': {'idle': f'sprites/1x/{cid}.png', 'blink': f'sprites/1x/{cid}_blink.png',
                                   'idle4x': f'sprites/4x/{cid}.png', 'blink4x': f'sprites/4x/{cid}_blink.png'}})
    # extras used by the trailer video (back views, ski poses, paw, run frames, flag poses)
    save(anbo_back().image(), 'anbo_back', True)
    for cid, fn in DRIVERS:
        save(fn().image(), cid + '_back', True)
    save(anbo_paw().image(), 'anbo_paw', True)
    for k, nm in enumerate(['anbo_run_a', 'anbo_run_b', 'anbo_side']):
        save(anbo_side(k).image(), nm, True)
    save(anje_ski().image(), 'anje_ski', True)
    save(anje_ski(True).image(), 'anje_ski_blink', True)
    save(anje_ski_back().image(), 'anje_ski_back', True)
    save(owl(flag='up').image(), 'owl_flag_up', True)
    save(owl(flag='down').image(), 'owl_flag_down', True)
    with open(os.path.join(ROOT, 'characters.json'), 'w', encoding='utf-8') as f:
        json.dump({'grid': [W, H], 'anchor': 'bottom-center', 'outline': '#%02X%02X%02X' % INK, 'characters': manifest}, f, ensure_ascii=False, indent=2)

    # preview sheet
    Z = 6
    cols = 6
    cw, ch = W * Z + 30, H * Z + 90
    rows = math.ceil(len(CHARS) / cols)
    sheet = Image.new('RGB', (cols * cw + 30, rows * ch + 30), (245, 247, 252))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 24)
    small = ImageFont.truetype(FONT, 16)
    for i, (cid, name, sp, inst, fn) in enumerate(CHARS):
        x = 30 + (i % cols) * cw
        y = 30 + (i // cols) * ch
        im = Image.open(os.path.join(OUT1, cid + '.png')).resize((W * Z, H * Z), Image.NEAREST)
        sheet.paste(im, (x, y), im)
        d.text((x, y + H * Z + 8), f'{name} ({cid})', font=font, fill=(10, 20, 40))
        d.text((x, y + H * Z + 40), f'{sp}・{inst}', font=small, fill=(74, 94, 138))
    sheet.save(os.path.join(ROOT, 'preview', 'sheet.png'))
    print('ok', len(CHARS), 'characters')


if __name__ == '__main__':
    main()
