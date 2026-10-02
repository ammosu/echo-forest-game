# Echo Forest 像素吉祥物（數讀房市）

數讀房市 11 位吉祥物的像素圖素材包，跟宣傳影片「數據玩家」裡使用的是同一套圖。內含可以直接放上網站的 PNG、角色清單 JSON、網頁示範，以及重新產生圖片的程式。

開啟 `demo/index.html` 可以直接在瀏覽器看到全部角色，以及眨眼和待機彈跳的效果。

![全員預覽](preview/sheet.png)

---

## 資料夾結構

```
pixel-mascots/
├── README.md              本說明
├── characters.json        角色清單（id、名稱、物種、識別物、檔案路徑）
├── sprites/
│   ├── 1x/                原尺寸 40×48 PNG（透明背景），每隻 2 張：<id>.png、<id>_blink.png
│   ├── 4x/                放大 4 倍的 160×192 PNG，不能用 CSS 放大時才用
│   └── extras/            影片用的特殊姿勢（背面、滑雪、肉球手、跑步等），網站通常用不到
├── demo/index.html        網頁示範：整數倍縮放、眨眼、待機彈跳
├── preview/sheet.png      全員預覽圖
├── generator/mascots.py   產生所有圖片的程式（Python）
└── fonts/                 俐方體 11 號（只在產生預覽圖的名字時用到）＋授權檔
```

## 角色一覽

| id | 名稱 | 物種 | 識別物／樂器 |
|---|---|---|---|
| `owl` | Owl | 貓頭鷹 | 指揮棒・書本 |
| `anji` | Anji | 雪鴞 | 小鼓 |
| `anje` | Anje | 銀喉長尾山雀 | 月弧五鈴 |
| `anbo` | Anbo | 柴犬 | 鈴鼓 |
| `ansey` | Ansey | 俄羅斯藍貓 | 小提琴 |
| `angoo` | Angoo | 赤狐 | 圍巾・蝴蝶結（目前沒有固定樂器） |
| `anmi` | Anmi | 水獺 | 沙鈴 |
| `anka` | Anka | 水豚 | 烏克麗麗 |
| `anzo` | Anzo | 守宮 | 拇指琴（見下方「角色設定注意」） |
| `anbi` | Anbi | 白尾鹿 | 三角鐵 |
| `anleo` | Anleo | 亞洲雄獅 | 手鼓 |

## 圖片規格

| 項目 | 規格 |
|---|---|
| 原尺寸 | 40 × 48 px，RGBA，透明背景 |
| 定位點 | **底部中央**：角色的腳踩在圖片最下緣的中間，排成一列時對齊圖片底邊即可 |
| 外框色 | `#261E1A` |
| 每隻角色 | 待機圖 `<id>.png`、眨眼圖 `<id>_blink.png` |
| 檔案大小 | 1x 全部 22 張合計約 24 KB |

## 在網頁上使用

### 1. 一定要用「整數倍」並關閉平滑化

像素圖放大時，瀏覽器預設會把它弄糊，所以要加上 `image-rendering: pixelated`。另外只能用整數倍（2、3、4…）放大：用 2.5 倍這種非整數倍，像素方塊會大小不一。

```html
<img class="mascot" src="/mascots/anbo.png" alt="Anbo（柴犬）" width="40" height="48">
```

```css
.mascot {
  width: 120px;              /* 40 × 3 */
  height: 144px;             /* 48 × 3 */
  image-rendering: pixelated;
}
```

在響應式版面中，請在各個斷點分別指定整數倍（例如手機 2 倍、桌機 3 倍），不要用百分比寬度。

### 2. 眨眼（選用）

每隔約 3.3 秒把圖片換成 `_blink` 圖 0.16 秒；每隻角色的起始時間錯開，就不會同時眨眼。

```js
function blink(img, id, offsetMs = 0) {
  const idle = `/mascots/${id}.png`, closed = `/mascots/${id}_blink.png`;
  new Image().src = closed;                                   // 先預載，避免第一次眨眼閃白
  const once = () => { img.src = closed; setTimeout(() => (img.src = idle), 160); };
  setTimeout(() => { once(); setInterval(once, 3300); }, offsetMs);
}
```

### 3. 待機彈跳（選用）

影片裡的角色會以兩格動畫上下跳一個像素：

```css
.mascot { animation: mascot-bob 0.5s steps(1) infinite; }
@keyframes mascot-bob { 50% { transform: translateY(-3px); } }   /* 3 = 縮放倍數 */
@media (prefers-reduced-motion: reduce) { .mascot { animation: none; } }
```

### 4. React 範例

```jsx
export function Mascot({ id, name, scale = 3 }) {
  return (
    <img
      src={`/mascots/${id}.png`}
      alt={name}
      width={40 * scale}
      height={48 * scale}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
```

完整寫法可以參考 `demo/index.html`。角色清單可以直接讀 `characters.json`，不必在程式裡寫死。

## 修改或重新產生圖片

所有圖片都是 `generator/mascots.py` 用程式畫出來的。每隻角色有一個同名的函式，例如 `anbo()`、`anzo()`，在 40×48 的格子上用以下基本形狀組成：

| 方法 | 用途 |
|---|---|
| `s.rect(x0, y0, x1, y1, 顏色)` | 矩形 |
| `s.ell(cx, cy, rx, ry, 顏色)` | 橢圓 |
| `s.tri(p1, p2, p3, 顏色)` | 三角形 |
| `s.line(x0, y0, x1, y1, 顏色, 粗細)` | 線條 |
| `s.ring(cx, cy, r, 粗細, 顏色)` | 圓環 |
| `s.set(x, y, 顏色)` | 單一像素 |
| `s.finish()` | 統一加上右下邊緣陰影和深色外框（每隻角色最後都會呼叫） |

改完後重新執行，所有 PNG、`characters.json` 和預覽圖都會一起更新：

```bash
pip install Pillow          # 需要 Python 3.8 以上
python generator/mascots.py
```

## 角色設定注意

- 角色的造型、配色、服裝、徽章和樂器，以公司的 Character Bible（`mascot-concepts-latest-2026-08-13`）為準。
- **Anji、Anje、Ansey 的個性與背景在官方設定中「待定」**。依官方規範，網站上不要自行補寫這三位的個性介紹。目前可以使用的官方定位：Anji 是「鼓手」、Anje 是「月弧五鈴演奏者」、Ansey 是「小提琴手」。
- **Anzo 的樂器**：官方資料總表寫「回聲拇指琴」，宣傳影片依指示寫「拇指琴」。網站要用哪個名稱，請依官方決定。

## 授權

- 角色造型屬數讀房市所有，僅限公司產品與宣傳使用。
- `fonts/` 裡的俐方體 11 號是 SIL Open Font License（開源、可商用），只在產生預覽圖上的名字時用到，網站顯示角色不需要這個字型。授權全文見 `fonts/OFL.txt`。
