import { test, expect } from "@playwright/test";
import { collisionImpulse, shapes, wallLimit } from "../src/racing-collision";
import { vehicles } from "../src/racing-data";

const state = (page: any) =>
  page.evaluate(() => (window as any).__race.snapshot());

test("impact force depends on mass, relative speed and normal direction", () => {
  const light = collisionImpulse(30, 0, -1, 115, 195);
  const heavy = collisionImpulse(30, 0, -1, 195, 115);
  expect(30 - light.a).toBeGreaterThan(30 - heavy.a);
  expect(heavy.b).toBeGreaterThan(light.b);
  expect(collisionImpulse(10, 0, -1, 160, 160).impulse).toBeLessThan(
    collisionImpulse(30, 0, -1, 160, 160).impulse,
  );
  expect(collisionImpulse(10, 10, -1, 160, 160).impulse).toBe(0);
  expect(collisionImpulse(10, 20, -1, 160, 160).impulse).toBe(0);
  expect(light.a * 115 + light.b * 195).toBeCloseTo(30 * 115);
  expect(new Set(Object.values(vehicles).map((v) => v.mass)).size).toBe(4);
});

test("wall impact freezes forward travel, rebounds inward, blocks item use, recovers and resets", async ({
  page,
}) => {
  await page.goto("/race.html");
  await page.getByRole("button", { name: "上場比賽" }).waitFor();
  const result = await page.evaluate(async () => {
    const { RacingEngine } = await import("/src/racing-engine.ts");
    const { wallLimit, shapes } = await import("/src/racing-collision.ts");
    const make = (side: number) => {
      const g: any = new RacingEngine(
        document.createElement("canvas"),
        () => {},
      );
      g.destroy();
      g.phase = "racing";
      g.opponents = [];
      g.distance = 1200;
      g.speed = 3600;
      g.x = side * (wallLimit(shapes.kart) - 0.002);
      g.controls[side > 0 ? "right" : "left"] = true;
      return g;
    };
    return [-1, 1].map((side) => {
      const g = make(side);
      g.update(1 / 120);
      const impact = g.snapshot();
      g.item = true;
      g.setControl("item", true);
      g.setControl("item", false);
      for (let i = 0; i < 20; i++) g.update(1 / 120);
      const stopped = g.snapshot();
      g.controls.left = false;
      g.controls.right = false;
      for (let i = 0; i < 120; i++) g.update(1 / 120);
      return { side, impact, stopped, recovered: g.snapshot() };
    });
  });
  for (const r of result) {
    expect(r.impact.impactKind).toBe("wall");
    expect(r.impact.stun).toBeGreaterThan(0.28);
    expect(r.impact.speed).toBe(0);
    expect(Math.abs(r.impact.x)).toBeLessThanOrEqual(wallLimit(shapes.kart));
    expect(r.impact.lateralVelocity * r.side).toBeLessThan(0);
    expect(r.stopped.distance).toBe(r.impact.distance);
    expect(r.stopped.seconds).toBeGreaterThan(r.impact.seconds);
    expect(r.stopped.item).toBe(true);
    expect(r.stopped.boostsUsed).toBe(0);
    expect(r.recovered.stun).toBe(0);
    expect(r.recovered.speed).toBeGreaterThan(0);
  }
});

test("real keyboard wall crash displays sparks and stun stars; pause freezes recovery and restart clears it", async ({
  page,
}) => {
  await page.goto("/race.html");
  await page.getByRole("button", { name: "上場比賽" }).click();
  await expect
    .poll(async () => (await state(page)).speed)
    .toBeGreaterThan(1200);
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => (await state(page)).impactKind, {
      timeout: 10000,
      intervals: [20],
    })
    .toBe("wall");
  await page.keyboard.up("ArrowRight");
  const impact = await state(page);
  expect(impact.stun).toBeGreaterThan(0);
  expect(impact.speed).toBe(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__raceView.snapshot().cars[0].stunStars,
        ),
      { intervals: [10] },
    )
    .toBe(true);
  await page
    .locator(".race-stage")
    .screenshot({ path: "tests/evidence/race-wall-impact.png" });
  await page.keyboard.press("Escape");
  const frozen = await state(page);
  await page.waitForTimeout(180);
  expect((await state(page)).stun).toBe(frozen.stun);
  await page.getByRole("button", { name: "重新比賽", exact: true }).click();
  const reset = await state(page);
  expect(reset.stun).toBe(0);
  expect(reset.impactKind).toBe(null);
  expect(reset.lateralVelocity).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__raceView.snapshot().cars[0].stunStars,
      ),
    )
    .toBe(false);
});

test("engine side contacts give a lighter opponent more recoil and a larger impact reaction", async ({
  page,
}) => {
  await page.goto("/race.html");
  await page.getByRole("button", { name: "上場比賽" }).waitFor();
  const result = await page.evaluate(async () => {
    const { RacingEngine } = await import("/src/racing-engine.ts");
    const { entries } = await import("/src/racing-data.ts");
    return [1, 3].map((index) => {
      const g: any = new RacingEngine(
        document.createElement("canvas"),
        () => {},
      );
      g.destroy();
      g.phase = "racing";
      g.distance = 2000;
      g.x = -0.42;
      g.speed = 3000;
      g.controls.right = true;
      g.opponents = [
        {
          entry: entries[index],
          distance: 2000,
          x: 0,
          speed: 3000,
          finishTime: null,
        },
      ];
      for (let i = 0; i < 10; i++) {
        g.update(1 / 120);
        if (g.impactKind === "car") break;
      }
      return { player: g.snapshot(), opponent: g.opponents[0] };
    });
  });
  expect(result[0].player.impactKind).toBe("car");
  expect(result[1].player.impactKind).toBe("car");
  expect(result[1].opponent.lateralVelocity).toBeGreaterThan(
    result[0].opponent.lateralVelocity,
  );
  expect(result[1].opponent.impact).toBeGreaterThan(result[0].opponent.impact);
});
