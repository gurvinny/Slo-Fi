/**
 * Browser QA — AnomalySphere, renderer state transitions.
 *
 * Author: gurvinny
 *
 * orb.spec.ts proves the orb mounts and draws. This file covers what happens
 * afterwards, which is where the renderer has actually broken: the wireframe
 * shader, going idle in a background tab, and reloading against a warm service
 * worker. None of these are visible to a typecheck, a unit test, or a build.
 */
import { test, expect } from "@playwright/test";
import {
  watchForFaults,
  readContextLost,
  isMeaningfulError,
  measureCanvas,
  watchForFailedRequests,
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

test("wireframe mode changes what is drawn", async ({ page }) => {
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);
  await openVisualPanel(page);

  const orb = page.locator(ORB);
  const before = await measureCanvas(orb);

  // setWireframe rebuilds the material. If the rebuild throws or is dropped,
  // the orb either vanishes or never changes.
  await toggleSwitch(page, "wireframeToggle", false);
  await page.waitForTimeout(FIRST_FRAME_MS);
  const after = await measureCanvas(orb);

  expect(after.nonBlankRatio, "orb went blank after a material rebuild")
    .toBeGreaterThan(0.005);
  expect(
    Math.abs(after.nonBlankRatio - before.nonBlankRatio),
    `lit-pixel share barely moved: ${before.nonBlankRatio} -> ${after.nonBlankRatio}`,
  ).toBeGreaterThan(0.001);
  expect(await readContextLost(page), "context lost toggling wireframe").toBe(false);
});

test("the orb keeps its context through a background tab and resumes drawing", async ({ page }) => {
  const faults = watchForFaults(page);
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);

  // A real tab switch cannot be driven from here, so the visibilitychange
  // handler is exercised directly -- that handler is what the browser calls.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(SETTLE_MS);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(FIRST_FRAME_MS);

  const stats = await measureCanvas(page.locator(ORB));
  expect(stats.nonBlankRatio, `lit pixels after returning to the tab (${JSON.stringify(stats)})`)
    .toBeGreaterThan(0.01);

  // Same stale-frame trap as the Lite round trip: a canvas that stopped drawing
  // still looks drawn. Motion is the only evidence the loop came back.
  const motion = await frameAdvance(page, page.locator(ORB));
  expect(motion, `share of pixels changing after returning to the tab: ${motion}`)
    .toBeGreaterThan(0.005);
  expect(await readContextLost(page), "context lost while backgrounded").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions around backgrounding").toEqual([]);
});

test("a reload against a warm service worker still resolves every chunk", async ({ page }) => {
  // Two full decode + detect + render cycles plus two networkidle waits, all
  // under software WebGL. The suite-wide 60s budget cannot fit that.
  test.setTimeout(150_000);

  // This is the second historical production failure: a stale service worker
  // served an index.html whose chunk hashes no longer existed, and the dynamic
  // import failure was swallowed by a bare catch. CI was green.
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);

  // Give the service worker a chance to install and precache.
  await page.waitForTimeout(SETTLE_MS);

  const faults = watchForFaults(page);
  const failed = watchForFailedRequests(page);

  await page.reload({ waitUntil: "networkidle" });
  await loadTrack(page);

  // A dead chunk hash surfaces as a failed request, and the orb never mounts.
  expect(failed, "requests that failed on a warm reload").toEqual([]);
  await expect(page.locator(ORB)).toBeVisible();

  const stats = await measureCanvas(page.locator(ORB));
  expect(stats.nonBlankRatio, `lit pixels after a warm reload (${JSON.stringify(stats)})`)
    .toBeGreaterThan(0.01);
  expect(
    faults.consoleErrors.filter(isMeaningfulError),
    "console errors on a warm reload",
  ).toEqual([]);
  expect(faults.pageErrors, "uncaught exceptions on a warm reload").toEqual([]);
});
