"""Social link preview cards (1200x630) for every page.

Codex draws text-free key art into assets/generated/og/<id>.png (calm left side, action on the right);
this crops it and lays the title on the left, writing public/og/<id>.jpg for the og:image tags.

    python3 tools/og/compose.py
"""
import glob
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC, OUT = ROOT / 'assets/generated/og', ROOT / 'public/og'
W, H = 1200, 630
GOLD, CREAM, MINT, SHADE = (244, 212, 128), (255, 241, 198), (190, 210, 185), (19, 45, 41)

CARDS = {
    'site': ('回聲森林遊樂場', 'Echo Forest', '六款森林小遊戲'),
    'adventure': ('森林音符冒險', 'Forest Note Adventure', '跳過樹樁，收集音符'),
    'race': ('森林賽車', 'Forest Race', '甩尾、加速，挑戰三圈'),
    'defense': ('森林爆破保衛戰', 'Bomb Defense', '種下守衛，守住生命樹'),
    'echo': ('森林回音', 'Forest Echo', '記住旋律，一起合奏'),
    'catch': ('音符接接樂', 'Note Catch', '接住金色音符'),
    'ski': ('雪林滑降', 'Snowy Forest Run', '穿過旗門，飛越跳台'),
}


def font(size: int, weight: int):
    # PingFang ships as a downloadable macOS asset; the Heiti fallback also covers Traditional Chinese.
    paths = glob.glob('/System/Library/AssetsV2/com_apple_MobileAsset_Font*/*/AssetData/PingFang.ttc')
    if paths:
        return ImageFont.truetype(paths[0], size, index=weight)  # 0 regular … 4 semibold
    return ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', size)


def cover(img: Image.Image) -> Image.Image:
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left, top = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((left, top, left + W, top + H))


def shade_left(img: Image.Image) -> Image.Image:
    # Darken the left side so the title reads on any art, fading out by 62% of the width.
    mask = Image.new('L', (W, 1))
    for x in range(W):
        t = min(1, x / (W * 0.62))
        mask.putpixel((x, 0), round(215 * (1 - t) ** 1.6))
    layer = Image.new('RGB', (W, H), SHADE)
    return Image.composite(layer, img, mask.resize((W, H)))


def card(key: str, title: str, english: str, tagline: str):
    img = shade_left(cover(Image.open(SRC / f'{key}.png').convert('RGB')))
    d = ImageDraw.Draw(img)
    x = 64
    d.text((x, 64), 'ECHO FOREST  回聲森林', font=font(24, 4), fill=GOLD)
    size = 84 if len(title) <= 5 else 72 if len(title) <= 6 else 64
    d.text((x, 214), title, font=font(size, 4), fill=CREAM, stroke_width=3, stroke_fill=SHADE, anchor='ls')
    d.text((x, 268), english, font=font(34, 4), fill=GOLD, stroke_width=2, stroke_fill=SHADE, anchor='ls')
    d.text((x, 540), tagline, font=font(28, 3), fill=MINT, stroke_width=2, stroke_fill=SHADE, anchor='ls')
    d.text((x, 580), 'ammosu.github.io/echo-forest-game', font=font(20, 0), fill=MINT, anchor='ls')
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / f'{key}.jpg', quality=88, optimize=True, progressive=True)


if __name__ == '__main__':
    for key, text in CARDS.items():
        if (SRC / f'{key}.png').exists():
            card(key, *text)
            print('wrote', OUT / f'{key}.jpg')
        else:
            print('missing art', SRC / f'{key}.png')
