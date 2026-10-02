import { test, expect } from "@playwright/test";

test("engine car contacts cover rear-end, side-swipe, lapping, seam, overlap recovery and clean passing", async ({
  page,
}) => {
  await page.goto("/race.html");
  await page.getByRole("button", { name: "上場比賽" }).waitFor();
  const results = await page.evaluate(async () => {
    const { RacingEngine } = await import("/src/racing-engine.ts");
    const { entries } = await import("/src/racing-data.ts");
    const { separation, shapes, signedGap, kartBounds } = await import(
      "/src/racing-collision.ts"
    );
    const cases = [
      {
        name: "rear",
        a: 1000,
        b: 1320,
        x: 0,
        speed: 4800,
        otherSpeed: 800,
        ticks: 12,
      },
      {
        name: "side",
        a: 1000,
        b: 1000,
        x: -0.4,
        speed: 3000,
        otherSpeed: 3000,
        ticks: 8,
        steer: true,
      },
      {
        name: "lapping",
        a: 49000,
        b: 1320,
        x: 0,
        speed: 4800,
        otherSpeed: 800,
        ticks: 12,
      },
      {
        name: "seam",
        a: 47800,
        b: 120,
        x: 0,
        speed: 4800,
        otherSpeed: 800,
        ticks: 12,
      },
      {
        name: "overlap",
        a: 1000,
        b: 1080,
        x: 0,
        speed: 3600,
        otherSpeed: 1000,
        ticks: 4,
      },
      {
        name: "pass",
        a: 1000,
        b: 1320,
        x: 0.7,
        speed: 4800,
        otherSpeed: 800,
        ticks: 18,
      },
    ];
    return cases.map((c) => {
      const g: any = new RacingEngine(
        document.createElement("canvas"),
        () => {},
      );
      g.destroy();
      g.phase = "racing";
      g.distance = c.a;
      g.reachedQuarter = Math.floor(c.a / 12000);
      g.x = c.x;
      g.speed = c.speed;
      g.boost = 1;
      g.controls.right = !!c.steer;
      g.opponents = [
        {
          entry: entries[1],
          distance: c.b,
          x: 0,
          speed: c.otherSpeed,
          finishTime: null,
        },
      ];
      let overlappingFrames = 0;
      for (let i = 0; i < c.ticks; i++) {
        g.update(1 / 120);
        const o = g.opponents[0],
          extent = separation(kartBounds(c.steer ? 0.08 : 0), shapes.kart);
        if (
          Math.abs(signedGap(g.distance, o.distance)) < extent.z - 0.03 &&
          Math.abs(g.x - o.x) < extent.x - 0.001
        )
          overlappingFrames++;
      }
      return {
        name: c.name,
        collisions: g.collisions,
        overlappingFrames,
        distance: g.distance,
        initial: c.a,
        speed: g.speed,
        boost: g.boost,
      };
    });
  });
  for (const r of results) {
    expect(r.overlappingFrames, r.name).toBe(0);
    expect(r.distance, r.name).toBeGreaterThanOrEqual(r.initial);
    expect(r.collisions, r.name).toBe(r.name === "pass" ? 0 : 1);
    if (r.name !== "pass") expect(r.boost, r.name).toBe(0);
  }
});
