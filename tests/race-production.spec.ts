import { test, expect } from "@playwright/test";
import { build, preview } from "vite";

test("production build runs the 3D race with no development controls or asset errors", async ({
  page,
}) => {
  test.setTimeout(45000);
  await build({ logLevel: "silent" });
  const server = await preview({
    logLevel: "silent",
    preview: { host: "127.0.0.1", port: 0, open: false },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      response.url().startsWith(server.resolvedUrls!.local[0]) &&
      response.status() >= 400
    )
      errors.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto(`${server.resolvedUrls!.local[0]}race.html`);
    await page.getByRole("button", { name: "上場比賽" }).click();
    await expect
      .poll(() => page.locator("#race-speed").textContent())
      .not.toBe("0");
    await expect
      .poll(() => page.locator("#race-speed").textContent())
      .toMatch(/^[1-9]\d/);
    expect(
      await page.evaluate(() => [
        typeof (window as any).__race,
        typeof (window as any).__raceView,
      ]),
    ).toEqual(["undefined", "undefined"]);
    await page.screenshot({
      path: "tests/evidence/race-production.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "繼續比賽 →", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
