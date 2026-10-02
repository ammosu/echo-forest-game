import type { Page } from "@playwright/test";
import type { RaceSnapshot } from "../src/racing-engine";

/** Feedback controller uses only real keys and the read-only game snapshot. */
export async function driveUntil(
  page: Page,
  done: (s: RaceSnapshot) => boolean,
  timeout = 10000,
  lane = 0,
) {
  let left = false,
    right = false;
  const start = Date.now();
  try {
    while (Date.now() - start < timeout) {
      const s: RaceSnapshot = await page.evaluate(() =>
        (window as any).__race.snapshot(),
      );
      if (done(s)) return s;
      const desired =
        s.curve * 0.22 * (s.speed / 3600) ** 2 -
        s.lateralVelocity +
        (lane - s.x) * 5;
      const l = desired < -0.2,
        r = desired > 0.2;
      if (l !== left) {
        await page.keyboard[l ? "down" : "up"]("ArrowLeft");
        left = l;
      }
      if (r !== right) {
        await page.keyboard[r ? "down" : "up"]("ArrowRight");
        right = r;
      }
      await page.waitForTimeout(25);
    }
    throw new Error("Keyboard driver did not reach the requested race state");
  } finally {
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("ArrowRight");
  }
}
