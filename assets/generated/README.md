# 本里程碑的生成素材

產生方式：Codex 內建 `image_gen`，2026-10-02。沒有使用 CLI／外部付費 API，也沒有進行 Blender 建模。原輸出已複製到專案，遊戲不依賴使用者目錄中的生成檔案。

## Anbo 賽車八方向

檔案：`anbo-kart-eight-directions.png`。1774×887，RGBA 透明背景，4 欄×2 列的造型樣張。
參考圖：`assets/sprites/4x/anbo.png`（以原始 Anbo 身分與配色為準）。

順序：正面、右前、右側、右後、背面、左後、左側、左前。工坊以 CSS 裁切呈現，各方向皆已目視確認。這是視覺樣張；原圖尺寸並非整數格寬，尚不是精準切割完成的正式動畫圖集。

最終提示詞：

> Use case: stylized-concept. Asset type: game sprite turntable sheet, single unified asset. Create an eight-direction sprite sheet of Anbo (the exact orange and cream shiba inu mascot with charcoal jacket and golden collar clasp from reference image) driving one tiny forest-green and brass go-kart. Preserve pointed ears, cream muzzle, orange head, dark jacket, cheerful face. True crisp chunky pixel-art matching reference, restrained flat palette, dark brown outlines, no smooth gradients, no painterly texture, no text. Single sheet with exactly 4 columns and 2 rows, eight equal cells and generous transparent padding. Exactly one entire kart with seated Anbo per cell, same scale and fixed elevated camera pitch throughout. Rotate the entire kart and driver in the ground plane in 45-degree increments: top row left to right FRONT (kart nose toward viewer), FRONT-RIGHT (nose toward lower right), RIGHT (nose right), BACK-RIGHT (nose upper right); bottom row BACK (nose away), BACK-LEFT (nose upper left), LEFT (nose left), FRONT-LEFT (nose lower left). Rear views show back of orange ears and dark jacket. Front views show cream muzzle. All tires touch same baseline within each cell. Four black tires, green body, small brass front bumper consistently. Truly transparent background. No cast shadows crossing cells, no labels, no grid lines, no scenic background. This is an eight-angle visual sample for a game, coherence across angles is essential.

## 森林背景

檔案：`forest-background.png`。1536×1024，無透明背景。用作固定背景；平台、地面、機關、碰撞與角色由遊戲引擎另外繪製與處理，不使用圖片假裝可操作遊戲。

最終提示詞：

> Use case: stylized-concept. Asset type: background plate for a 2D side-scrolling pixel-art forest platform game, landscape 3:2 composition. A magical ancient woodland at morning: enormous dark teal tree trunks at outer edges, overlapping deep emerald leafy canopies along the top, pale mint sky and a luminous soft golden opening in the middle distance, layers of sage green distant pines and rounded bushes, tiny floating golden pollen, warm sunlight. Japanese 16-bit adventure game environment, genuinely crisp visible pixel clusters, limited palette, no blurry anti-aliased painted look, no text, no characters, no UI. Keep lower third quiet dark green undergrowth; gameplay ground and platforms will be drawn separately. Flat side view, peaceful welcoming storybook atmosphere, sophisticated rich forest color harmony, natural irregular composition, attractive detailed foliage silhouettes. Pixel sizes consistent as though designed at 480x320 logical pixels. This is a reusable scenic backdrop, not a screenshot or UI mockup.

## 賽車對手素材

檔案：`forest-rival-karts.png`，2172×724，透明 PNG。左至右為 Angoo／紅葉號、Anmi／蜂蜜號、Anje／微風號。以 `sprites/4x/angoo.png`、`anmi.png`、`anje.png` 作角色參照，由內建 imagegen 生成；遊戲從每個等寬區域讀取圖片。

最終提示詞：

> Use case: stylized-concept. Asset type: one transparent pixel-art racing game sprite sheet, 3 equally spaced columns in a SINGLE ROW. Exactly three separate go-karts viewed from DIRECTLY BEHIND, elevated 20 degree camera, identical scale, fully within their cells with transparent margins. Left cell: Angoo, the orange fox with teal scarf from reference 1, in a rust-red kart with brass bumper, pointed orange ears and fox tail behind seat. Middle cell: Anmi, the brown otter in teal outfit from reference 2, in a golden-yellow kart with brass bumper, round brown ears and otter tail. Right cell: Anje, the tiny fluffy white and gray long-tailed bird from reference 3, in a pale teal kart with brass bumper, fluffy round white head, gray back feathers and long narrow tail. Show BACKS of heads only, all noses of vehicles point straight AWAY from viewer, no side views, no front faces, no text, no labels, no grid lines. Cute toy proportions, four visible black chunky tires on each car, green forest kart racing universe, pixel art with chunky crisp edges, dark brown outlines, flat limited palette, no painterly gradients. Sprite sheet intended for 3 opponent karts in a retro pseudo-3D racing game. True transparent background. The three source images define character identity; retain their silhouettes and colors without inventing hats or helmets.

## 賽道沿途素材

檔案：`forest-race-props.png`，2172×724，透明 PNG。四個等寬區域包含冷杉、綠葉樹、金葉樹、樹樁，由內建 imagegen 生成。賽道本身由即時投影繪製，素材只作沿途物件。

最終提示詞：

> Use case: stylized-concept. Asset type: single pixel-art roadside prop sprite atlas for a retro forest kart racing game. Exactly 4 equally sized square cells arranged in a single horizontal row. Each cell contains one completely isolated full prop, front facing, centered with bottom contact point at same baseline, generous clear transparent gutters, no overlap. Cell 1: large lush dark emerald fir tree with irregular layered pixel-cluster canopy, visible small brown trunk. Cell 2: rounded fern-green deciduous forest tree with broad irregular crown and brown trunk, warm morning light. Cell 3: golden green autumn tree, rounded crown, small warm golden leaves, brown trunk. Cell 4: short broad tree stump obstacle with golden cut wood rings on top and textured brown bark. True transparent background, no ground, no shadows, no text, no grid lines. Beautiful crisp detailed 16-bit game pixel art, restrained forest palette, chunky pixels, strong silhouettes, hard pixel edges, no painted smooth gradients. This single sheet will be sliced in the browser to render billboards along a pseudo-3D race track. Same scale and consistent morning lighting.

生成結果的格子比例為長方形，遊戲採實際圖檔尺寸分成四個等寬區域，沒有假設提示詞中的正方形尺寸已被精準實現。圖片沒有覆蓋原有角色素材。
