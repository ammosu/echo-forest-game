import { driveUntil } from "./race-driver";
import { test, expect, type Page } from "@playwright/test";
import {
  sweepContact,
  separation,
  shapes,
  signedGap,
  kartBounds,
} from "../src/racing-collision";

const state = (page: Page) =>
  page.evaluate(() => (window as any).__race.snapshot());
const view = (page: Page) =>
  page.evaluate(() => (window as any).__raceView.snapshot());
const ready = async (page: Page) => {
  await page.goto("/race.html");
  await expect(page.getByRole("button", { name: "上場比賽" })).toBeEnabled();
};

test("collision sweep: high-speed crossing, exact misses, side-entry, lap seam and moving cars", () => {
  const fixed = { distance: 1000, x: 0 };
  const extent = separation(shapes.kart, shapes.stump);
  expect(
    sweepContact(
      { distance: 0, x: 0 },
      { distance: 2000, x: 0 },
      fixed,
      fixed,
      shapes.kart,
      shapes.stump,
    )?.axis,
  ).toBe("z");
  expect(
    sweepContact(
      { distance: 0, x: extent.x + 0.001 },
      { distance: 2000, x: extent.x + 0.001 },
      fixed,
      fixed,
      shapes.kart,
      shapes.stump,
    ),
  ).toBeNull();
  expect(
    sweepContact(
      { distance: 1000, x: -1 },
      { distance: 1000, x: 1 },
      fixed,
      fixed,
      shapes.kart,
      shapes.stump,
    )?.axis,
  ).toBe("x");
  expect(
    sweepContact(
      { distance: 47000, x: 0 },
      { distance: 49000, x: 0 },
      { distance: 0, x: 0 },
      { distance: 0, x: 0 },
      shapes.kart,
      shapes.kart,
    ),
  ).not.toBeNull();
  expect(
    sweepContact(
      { distance: 100, x: 0 },
      { distance: 1000, x: 0 },
      { distance: 600, x: 0 },
      { distance: 700, x: 0 },
      shapes.kart,
      shapes.kart,
    ),
  ).not.toBeNull();
  expect(
    sweepContact(
      { distance: 100, x: 0 },
      { distance: 200, x: 0 },
      { distance: 600, x: 0 },
      { distance: 700, x: 0 },
      shapes.kart,
      shapes.kart,
    ),
  ).toBeNull();
  expect(
    sweepContact(
      { distance: 1000 - extent.z, x: 0 },
      { distance: 900 - extent.z, x: 0 },
      fixed,
      fixed,
      shapes.kart,
      shapes.stump,
    ),
  ).toBeNull();
  expect(kartBounds(0.3).width).toBeGreaterThan(shapes.kart.width);
  expect(signedGap(48020, 47980)).toBe(40);
});

test("engine fixtures: solid obstacles, escape steering, all pickups/pads and no duplicate rewards", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { RacingEngine } = await import("/src/racing-engine.ts");
    const { obstacles, itemBoxes, boostPads } = await import(
      "/src/racing-data.ts"
    );
    const { separation, shapes } = await import("/src/racing-collision.ts");
    const make = () => {
      const g: any = new RacingEngine(
        document.createElement("canvas"),
        () => {},
      );
      g.destroy();
      g.phase = "racing";
      g.opponents = [];
      return g;
    };
    const tick = (g: any, n: number) => {
      for (let i = 0; i < n; i++) g.update(1 / 120);
    };
    const crashes = obstacles.map((p: any) => {
      const g = make();
      g.distance = p.z - 300;
      g.x = p.x;
      g.speed = 4800;
      g.boost = 1;
      tick(g, 40);
      const stopped = {
        distance: g.distance,
        speed: g.speed,
        collisions: g.collisions,
        boost: g.boost,
      };
      g.item = true;
      g.setControl("item", true);
      g.setControl("item", false);
      tick(g, 1);
      const blockedBoost = g.boost;
      g.controls.left = true;
      tick(g, 360);
      return {
        stopped,
        escaped: g.distance > p.z,
        blockedBoost,
        limit: p.z - separation(shapes.kart, shapes.stump).z,
      };
    });
    const pickups = itemBoxes.map((p: any) => {
      const g = make();
      g.distance = p.z - 300;
      g.x = p.x;
      g.speed = 4800;
      g.boost = 1;
      tick(g, 8);
      const collected = g.item;
      g.setControl("item", true);
      g.setControl("item", false);
      tick(g, 12);
      return {
        collected,
        serial: g.pickupSerial,
        used: g.boostsUsed,
        item: g.item,
      };
    });
    const pads = boostPads.map((p: any) => {
      const g = make();
      g.distance = p.z - 200;
      g.x = p.x;
      g.speed = 3600;
      tick(g, 6);
      const triggered = g.boost;
      tick(g, 1);
      return { triggered, after: g.boost };
    });
    return { crashes, pickups, pads };
  });
  for (const c of result.crashes) {
    expect(c.stopped.collisions).toBe(1);
    expect(c.stopped.speed).toBe(0);
    expect(c.stopped.distance).toBeLessThanOrEqual(c.limit + 0.02);
    expect(c.stopped.boost).toBe(0);
    expect(c.blockedBoost).toBe(0);
    expect(c.escaped).toBe(true);
  }
  for (const p of result.pickups) {
    expect(p.collected).toBe(true);
    expect(p.serial).toBe(1);
    expect(p.used).toBe(1);
    expect(p.item).toBe(false);
  }
  for (const p of result.pads) {
    expect(p.triggered).toBeGreaterThan(0);
    expect(p.after).toBeLessThan(p.triggered);
  }
});

