"""Side-view running sprites for every Echo Forest mascot (forest adventure character select).

Each character faces right on the same 40x48 grid as the front sprites and reuses
the palette of its front view (see mascots.py). Three frames per character, matching
the original Anbo frames: run_a, run_b (two strides) and stand.

Run:  python3 tools/mascots/side.py
Out:  assets/sprites/side/<id>_run_a.png, <id>_run_b.png, <id>_stand.png
      (Anbo reuses mascots.anbo_side so it stays identical to the existing art.)
"""
import os
from PIL import Image
from mascots import S, W, H, INK, EYE, HI, BRONZE, BRONZE_D, SILVER, ceye, medal, anbo_side

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'sprites', 'side')
FRAMES = ['run_a', 'run_b', 'stand']


def dk(c, f=.8):
    return tuple(int(v * f) for v in c)


def legs(s, frame, front, foot, hip=37, back=None, t=3):
    """Same stride poses as anbo_side; only the hip height changes per character."""
    back = back or dk(front, .85)
    if frame == 0:
        s.line(16, hip, 11, 43, back, t); s.rect(8, 42, 12, 45, foot)
        s.line(22, hip, 28, 43, front, t); s.rect(28, 42, 32, 45, foot)
    elif frame == 1:
        s.line(22, hip, 24, 44, back, t); s.rect(23, 43, 27, 46, foot)
        s.line(17, hip, 18, 44, front, t); s.rect(17, 43, 21, 46, foot)
    else:
        s.rect(15, hip, 18, 45, front); s.rect(21, hip, 24, 45, front)
        s.rect(15, 44, 19, 47, foot); s.rect(21, 44, 25, 47, foot)


def back_arm(s, frame, c, sh=(18, 28)):
    s.line(sh[0], sh[1], 13 if frame == 0 else 24, sh[1] + 6, dk(c, .85), 3)


def front_arm(s, frame, c, paw, sh=(20, 28)):
    x, y = sh
    if frame == 0:
        s.line(x, y, x + 6, y + 5, c, 3); s.rect(x + 6, y + 4, x + 9, y + 7, paw)
        return (x + 7, y + 5)
    if frame == 1:
        s.line(x, y, x - 5, y + 6, c, 3); s.rect(x - 7, y + 5, x - 4, y + 8, paw)
        return (x - 6, y + 6)
    s.line(x - 1, y, x - 1, y + 7, c, 3); s.rect(x - 2, y + 7, x + 1, y + 10, paw)
    return (x - 1, y + 8)


def recolor(s, src, dst, test):
    for y in range(H):
        for x in range(W):
            if s.get(x, y) == src and test(x, y):
                s.set(x, y, dst)


# ------------------------------------------------------------------ characters

def owl_side(frame=2, blink=False):
    s = S()
    G, g, C = (146, 156, 124), (114, 124, 96), (238, 228, 204)
    V, T, Y = (56, 72, 66), (74, 112, 122), (214, 170, 60)
    N, O, Br = (96, 110, 118), (214, 160, 60), (86, 70, 58)
    s.tri((6, 30), (12, 26), (12, 36), g)                      # tail feathers
    legs(s, frame, O, O, hip=38, t=2)
    back_arm(s, frame, g)
    s.ell(19.5, 31, 9.5, 9.5, G)
    s.ell(20, 32, 8.5, 7.5, V, clip=(0, 25, W, 41))           # vest
    s.rect(24, 25, 28, 36, C)
    s.tri((25, 25), (25, 29), (28, 27), T)                     # bow tie
    s.set(25, 31, Y); s.set(25, 34, Y)
    medal(s, 19, 31)
    s.tri((12, 9), (13.5, 3), (19, 7), G)                    # ear tufts
    s.tri((19, 8), (22, 3), (24.5, 7), g)
    s.ell(20, 15.5, 10.5, 9.5, G)
    for (x, y) in [(14, 9), (17, 8), (12, 13), (15, 12)]:
        s.set(x, y, g)
    s.ell(27, 17, 5, 5.5, C)                                   # facial disc
    s.line(22, 11, 26, 10, Br)
    s.ring(27, 16.5, 3.7, 1, Y)
    ceye(s, 26, 15, blink, iris=(140, 90, 40))
    s.tri((30.5, 19), (34, 21), (30.5, 23), N)
    hx, hy = front_arm(s, frame, g, g)
    s.line(hx, hy, hx + 3, hy - 9, Y)                          # gold baton
    return s.finish()


