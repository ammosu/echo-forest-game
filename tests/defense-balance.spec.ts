import { test, expect } from "@playwright/test";
import { DefenseEngine, focusLanes, type PlantKind } from "../src/defense-engine";
// Bot players for the balance numbers in src/defense-engine.ts. Passive "fill a column" layouts must
// lose; reading the focus lanes and dropping a bomb every few seconds must win.
type G = DefenseEngine;
const has = (g: G, x: number, y: number) => g.plants.some((p) => p.x === x && p.y === y);
const fillColumn = (g: G, x: number, kind: PlantKind) => {
  for (let y = 0; y < 5; y++) if (!has(g, x, y)) g.plant(x, y, kind);
  return g.plants.filter((p) => p.x === x).length === 5;
};
/** One shooter per lane, then stack the announced focus lanes. */
const focusPlanter = (g: G) => {
  for (let y = 0; y < 5; y++) if (!has(g, 0, y)) return void g.plant(0, y, "shooter");
  const lanes = focusLanes(g.phase === "build" ? g.wave + 1 : g.wave);
  const plan: PlantKind[] = ["shooter", "shooter", "shooter", "ice", "shooter"];
  for (let x = 1; x < plan.length; x++) {
    for (const y of lanes) if (!has(g, x, y)) return void g.plant(x, y, plan[x]);
    if (x === 2) for (let y = 0; y < 5; y++) if (!has(g, 1, y)) return void g.plant(1, y, "shooter");
  }
};
const blocked = (g: G, x: number, y: number) =>
  x < 0 || x > 8 || y < 0 || y > 4 || [...g.logs, ...g.bombs].some((p) => p.x === x && p.y === y);
const inBlast = (g: G, x: number, y: number) =>
  g.flames.some((f) => f.x === x && f.y === y) ||
  g.bombs.some((b) => (b.x === x && Math.abs(b.y - y) <= 2) || (b.y === y && Math.abs(b.x - x) <= 2));
const step = (g: G, tx: number, ty: number) => {
  const { x, y } = g.player;
  for (const [dx, dy] of [[Math.sign(tx - x), 0], [0, Math.sign(ty - y)]])
    if ((dx || dy) && !blocked(g, x + dx, y + dy) && !g.flames.some((f) => f.x === x + dx && f.y === y + dy))
      return void g.move(dx, dy);
};
/** Walks to where enemies will be when the fuse ends, bombs at most once per `gap` seconds, then hides. */
const bomber = (gap: number) => {
  let last = -99;
  return (g: G) => {
    if (g.moveCooldown > 0) return;
    const p = g.player;
    if (inBlast(g, p.x, p.y)) {
      let best: [number, number] | null = null;
      for (let x = 0; x <= 8; x++)
        for (let y = 0; y < 5; y++)
          if (!blocked(g, x, y) && !inBlast(g, x, y) && (!best || Math.abs(x - p.x) + Math.abs(y - p.y) < Math.abs(best[0] - p.x) + Math.abs(best[1] - p.y)))
            best = [x, y];
      if (best) step(g, ...best);
      return;
    }
    if (g.bombs.length >= 3 || g.elapsed - last < gap) return;
    let target: { x: number; y: number } | null = null,
      top = 60;
    for (let x = 0; x <= 7; x++)
      for (let y = 0; y < 5; y++) {
        if (blocked(g, x, y)) continue;
        let score = -15 * (Math.abs(x - p.x) + Math.abs(y - p.y));
        for (const e of g.enemies) {
          const fx = e.x - [0.34, 0.6, 0.24][e.kind] * (e.slow > 0 ? 0.45 : 1) * 2;
          if ((e.y === y && Math.abs(fx - x) <= 2.4) || (Math.abs(fx - x) < 0.6 && Math.abs(e.y - y) <= 2))
            score += Math.min(130, e.hp);
        }
        if (score > top) [top, target] = [score, { x, y }];
      }
    if (!target) return;
    if (target.x === p.x && target.y === p.y) {
      g.bomb();
      last = g.elapsed;
    } else step(g, target.x, target.y);
  };
};
const play = (...bots: ((g: G) => void)[]) => {
  const g = new DefenseEngine();
  g.start();
  for (let i = 0; g.active && i < 600 * 60; i++) {
    bots.forEach((bot) => bot(g));
    g.update(1 / 60);
  }
  return g;
};
const shooterIce = (g: G) => void (fillColumn(g, 0, "shooter") && fillColumn(g, 1, "ice"));
test("balance: one shooter row plus one ice row loses, even with occasional bombs", () => {
  expect(play(shooterIce).phase).toBe("lost");
  expect(play(shooterIce, bomber(8)).phase).toBe("lost");
});
test("balance: stacking the focus lanes and bombing every few seconds clears all five waves", () => {
  const g = play(focusPlanter, bomber(8));
  expect(g.phase).toBe("won");
  expect(g.kills).toBe(90);
  expect(g.tree).toBeGreaterThanOrEqual(5);
});
