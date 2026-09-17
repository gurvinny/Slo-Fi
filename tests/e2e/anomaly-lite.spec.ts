/**
 * Browser QA — AnomalySphere, Lite visual mode.
 *
 * Author: gurvinny
 *
 * Lite mode suspends the WebGL loop entirely, so these cover the two ways that
 * has broken: losing the context on the way in, and coming back blank rather
 * than drawing on the way out.
 */
import { test, expect } from "@playwright/test";
import {
  watchForFaults,
  readContextLost,
  measureCanvas,
  skipSplash,
  frameAdvance,
} from "./helpers";
import {
  ORB,
  FIRST_FRAME_MS,
  SETTLE_MS,
  loadTrack,
  openVisualPanel,
  toggleSwitch,
} from "./anomaly-helpers";

test("switching to Lite visual mode idles WebGL without losing the context", async ({ page }) => {
  const faults = watchForFaults(page);
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);
  await openVisualPanel(page);

  await toggleSwitch(page, "liteVisualToggle", true);
  await page.waitForTimeout(SETTLE_MS);

  // suspend() hides the canvas and cancels the frame loop. The CSS aurora takes
  // over, so the user still sees motion while the GPU goes idle.
  await expect(page.locator(ORB)).toBeHidden();
  await expect(page.locator("#liteAurora")).toHaveClass(/lite-aurora--on/);

  // Critically: suspending must NOT drop the context. forceContextLoss belongs
  // to destroy() only -- losing it here means the orb cannot come back.
  expect(await readContextLost(page), "context lost when entering Lite mode").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions entering Lite mode").toEqual([]);
});

test("leaving Lite visual mode brings the orb back drawing, not blank", async ({ page }) => {
  const faults = watchForFaults(page);
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);
  await openVisualPanel(page);

  await toggleSwitch(page, "liteVisualToggle", true);
  await page.waitForTimeout(SETTLE_MS);
  await toggleSwitch(page, "liteVisualToggle", false);
  await page.waitForTimeout(FIRST_FRAME_MS);

  await expect(page.locator(ORB)).toBeVisible();

  const stats = await measureCanvas(page.locator(ORB));
  expect(stats.distinctColors, `colour variety after resume (${JSON.stringify(stats)})`)
    .toBeGreaterThan(12);
  expect(stats.nonBlankRatio, `lit pixels after resume (${JSON.stringify(stats)})`)
    .toBeGreaterThan(0.01);

  // Neither check above can detect the actual failure. A WebGL canvas retains
  // its last painted pixels, so re-showing a canvas whose loop never restarted
  // leaves a stale frame that satisfies both trivially -- a mutation removing
  // resume()'s loop restart passed them. Only motion proves frames are arriving.
  const motion = await frameAdvance(page, page.locator(ORB));
  expect(motion, `share of pixels changing after resume: ${motion}`).toBeGreaterThan(0.005);

  expect(await readContextLost(page), "context lost across a Lite round trip").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions leaving Lite mode").toEqual([]);
});