def anji_side(frame=2, blink=False):
    s = S()
    Wt, w = (248, 247, 243), (200, 200, 198)
    H_, L = (92, 128, 156), (190, 140, 84)
    Dr, dr, Y = (58, 108, 150), (92, 144, 180), (232, 170, 50)
    legs(s, frame, (150, 150, 150), (150, 150, 150), hip=39, t=2)
    back_arm(s, frame, Wt)
    s.ell(19.5, 31, 9.5, 9.5, Wt)
    for (x, y) in [(13, 29), (15, 33), (12, 35), (17, 37)]:
        s.set(x, y, w)
    s.line(14, 24, 24, 31, H_, 2)                              # harness strap
    medal(s, 21, 29)
    # snare drum carried at the belly
    s.rect(22, 32, 31, 40, Dr)
    s.ell(26.5, 32, 4.5, 1.2, (240, 236, 228))
    s.rect(22, 33, 31, 34, SILVER); s.rect(22, 39, 31, 40, SILVER)
    for x in (24, 28):
        s.line(x, 34, x, 38, (176, 182, 188))
    s.set(26, 36, dr); s.set(30, 36, dr)
    s.tri((12, 9), (13.5, 3), (19, 7), Wt)
    s.tri((19, 8), (22, 3), (24.5, 7), w)
    s.ell(20, 15.5, 10.5, 9.5, Wt)
    for (x, y) in [(14, 9), (17, 8), (20, 7), (12, 13)]:
        s.set(x, y, w)
    s.ring(27, 16.5, 4, 1.3, INK)                              # black glasses
    s.line(18, 15, 23, 16, INK)
    ceye(s, 26, 15, blink, iris=Y)
    s.tri((30.5, 19), (33.5, 20.5), (30.5, 22.5), (64, 64, 68))
    hx, hy = front_arm(s, frame, Wt, Wt)
    s.line(hx, hy, hx + 4, hy - 6, (150, 104, 60)); s.set(hx + 4, hy - 7, L)  # drumstick
    return s.finish()


def anje_side(frame=2, blink=False):
    s = S()
    Wt, w = (250, 249, 246), (214, 212, 206)
    P, Tr = (100, 84, 126), (128, 124, 120)
    X, x_ = (54, 54, 58), (150, 150, 156)
    s.line(12, 37, 1, 43, X, 2); s.line(12, 36, 1, 42, x_)    # long tail streaming back
    legs(s, frame, X, X, hip=40, t=1)
    for y in range(H):                                          # egg body, slightly taller than wide
        for x in range(W):
            dy = (y + .5 - 27) / 13.5
            rx = 10 * (1 + 0.10 * dy)
            e = 2.5 if dy < 0 else 2.0
            if abs((x + .5 - 20) / rx) ** e + abs(dy) ** e <= 1:
                s.set(x, y, Wt)
    s.ell(19, 36, 7, 3, (238, 236, 230), clip=(0, 35, W, 41))
    s.ell(20, 31, 10.8, 4, P, clip=(0, 28, W, 37))            # capelet
    for x in range(W):
        ys = [y for y in range(H) if s.get(x, y) == P]
        if ys:
            s.set(x, max(ys), Tr)
    medal(s, 26, 32)
    # dark wing flapping with the stride
    wy = {0: 30, 1: 33, 2: 32}[frame]
    s.ell(16, wy, 4.5, 2.6, X); s.line(13, wy, 19, wy, x_)
    if blink:
        ceye(s, 23, 19, True)
    else:
        s.rect(24, 20, 26, 23, EYE); s.set(24, 20, HI)
    s.tri((29.5, 23), (32, 24), (29.5, 25.5), X)
    s.finish()
    Cr = (132, 132, 142)
    for (x, y) in [(19, 13), (18, 12), (17, 11), (17, 10), (16, 9),
                   (20, 13), (20, 12), (20, 11), (21, 10), (21, 9), (21, 8),
                   (21, 13), (22, 12), (23, 11), (23, 10), (24, 9)]:
        s.set(x, y, Cr)
    return s


