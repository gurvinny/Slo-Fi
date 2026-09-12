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
} from "./helpers";

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
  await page.goto("/", { waitUntil: "networkidle" });

  const canvas = page.locator("canvas").first();
  await expect(canvas, "a canvas element should mount").toBeVisible();

  // WebGL is a real WebGL context, not a stub.
  const glOk = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return false;
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    return Boolean(gl);
  });
  expect(glOk, "canvas should have a WebGL context").toBe(true);

  // Software WebGL needs a moment to produce a first frame.
  await page.waitForTimeout(4000);

  const stats = await measureCanvas(canvas);
  // A blank or single-colour canvas is the exact symptom of the orb failing
  // to mount. Real geometry produces many distinct colours.
  expect(stats.distinctColors, `canvas colour variety (${JSON.stringify(stats)})`)
    .toBeGreaterThan(12);
  expect(stats.nonBlankRatio, `share of lit pixels (${JSON.stringify(stats)})`)
    .toBeGreaterThan(0.01);

  expect(await readContextLost(page), "WebGL context was lost").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions").toEqual([]);
});

test("the renderer survives a resize without losing its context", async ({ page }) => {
  const faults = watchForFaults(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("canvas").first()).toBeVisible();

  // Mobile sizing has broken here before (100vh vs 100svh/100dvh).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);

  expect(await readContextLost(page), "context lost after resize").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions after resize").toEqual([]);
});