test("3D scene stays aligned, glowing pickup disappears, burst plays, pause freezes and restart cleans up", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const initial = await view(page);
  expect(initial.renderer).toBe("three");
  expect(initial.cameraType).toBe("PerspectiveCamera");
  expect(initial.cars).toHaveLength(4);
  expect(initial.boxes).toHaveLength(4);
  expect(initial.pads).toHaveLength(3);
  expect(initial.seam).toBe(0);
  expect(initial.calls).toBeLessThan(160);
  expect(initial.pixelRatio).toBeLessThanOrEqual(1.5);
  await page.getByRole("button", { name: "上場比賽" }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("racing");
  await driveUntil(page, (s) => s.distance > 1800);
  await page
    .locator(".race-stage")
    .screenshot({ path: "tests/evidence/race-3d-pickup.png" });
  await driveUntil(page, (s) => s.item);
  await expect
    .poll(async () => (await view(page)).pickupBurst, { intervals: [20] })
    .toBe(true);
  const picked = await view(page);
  expect(picked.pickupSerial).toBe(1);
  expect(picked.boxes[0].visible).toBe(false);
  expect(picked.cars[0].position).toEqual(picked.playerExpected);
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await view(page)).cars[0].boost).toBe(true);
  await page
    .locator(".race-stage")
    .screenshot({ path: "tests/evidence/race-3d-boost.png" });
  await page.keyboard.press("Escape");
  const frozen = await view(page);
  await page.waitForTimeout(250);
  const later = await view(page);
  expect(later.camera).toEqual(frozen.camera);
  expect(later.boxes).toEqual(frozen.boxes);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "重新比賽", exact: true }).click();
  await expect.poll(async () => (await view(page)).pickupSerial).toBe(0);
  const reset = await view(page);
  expect(reset.boxes.every((b: any) => b.visible)).toBe(true);
  expect(reset.cars).toHaveLength(4);
  // GPU resources upload lazily when effects first appear; compare after the pickup/boost warmup.
  expect(reset.geometries).toBe(frozen.geometries);
  expect(reset.textures).toBe(frozen.textures);
  expect(errors).toEqual([]);
});

test("WebGL unavailable and context loss give persistent recovery instead of a running invisible race", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: any,
      ...args: any[]
    ) {
      if (type === "webgl2") return null;
      return original.apply(this, [type, ...args] as any);
    } as any;
  });
  await page.goto("/race.html");
  await expect(
    page.getByRole("button", { name: "重新載入賽道" }),
  ).toBeVisible();
  await expect(page.getByText(/請確認瀏覽器支援 WebGL 2/)).toBeVisible();
});

test("context loss during racing freezes simulation; reduced motion and resize remain supported", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "上場比賽" }).click();
  await expect.poll(async () => (await state(page)).phase).toBe("racing");
  expect((await view(page)).reducedMotion).toBe(true);
  const rotation = (await view(page)).boxes[0].rotation;
  await page.waitForTimeout(100);
  expect((await view(page)).boxes[0].rotation).toBe(rotation);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await view(page)).aspect).toBeGreaterThan(1.6);
  await page.evaluate(() => {
    const canvas = document.getElementById("race-canvas") as HTMLCanvasElement;
    canvas
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext();
  });
  await expect(
    page.getByRole("button", { name: "重新載入賽道" }),
  ).toBeVisible();
  const stopped = await state(page);
  expect(stopped.phase).toBe("error");
  await page.waitForTimeout(200);
  expect((await state(page)).distance).toBe(stopped.distance);
});