def ansey_side(frame=2, blink=False):
    s = S()
    A, a = (116, 124, 140), (90, 98, 112)
    PK, GR = (176, 128, 128), (140, 192, 70)
    N, CU = (48, 54, 74), (192, 120, 62)
    V, v = (170, 88, 36), (120, 60, 26)
    s.line(13, 35, 6, 34, A, 2); s.line(6, 34, 4, 27, A, 2); s.set(5, 26, A)   # tail curling up
    legs(s, frame, N, A, hip=36)
    back_arm(s, frame, N)
    s.rect(14, 23, 25, 36, N)                                   # tailcoat
    s.ell(19.5, 24, 5.5, 2, N)
    s.tri((14, 33), (10, 41), (16, 38), N)                      # coat tail behind
    s.line(14, 34, 11, 40, CU)
    s.line(24, 23, 24, 35, CU); s.line(14, 35, 24, 35, CU)
    s.rect(21, 21, 25, 24, A)                                   # high collar
    medal(s, 20, 28)
    s.tri((12, 7), (14.5, 0.5), (18.5, 6), A)
    s.tri((13.6, 6), (14.8, 2.5), (17, 5.5), PK)
    s.tri((18, 7), (21.5, 0.5), (23.5, 6), a)
    s.ell(19.5, 12.5, 8.5, 7, A)
    s.tri((15, 13), (31, 14), (21, 21), A)                      # wedge muzzle
    s.ell(28.5, 16.5, 2.8, 2, (138, 146, 160))
    ceye(s, 24, 10, blink, iris=GR, pupil='slit')
    s.rect(30, 15, 32, 16, (122, 92, 100))
    s.set(28, 18, a); s.set(29, 18, a)
    hx, hy = front_arm(s, frame, N, A)
    # violin under the chin, bow in hand
    s.ell(25.5, 27, 3, 2.2, V); s.line(24, 27, 28, 26, v)
    s.line(28, 26, 31, 24, (80, 44, 22))
    s.line(hx, hy, hx + 3, hy - 5, (214, 180, 120))
    return s.finish()


def angoo_side(frame=2, blink=False):
    s = S()
    F, C = (236, 130, 42), (250, 238, 216)
    Br, T, t = (104, 62, 38), (32, 152, 160), (22, 118, 126)
    Ft = (214, 110, 34)
    for (cx, cy, r) in [(13, 36, 2.6), (9.5, 33.5, 3.4), (6.5, 30, 3.6), (5, 26, 3.2)]:  # big brush tail
        s.ell(cx, cy, r, r, Ft)
    s.ell(4.5, 23.5, 2.6, 2.3, C)
    legs(s, frame, F, Br, hip=38)
    back_arm(s, frame, F)
    s.ell(19.5, 32, 7, 7.5, F)
    s.ell(23, 33, 3, 4, C)
    s.ell(20, 25.5, 6.5, 2.4, T)                                # scarf wrap
    s.rect(14, 26, 18, 33, T); s.set(14, 33, t); s.set(16, 33, t)
    medal(s, 21, 28)
    s.tri((18, 8), (21.5, 0.5), (24, 7), dk(F, .85))
    s.tri((11, 9), (13, 0.5), (19, 6), F)
    s.tri((13, 7), (13.6, 3), (17, 6), C)
    s.tri((11.5, 4), (13, 0.5), (14.5, 3), Br)
    s.tri((9, 4), (9, 8), (12, 6), T); s.tri((15, 4), (15, 8), (12, 6), T); s.set(12, 6, t)  # bow
    s.ell(19.5, 14.5, 9, 8.5, F)
    s.tri((22, 12), (33, 17.5), (22, 21), F)                    # pointed muzzle
    recolor(s, F, C, lambda x, y: 18 <= y < 23 and 13 <= x)
    s.rect(31, 16, 34, 18, (70, 44, 30))
    ceye(s, 24, 11, blink, iris=(120, 66, 30))
    if not blink:
        s.set(27, 11, EYE)
    front_arm(s, frame, F, Br)
    return s.finish()


