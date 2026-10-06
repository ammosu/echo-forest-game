import { test, expect } from "@playwright/test";
import { DefenseEngine } from "../src/defense-engine";
const tick = (g: DefenseEngine, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) g.update(1 / 60);
};
test("engine: planting costs, occupancy, slowing and blocking enemies", () => {
  const g = new DefenseEngine();
  g.start();
  expect(g.plant(0, 0, "shooter")).toBe(true);
  expect(g.resources).toBe(140);
  expect(g.plant(0, 0, "ice")).toBe(false);
  expect(g.plant(4, 0, "wall")).toBe(false);
  expect(g.plant(8, 0, "wall")).toBe(false);
  g.resources = 0;
  expect(g.plant(1, 0, "wall")).toBe(false);
  tick(g, 3.1);
  expect(g.resources).toBe(15);
  const h = new DefenseEngine();
  h.start();
  h.plant(0, 0, "ice");
  h.plant(2, 0, "wall");
  h.enemies.push({
    x: 2.5,
    y: 0,
    kind: 2,
    hp: 200,
    maxHp: 200,
    slow: 0,
    attack: 0,
  });
  tick(h, 1);
  expect(h.enemies[0].slow).toBeGreaterThan(0);
  expect(h.enemies[0].x).toBe(2.5);
  expect(h.plants[1].hp).toBeLessThan(260);
});
test("engine: chain reactions, obstacle rewards, escape, friendly plants and damage", () => {
  const g = new DefenseEngine();
  g.start();
  g.plant(2, 2, "shooter");
  g.bomb();
  g.move(1, 0);
  tick(g, 0.16);
  g.bomb();
  g.move(0, -1);
  tick(g, 0.16);
  g.move(1, 0);
  tick(g, 2);
  expect(g.chains).toBe(1);
  expect(g.bombs).toHaveLength(0);
  expect(g.hearts).toBe(3);
  expect(g.plants).toHaveLength(1);
  const h = new DefenseEngine();
  h.start();
  h.player = { x: 3, y: 0, invincible: 0 };
  h.bomb();
  tick(h, 2.1);
  expect(h.hearts).toBe(2);
  expect(h.logs.some((l) => l.x === 4 && l.y === 0)).toBe(false);
  expect(h.resources).toBe(200);
  expect(h.flames.some((f) => f.x === 5 && f.y === 0)).toBe(false);
  h.paused = true;
  const t = h.elapsed;
  tick(h, 3);
  expect(h.elapsed).toBe(t);
});
test("engine: all five waves are winnable with earned resources, failure and reset", () => {
  const g = new DefenseEngine();
  g.start();
  let iterations = 0;
  const kinds = new Set<number>();
  while (g.active && iterations++ < 240 * 60) {
    for (let y = 0; y < 5; y++)
      if (!g.plants.some((p) => p.x === 0 && p.y === y))
        g.plant(0, y, "shooter");
    if (g.plants.filter((p) => p.x === 0).length === 5) {
      for (let y = 0; y < 5; y++)
        if (!g.plants.some((p) => p.x === 1 && p.y === y)) g.plant(1, y, "ice");
    }
    if (g.plants.filter((p) => p.x === 1).length === 5) {
      for (let y = 0; y < 5; y++)
        if (!g.plants.some((p) => p.x === 2 && p.y === y))
          g.plant(2, y, "shooter");
    }
    g.enemies.forEach((e) => kinds.add(e.kind));
    g.update(1 / 60);
  }
  expect(g.phase).toBe("won");
  expect(g.wave).toBe(5);
  expect(g.kills).toBe(65);
  expect([...kinds].sort()).toEqual([0, 1, 2]);
  expect(g.elapsed).toBeLessThan(240);
  const h = new DefenseEngine();
  h.start();
  tick(h, 240);
  expect(h.phase).toBe("lost");
  h.start();
  expect(h.tree).toBe(10);
  expect(h.score).toBe(0);
  expect(h.wave).toBe(0);
  expect(h.enemies).toHaveLength(0);
});
test("desktop: navigation, keyboard planting and bombing, pause and restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: "爆破保衛戰", exact: true }).click();
  await page.screenshot({
    path: "tests/evidence/defense-welcome.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).__defense.plants.length))
    .toBe(1);
  await page.keyboard.press("Space");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(190);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(350);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.press("Escape");
  const t = await page.evaluate(() => (window as any).__defense.elapsed);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__defense.elapsed)).toBe(t);
  await page.getByRole("button", { name: "繼續守護" }).click();
  await page.waitForTimeout(2100);
  expect(await page.evaluate(() => (window as any).__defense.hearts)).toBe(3);
  await page.getByRole("button", { name: "提前迎戰" }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({
    path: "tests/evidence/defense-playing.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "重來", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__defense.wave)).toBe(0);
  expect(errors).toEqual([]);
});
test("desktop: fast-forward runs the battle at double speed and is remembered", async ({
  page,
}) => {
  await page.goto("/defense.html");
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  const rate = async () => {
    const a = await page.evaluate(() => (window as any).__defense.elapsed);
    await page.waitForTimeout(1000);
    return (await page.evaluate(() => (window as any).__defense.elapsed)) - a;
  };
  const normal = await rate();
  await page.keyboard.press("KeyF");
  await expect(page.locator("#speed")).toHaveAttribute("aria-pressed", "true");
  const fast = await rate();
  expect(fast / normal).toBeGreaterThan(1.6);
  await page.reload();
  await expect(page.locator("#speed-name")).toHaveText("×2");
  await page.locator("#speed").click();
  await expect(page.locator("#speed-name")).toHaveText("×1");
});

test("mobile: seeds, board placement, touch movement and bomb button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/defense.html");
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  await page.locator('[data-seed="wall"]').click();
  await page.locator("#field").scrollIntoViewIfNeeded();
  const cell = await page.evaluate(() =>
    (window as any).__defenseView.cell(0, 0),
  );
  await page.mouse.click(cell.x, cell.y);
  expect(
    await page.evaluate(() => (window as any).__defense.plants[0].kind),
  ).toBe("wall");
  await page.getByRole("button", { name: "向上移動" }).scrollIntoViewIfNeeded();
  const up = (await page
    .getByRole("button", { name: "向上移動" })
    .boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: up.x + 20, y: up.y + 20 }],
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__defense.player.y))
    .toBeLessThan(2);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await page.evaluate(() => (window as any).__defense.player.y),
  ).toBeLessThan(2);
  await page.getByRole("button", { name: "放炸彈" }).click();
  expect(
    await page.evaluate(() => (window as any).__defense.bombs.length),
  ).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__defenseView.snapshot().entities.bomb,
      ),
    )
    .toBe(1);
  await page.screenshot({
    path: "tests/evidence/defense-mobile.png",
    fullPage: true,
  });
});
test("browser: earned-resource five-wave playthrough renders result and persists best score", async ({
  page,
}) => {
  await page.goto("/defense.html");
  await page.getByRole("button", { name: "開始守護", exact: true }).click();
  const result = await page.evaluate(() => {
    const g = (window as any).__defense;
    let n = 0;
    while (g.active && n++ < 240 * 60) {
      for (let y = 0; y < 5; y++)
        if (!g.plants.some((p: any) => p.x === 0 && p.y === y))
          g.plant(0, y, "shooter");
      if (g.plants.filter((p: any) => p.x === 0).length === 5)
        for (let y = 0; y < 5; y++)
          if (!g.plants.some((p: any) => p.x === 1 && p.y === y))
            g.plant(1, y, "ice");
      if (g.plants.filter((p: any) => p.x === 1).length === 5)
        for (let y = 0; y < 5; y++)
          if (!g.plants.some((p: any) => p.x === 2 && p.y === y))
            g.plant(2, y, "shooter");
      g.update(1 / 60);
    }
    return { phase: g.phase, score: g.score, elapsed: g.elapsed };
  });
  expect(result.phase).toBe("won");
  await expect(
    page.getByRole("heading", { name: "森林，由你守住了。" }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/evidence/defense-completed.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() =>
      Number(localStorage.getItem("echo-defense-best")),
    ),
  ).toBe(result.score);
  await page.getByRole("button", { name: "再守一場" }).click();
  expect(await page.evaluate(() => (window as any).__defense.phase)).toBe(
    "build",
  );
  await page.reload();
  await expect(page.locator("#best")).toHaveText(result.score.toLocaleString());
});
