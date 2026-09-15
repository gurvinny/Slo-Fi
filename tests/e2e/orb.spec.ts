/**
 * Browser QA — the orb has to actually render.
 * Author: gurvinny
 *
 * Two real failures motivate this file, both invisible to a typecheck or a
 * build. The orb once vanished in production while working in dev, because a
 * WebGPU upgrade swapped in a renderer that could not draw the raw-GLSL
 * materials. Separately a stale service worker served an index.html whose
 * chunk hashes no longer existed, and the dynamic import failure was swallowed
 * by a bare catch. In both cases CI was green.
 */
import { test, expect } from "@playwright/test";
import {
  watchForFaults,
  readContextLost,
  isMeaningfulError,
  measureCanvas,
  webglCanvasIndex,
  frameAdvance,
  skipSplash,
} from "./helpers";
import { makeWavFile } from "./fixtures";

// The orb renderer appends its canvas into #anomaly, a direct child of body.
// Two other canvases -- #eqCurveCanvas and #waveform -- appear earlier in the
// DOM, and the EQ one sits in a collapsed panel, so a first-match selector
// finds a hidden canvas that is not the orb.
const ORB = "#anomaly canvas";

/**
 * Load a track. The orb does not exist on a cold page: AnomalySphere is
 * imported only after a file decodes and an analyser node exists, which is
 * correct -- there is no reason to start WebGL before there is audio.
 */
async function loadTrack(page: import("@playwright/test").Page) {
  await page.setInputFiles("#fileInput", makeWavFile());
  // Decode plus BPM/key detection, then the code-split orb chunk.
  await expect(page.locator(ORB)).toBeVisible({ timeout: 30_000 });
}

test("home page loads with no console errors or uncaught exceptions", async ({ page }) => {
  const faults = watchForFaults(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toBeVisible();

  expect(faults.pageErrors, "uncaught exceptions").toEqual([]);
  expect(
    faults.consoleErrors.filter(isMeaningfulError),
    "console errors",
  ).toEqual([]);
});

test("the orb canvas mounts and draws a non-blank frame", async ({ page }) => {
  const faults = watchForFaults(page);
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await loadTrack(page);
  const canvas = page.locator(ORB);

  // A real WebGL context somewhere on the page, not a stub.
  const idx = await webglCanvasIndex(page);
  expect(idx, "a canvas with a WebGL context should exist").toBeGreaterThanOrEqual(0);

  // Software WebGL needs a moment to produce a first frame.
  await page.waitForTimeout(4000);

  const stats = await measureCanvas(canvas);
  // A blank or single-colour canvas is the exact symptom of the orb failing
  // to mount. Real geometry produces many distinct colours.
  expect(stats.distinctColors, `canvas colour variety (${JSON.stringify(stats)})`)
    .toBeGreaterThan(12);
  expect(stats.nonBlankRatio, `share of lit pixels (${JSON.stringify(stats)})`)
    .toBeGreaterThan(0.01);

  // Neither assertion above can fail on a dead renderer, so on their own they
  // do not test what this test is named. Measured by deleting the main-loop
  // `composer.render()` call: the orb never draws a single frame, and both
  // still passed -- the canvas keeps whatever pixels it last painted.
  // Only a two-capture comparison separates a live orb from a frozen one.
  //
  // Measured on desktop-software-gl:
  //   live orb      0.0871
  //   dead renderer 0.0045
  //   floor         0.005
  //
  // The 0.0045 on a dead renderer is not the orb -- it is the page showing
  // through a transparent canvas. That leaves the failing side a thin margin
  // (0.0045 against 0.005) while the passing side has plenty, so the floor is
  // kept in step with render-matrix.spec.ts rather than raised on one
  // renderer's numbers: an absolute threshold tuned on desktop has already
  // failed a healthy build on the mobile project once.
  //
  // This measurement only works with the splash skipped. Without it the splash
  // animates over the canvas and its own decay is what gets measured -- the
  // same clean build read 0.0122 in one run and under 0.005 in the next,
  // straddling the threshold from either side.
  const motion = await frameAdvance(page, canvas);
  expect(motion, `share of pixels changing between frames: ${motion}`)
    .toBeGreaterThan(0.005);

  expect(await readContextLost(page), "WebGL context was lost").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions").toEqual([]);
});

test("the renderer survives a resize without losing its context", async ({ page }) => {
  const faults = watchForFaults(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);

  // Mobile sizing has broken here before (100vh vs 100svh/100dvh).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);

  expect(await readContextLost(page), "context lost after resize").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions after resize").toEqual([]);
});