def anmi_side(frame=2, blink=False):
    s = S()
    B, b, C = (112, 78, 54), (86, 58, 40), (236, 220, 196)
    T, t, Or = (30, 150, 160), (22, 116, 124), (220, 104, 56)
    M, Wd = (228, 100, 54), (176, 116, 62)
    s.line(14, 37, 7, 40, B, 3); s.line(7, 40, 2, 41, B, 2)     # long tapered tail
    legs(s, frame, B, b, hip=38)
    back_arm(s, frame, B)
    s.ell(19.5, 32, 8, 8, B)
    s.ell(23, 35, 3.5, 4, C)
    s.ell(19.5, 29.5, 8, 5, T, clip=(0, 24, W, 35))            # sleeveless hoodie
    s.rect(12, 33, 27, 35, t)
    s.tri((22, 24), (28, 24), (26, 29), Or)                     # neckerchief
    medal(s, 19, 29)
    s.ell(15.5, 8.5, 2.4, 2.4, B); s.set(15, 8, b)
    s.ell(20, 15, 10, 8.5, B)
    s.ell(28, 18, 5, 3.6, C)                                    # round muzzle
    s.rect(31, 15, 34, 17, INK)
    for (x, y) in [(27, 20), (30, 20)]:
        s.set(x, y, (168, 136, 112))
    ceye(s, 24, 11, blink, iris=(92, 56, 30))
    hx, hy = front_arm(s, frame, B, B)
    s.line(hx, hy, hx + 2, hy - 5, Wd); s.ell(hx + 2.5, hy - 7.5, 2.2, 2.6, M)  # maraca
    s.rect(hx + 1, hy - 8, hx + 4, hy - 7, C)
    return s.finish()


def anka_side(frame=2, blink=False):
    s = S()
    Ca, Lt, Pw = (204, 142, 74), (226, 176, 112), (118, 84, 60)
    Nz, nz = (112, 90, 80), (78, 62, 56)
    Ol, ol, Kc = (118, 128, 74), (94, 104, 58), (214, 138, 52)
    U = (246, 224, 178)
    legs(s, frame, Ca, Pw, hip=40, t=4)
    back_arm(s, frame, Ca, sh=(17, 29))
    s.ell(19, 33, 11, 9, Ca)                                    # big pear body
    s.ell(23, 35, 6, 6, Lt)
    s.ell(15, 32, 6, 7.5, Ol, clip=(0, 24, 21, 42))            # knit vest
    for y in range(27, 40, 2):
        for x in (11, 14, 17):
            s.set(x, y, ol)
    s.ell(20, 24.5, 8, 2, Kc)
    medal(s, 18, 28)
    # long blocky capybara head, flat on top, square snout
    s.ell(15.5, 6, 2.2, 2.2, Ca); s.set(15, 6, (150, 100, 62))
    s.rect(12, 7, 31, 22, Ca)
    s.ell(12.5, 14.5, 3, 7.5, Ca)
    s.rect(31, 9, 33, 21, Ca)
    for (x, y) in [(12, 7), (32, 9), (32, 20), (12, 21)]:
        s.set(x, y, None)
    s.rect(28, 15, 34, 21, Nz)
    s.set(32, 15, nz); s.set(33, 16, nz)
    s.rect(30, 21, 32, 23, (252, 250, 240))                    # teeth
    s.line(22, 9, 26, 9, (140, 90, 52))
    if blink:
        s.rect(23, 12, 26, 13, EYE)
    else:
        s.rect(23, 11, 25, 14, EYE); s.set(23, 11, HI)
    hx, hy = front_arm(s, frame, Ca, Pw, sh=(21, 29))
    # ukulele hugged at the front
    s.ell(27, 34, 3.6, 3, (128, 84, 44)); s.ell(27, 34, 2.7, 2.2, U)
    s.line(29, 33, 35, 29, (112, 70, 36), 2)
    s.set(27, 34, (90, 60, 36))
    return s.finish()


