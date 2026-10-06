import { driveUntil } from "./race-driver";
import { test, expect, type Page } from "@playwright/test";
import type { RaceSnapshot } from "../src/racing-engine";
const state = (page: Page): Promise<RaceSnapshot> =>
  page.evaluate(() => (window as any).__race.snapshot());
async function ready(page: Page) {
  await page.goto("/race.html");
  await page.getByRole("button", { name: "上場比賽" }).waitFor();
}
async function start(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "上場比賽" }).click();
  await expect
    .poll(async () => (await state(page)).phase, { timeout: 6000 })
    .toBe("racing");
}

test("kart workshop lives on the race page and pauses then resumes the race", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: /賽車工坊/ }).click();
  await expect(page.locator("#kart-dialog")).toBeVisible();
  expect((await state(page)).paused).toBe(true);
  for (const view of ["正面", "右前", "右側", "右後", "背面", "左後", "左側", "左前"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator("#direction-label")).toHaveText(view);
    await expect(page.getByRole("button", { name: view, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kart-large")).toHaveAttribute("aria-label", `安寶賽車${view}`);
  }
  const imageUrl = await page.locator(".workshop-note a[download]").getAttribute("href");
  expect((await page.request.get(imageUrl!)).ok()).toBe(true);
  await page.screenshot({ path: "tests/evidence/kart-eight-directions.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.locator("#kart-dialog")).not.toBeVisible();
  await expect.poll(async () => (await state(page)).paused).toBe(false);
});

test("race entry links, countdown, assets and pause/resume are usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: "森林賽車", exact: true }).click();
  await expect(page).toHaveURL(/race.html/);
  await page.getByRole("button", { name: "上場比賽" }).click();
  expect((await state(page)).phase).toBe("countdown");
  await page.waitForTimeout(900);
  expect((await state(page)).distance).toBe(0);
  await page.keyboard.press("Escape");
  const paused = await state(page);
  await page.waitForTimeout(300);
  expect((await state(page)).countdown).toBe(paused.countdown);
  await page.getByRole("button", { name: "繼續比賽 →", exact: true }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("racing");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  const s = await state(page);
  await page.waitForTimeout(400);
  const after = await state(page);
  expect(after.seconds).toBe(s.seconds);
  expect(after.distance).toBe(s.distance);
  expect(after.opponents).toEqual(s.opponents);
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await state(page)).seconds)
    .toBeGreaterThan(s.seconds);
  expect(
    await page
      .locator(".race-entry img")
      .evaluateAll((images) =>
        images.every((i) => i.complete && i.naturalWidth),
      ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("item pickup, real corner drift boost, offroad slowdown and braking", async ({
  page,
}) => {
  await start(page);
  await driveUntil(page, (s) => s.item);
  await driveUntil(page, (s) => s.distance > 8200);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("Space");
  await expect
    .poll(async () => (await state(page)).driftCharge, {
      timeout: 5000,
      intervals: [25],
    })
    .toBeGreaterThan(0.65);
  const drifting = await state(page);
  expect(drifting.drifting).toBe(true);
  expect(drifting.driftCharge).toBeGreaterThan(0.65);
  await page.keyboard.up("Space");
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => (await state(page)).driftBoosts).toBe(1);
  expect((await state(page)).boost).toBeGreaterThan(0);
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await state(page)).boostsUsed).toBe(1);
  expect((await state(page)).item).toBe(false);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(2200);
  await page.keyboard.up("ArrowLeft");
  expect((await state(page)).offroad).toBe(true);
  await expect.poll(async () => (await state(page)).speed).toBeLessThan(1800);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(650);
  expect((await state(page)).speed).toBeLessThan(10);
  await page.keyboard.up("ArrowDown");
  await page.getByRole("button", { name: "重新比賽", exact: true }).click();
  const reset = await state(page);
  expect(reset.phase).toBe("countdown");
  expect(reset.distance).toBe(0);
  expect(reset.item).toBe(false);
  expect(reset.driftBoosts).toBe(0);
  expect(reset.lapTimes).toEqual([]);
});
test("race three real laps with opponents, checkpoints, items and saved timing", async ({
  page,
}) => {
  test.setTimeout(100000);
  await start(page);
  let left = false,
    right = false;
  const startAt = Date.now(),
    seenLaps = new Set<number>();
  while (Date.now() - startAt < 85000) {
    const s = await state(page);
    seenLaps.add(s.lap);
    if (s.phase === "finished") break;
    // A feedback driver sends normal keys only; it cannot alter position, laps or time.
    let target = 0;
    const z = s.distance % 48000;
    for (const obstacle of [
      { z: 13200, x: 0.92 },
      { z: 22400, x: -0.92 },
      { z: 33300, x: 0.92 },
      { z: 45200, x: -0.92 },
    ]) {
      if (obstacle.z - z > 0 && obstacle.z - z < 1700)
        target = obstacle.x > 0 ? -0.15 : 0.2;
    }
    const desired = s.curve * 0.22 * (s.speed / 3600) ** 2 + (target - s.x) * 5;
    const r = desired > 0.25,
      l = desired < -0.25;
    if (r !== right) {
      await page.keyboard[r ? "down" : "up"]("ArrowRight");
      right = r;
    }
    if (l !== left) {
      await page.keyboard[l ? "down" : "up"]("ArrowLeft");
      left = l;
    }
    if (s.item) await page.keyboard.press("KeyE");
    await page.waitForTimeout(40);
  }
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowLeft");
  const s = await state(page);
  expect(s.phase).toBe("finished");
  expect(s.distance).toBe(144000);
  expect(s.checkpoints).toBe(12);
  expect([...seenLaps].sort()).toEqual([1, 2, 3]);
  expect(s.lapTimes).toHaveLength(3);
  expect(s.lapTimes.reduce((a, b) => a + b, 0)).toBeCloseTo(s.seconds, 3);
  expect(s.boostsUsed).toBeGreaterThan(0);
  expect(s.opponents.every((o) => o.distance > 0)).toBe(true);
  expect(s.position).toBe(1 + s.opponents.filter((o) => o.finished).length);
  await expect(page.locator(".finish-standings li")).toHaveCount(4);
  await expect(page.locator(".lap-splits span")).toHaveCount(3);
  expect(
    await page.evaluate(() =>
      Number(localStorage.getItem("echo-forest-race-best-v1")),
    ),
  ).toBeCloseTo(s.seconds, 3);
  await page.screenshot({
    path: "tests/evidence/race-completed.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "再比一場" }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("countdown");
  expect((await state(page)).lap).toBe(1);
});
test("manual throttle and tab blur do not leave the vehicle accelerating", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("自動油門").uncheck();
  await page.getByRole("button", { name: "上場比賽" }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("racing");
  await page.waitForTimeout(350);
  expect((await state(page)).speed).toBe(0);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(700);
  expect((await state(page)).speed).toBeGreaterThan(900);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const s = await state(page);
  expect(s.paused).toBe(true);
  await page.keyboard.up("ArrowUp");
  await page.getByRole("button", { name: "繼續比賽 →", exact: true }).click();
  await expect.poll(async () => (await state(page)).speed).toBe(0);
});
test("mobile real multitouch steering and drift, cancellation and landscape layout", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await start(page);
  const right = page.getByRole("slider", { name: "方向搖桿", exact: true }),
    drift = page.getByRole("button", { name: "甩尾", exact: true });
  await right.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const rb = (await right.boundingBox())!,
    db = (await drift.boundingBox())!,
    cdp = await context.newCDPSession(page);
  const touches = [
    { x: rb.x + rb.width * 0.92, y: rb.y + rb.height / 2, id: 1 },
    { x: db.x + db.width / 2, y: db.y + db.height / 2, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touches,
  });
  await page.waitForTimeout(380);
  expect((await state(page)).x).toBeGreaterThan(0);
  expect((await state(page)).drifting).toBe(true);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect.poll(async () => (await state(page)).drifting).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "tests/evidence/race-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("button", { name: "暫停比賽", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "繼續比賽 →", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "tests/evidence/race-landscape.png",
    fullPage: true,
  });
  await context.close();
});
