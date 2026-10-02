import { test, expect, type Page } from "@playwright/test";

async function cellClick(page: Page, x: number, y: number) {
  await page.locator("#field").scrollIntoViewIfNeeded();
  const point = await page.evaluate(
    ([x, y]) => (window as any).__defenseView.cell(x, y),
    [x, y],
  );
  await page.mouse.click(point.x, point.y);
}
async function snapshot(page: Page) {
  return page.evaluate(() => (window as any).__defenseView.snapshot());
}

test("3D picking: all plant types, occupied cells, entrance, resizing and touch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/defense.html");
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  await cellClick(page, 0, 0);
  await page.locator('[data-seed="ice"]').click();
  await cellClick(page, 7, 4);
  await page.locator('[data-seed="wall"]').click();
  await cellClick(page, 7, 0);
  await cellClick(page, 0, 4);
  expect(
    await page.evaluate(() =>
      (window as any).__defense.plants.map((p: any) => [p.x, p.y, p.kind]),
    ),
  ).toEqual([
    [0, 0, "shooter"],
    [7, 4, "ice"],
    [7, 0, "wall"],
    [0, 4, "wall"],
  ]);
  await cellClick(page, 8, 2);
  await expect(page.locator("#notice")).toContainText("怪物入口");
  await cellClick(page, 4, 0);
  await expect(page.locator("#notice")).toContainText("占用");
  await cellClick(page, 0, 0);
  await expect(page.locator("#notice")).toContainText("占用");
  const state = await snapshot(page);
  expect(state.renderer).toBe("three.js");
  expect(state.triangles).toBeGreaterThan(1000);
  expect(state.entities).toEqual({ log: 5, plant: 4 });
  // Scenery is instanced, not submitted as hundreds of individual draw calls.
  expect(state.calls).toBeLessThan(300);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "重來", exact: true }).click();
  await page.locator("#field").scrollIntoViewIfNeeded();
  const point = await page.evaluate(() =>
    (window as any).__defenseView.cell(1, 3),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await page.evaluate(() =>
      (window as any).__defense.plants.map((p: any) => [p.x, p.y]),
    ),
  ).toEqual([[1, 3]]);
  await page.setViewportSize({ width: 844, height: 390 });
  await cellClick(page, 6, 4);
  expect(
    await page.evaluate(() => (window as any).__defense.plants.at(-1).x),
  ).toBe(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("3D effects: blocker-aware previews, chain explosions, enemies, shots and restart cleanup", async ({
  page,
}) => {
  await page.goto("/defense.html");
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  // A deterministic visual fixture uses the normal engine APIs; no alternate rendering path.
  await page.evaluate(() => {
    const game = (window as any).__defense;
    game.move(1, 0); // (3, 2)
    game.bomb();
    game.update(0.05);
    game.update(0.05);
    game.update(0.05);
    game.update(0.05);
    game.move(1, 0); // (4, 2), two cells from a blocking log
    game.bomb();
    game.paused = true;
  });
  await expect.poll(async () => (await snapshot(page)).entities.bomb).toBe(2);
  const danger = (await snapshot(page)).dangerCells;
  expect(danger).toContainEqual({ x: 6, y: 2 });
  expect(danger).not.toContainEqual({ x: 7, y: 2 });
  await page.screenshot({
    path: "tests/evidence/defense-3d-bombs.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    const game = (window as any).__defense;
    game.explode(game.bombs[0]);
  });
  await expect
    .poll(async () => (await snapshot(page)).entities.flame ?? 0)
    .toBeGreaterThan(0);
  expect((await snapshot(page)).entities.bomb ?? 0).toBe(0);
  expect(await page.evaluate(() => (window as any).__defense.chains)).toBe(1);
  await page.screenshot({
    path: "tests/evidence/defense-3d-explosion.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "重來", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).entities)
    .toEqual({ log: 5 });
  const geometryCount = (await snapshot(page)).geometries;
  await page.evaluate(() => {
    const game = (window as any).__defense;
    game.plant(0, 0, "shooter");
    game.plant(0, 1, "ice");
    game.plant(2, 1, "wall");
    game.nextWave();
    for (let i = 0; i < 180; i++) game.update(1 / 60);
    game.paused = true;
  });
  await expect
    .poll(async () => (await snapshot(page)).entities.enemy ?? 0)
    .toBeGreaterThan(0);
  expect((await snapshot(page)).entities.plant).toBe(3);
  expect((await snapshot(page)).entities.shot).toBeGreaterThan(0);
  await page.screenshot({
    path: "tests/evidence/defense-3d-battle.png",
    fullPage: true,
  });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "重來", exact: true }).click();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await snapshot(page)).entities.bomb).toBe(1);
  }
  expect((await snapshot(page)).geometries).toBe(geometryCount);
});

test("3D defeat screen, new round, and WebGL context loss pause safely", async ({
  page,
}) => {
  await page.goto("/defense.html");
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  await page.evaluate(() => {
    const game = (window as any).__defense;
    for (let i = 0; i < 240 * 60 && game.active; i++) game.update(1 / 60);
  });
  await expect(
    page.getByRole("heading", { name: "再種一次希望。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "再守一場" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__defense.tree))
    .toBe(10);
  await page.evaluate(() => {
    const canvas = document.querySelector("#field") as HTMLCanvasElement;
    canvas
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await expect(
    page.getByRole("heading", { name: "森林畫面暫時中斷" }),
  ).toBeVisible();
  const elapsed = await page.evaluate(() => (window as any).__defense.elapsed);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__defense.elapsed)).toBe(
    elapsed,
  );
  await expect(
    page.getByRole("button", { name: "重來", exact: true }),
  ).toBeDisabled();
});

test("WebGL unavailable shows a recovery message instead of a blank board", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: any[]
    ) {
      if (type === "webgl2") return null;
      return original.apply(this, [type, ...args] as any);
    } as typeof original;
  });
  await page.goto("/defense.html");
  await expect(
    page.getByRole("heading", { name: "無法開啟立體森林" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重新載入" })).toBeVisible();
  await expect(page.locator("#cover-copy")).toContainText("WebGL 2");
});