def anzo_side(frame=2, blink=False):
    s = S()
    G, g, Bl = (128, 148, 86), (100, 118, 66), (216, 210, 160)
    Or, Am = (214, 134, 58), (232, 166, 46)
    Wd, wd = (140, 90, 48), (104, 64, 34)
    s.ring(7, 34, 4.5, 2.2, G, arc=(180, 110))                  # curled banded tail
    s.line(15, 39, 8, 39, G, 2)
    for (x, y) in [(10, 39), (3, 34), (7, 30)]:
        s.set(x, y, Or)
    legs(s, frame, G, G, hip=38)
    for x in (9, 12, 16, 20, 23, 26, 29, 31):
        if s.get(x, 45) == G or s.get(x, 46) == G:
            pass
    back_arm(s, frame, G)
    s.ell(19.5, 31, 6.5, 8.5, G)
    s.ell(22.5, 32, 3, 7, Bl)
    s.line(15, 23, 22, 26, BRONZE_D)
    medal(s, 21, 27)
    s.ell(21, 15, 11, 7, G)                                     # wide flat head
    s.ell(31, 17, 2.5, 3.5, G)
    s.ell(24, 11.5, 4, 4, G)                                    # eye bump on top
    if blink:
        ceye(s, 23, 10, True)
    else:
        s.ell(24.5, 12, 3, 3, Am)
        s.rect(21, 8, 28, 11, G)
        s.line(22, 11, 27, 11, EYE)
        s.rect(25, 12, 27, 15, EYE); s.set(25, 12, HI)
    for (x, y) in [(17, 7), (16, 8), (18, 8), (17, 9)]:
        s.set(x, y, Or)
    s.ell(25, 20, 8, 2.4, Bl, clip=(0, 19, W, H))               # cream jaw
    s.line(23, 19, 32, 19, INK); s.set(33, 18, INK)
    s.set(32, 15, g)
    hx, hy = front_arm(s, frame, G, Bl)
    s.ell(27, 32, 3.8, 4, Wd); s.ring(27, 32, 3.8, 1, wd)      # kalimba
    for x in (25, 27, 29):
        s.line(x, 29, x, 31, (226, 228, 232))
    return s.finish()


def anbi_side(frame=2, blink=False):
    s = S()
    D, C, Wt = (206, 124, 58), (246, 230, 206), (253, 251, 246)
    Hf, Bv, Er = (84, 56, 38), (118, 122, 146), (96, 64, 42)
    s.ell(11, 31, 2.4, 3.2, D); s.ell(10, 32, 1.5, 2.2, Wt)    # white flag tail
    legs(s, frame, D, Hf, hip=37, t=2)
    back_arm(s, frame, D)
    s.ell(19.5, 31, 6.5, 7.5, D)
    s.ell(23, 32, 2.5, 5, C)
    s.rect(14, 25, 21, 34, Bv)                                  # short vest
    s.set(16, 26, Wt); s.set(18, 30, Wt)
    medal(s, 18, 29)
    s.tri((9, 2), (16, 9), (19.5, 5), D)                        # big ears with dark tips
    s.tri((10.5, 3.2), (15.5, 8), (17.5, 5.5), C)
    s.tri((9, 2), (10.5, 4.5), (12, 3), Er)
    s.tri((18, 6), (26, 0.5), (24, 7), dk(D, .85))
    s.ell(20.5, 14.5, 8.5, 8, D)
    s.tri((23, 12), (33, 17), (23, 21), D)
    recolor(s, D, C, lambda x, y: 18 <= y < 23 and x >= 18)
    for (x, y) in [(16, 9), (19, 8), (14, 12), (17, 12)]:
        s.set(x, y, Wt)
    s.rect(31, 16, 34, 18, Hf)
    ceye(s, 24, 11, blink, iris=(120, 66, 30))
    if not blink:
        s.set(27, 11, EYE)
    hx, hy = front_arm(s, frame, D, Hf)
    s.line(hx, hy, hx + 1, hy + 3, (150, 150, 156))             # little triangle hanging from the hand
    s.line(hx + 1, hy + 3, hx - 2, hy + 8, SILVER); s.line(hx - 2, hy + 8, hx + 4, hy + 8, SILVER)
    s.line(hx + 4, hy + 8, hx + 2, hy + 5, SILVER)
    return s.finish()


def anleo_side(frame=2, blink=False):
    s = S()
    L, C = (214, 156, 72), (238, 216, 174)
    Mn, mn = (108, 67, 38), (84, 50, 28)
    Mr, St = (112, 46, 48), (124, 82, 42)
    Wd, Hd = (140, 92, 48), (234, 218, 186)
    s.line(13, 36, 5, 38, L); s.line(5, 38, 3, 34, L); s.ell(3, 32.5, 2, 2, Mn)   # tail tuft
    # djembe slung on the back hip
    s.rect(7, 30, 14, 39, Wd); s.ell(10.5, 30, 3.5, 1.3, Hd)
    for x in (8, 10, 12):
        s.line(x, 32, x, 37, (96, 60, 30))
    legs(s, frame, L, L, hip=38)
    back_arm(s, frame, L)
    s.ell(19.5, 32, 8.5, 8.5, L)
    s.ell(23, 34, 3.5, 5, C)
    s.rect(13, 25, 21, 37, Mr)                                  # maroon vest
    s.line(21, 25, 13, 36, St, 2)
    s.badge(17, 29)
    # mane behind the head
    s.ell(18, 14, 11, 11.5, Mn)
    import math
    for k in range(0, 360, 30):
        x = 18 + 11.5 * math.cos(math.radians(k)); y = 14 + 12 * math.sin(math.radians(k))
        if x < 26:
            s.ell(x, y, 1.6, 1.6, mn)
    s.ell(21, 4.5, 2.4, 2.4, L)
    s.ell(23, 14.5, 7.5, 7, L)
    s.ell(29, 17.5, 4, 3.2, C)
    s.tri((30.5, 14), (33.5, 14), (32.5, 16.5), (92, 56, 40))
    s.eye(25, 11, blink, 2, 3)
    s.rect(29, 20, 32, 21, (92, 56, 40))
    front_arm(s, frame, L, L)
    return s.finish()


SIDES = {
    'owl': owl_side, 'anji': anji_side, 'anje': anje_side, 'ansey': ansey_side,
    'angoo': angoo_side, 'anmi': anmi_side, 'anka': anka_side, 'anzo': anzo_side,
    'anbi': anbi_side, 'anleo': anleo_side,
}


def frame_image(cid, k, blink=False):
    if cid == 'anbo':
        return anbo_side(k, blink).image()
    return SIDES[cid](k, blink).image()


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = ['owl', 'anji', 'anje', 'anbo', 'ansey', 'angoo', 'anmi', 'anka', 'anzo', 'anbi', 'anleo']
    for cid in ids:
        for k, nm in enumerate(FRAMES):
            frame_image(cid, k).save(os.path.join(OUT, f'{cid}_{nm}.png'))
    print('ok', len(ids) * len(FRAMES), 'side frames ->', OUT)


if __name__ == '__main__':
    main()
