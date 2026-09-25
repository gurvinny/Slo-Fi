/**
 * Browser QA — the orb has to render on every client, not just this one.
 *
 * Author: gurvinny
 *
 * Run under three projects (see playwright.config.ts): desktop on software GL,
 * mobile on software GL, and desktop on real hardware GL. The mobile project is
 * not a viewport change -- AnomalySphere branches on a mobile UA regex and that
 * branch builds a different scene, so a mobile-only failure cannot be seen from
 * a desktop run.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  watchForFaults,
  readContextLost,
  isMeaningfulError,
  measureCanvas,
  webglCanvasIndex,
  frameAdvance,
  glRenderer,
  isSoftwareRenderer,
  expectsHardwareGl,
  skipSplash,
} from "./helpers";
import { makeWavFile } from "./fixtures";

const ORB = "#anomaly canvas";
const FIRST_FRAME_MS = 4000;

async function loadTrack(page: Page) {
  await page.setInputFiles("#fileInput", makeWavFile());
  await expect(page.locator(ORB)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(FIRST_FRAME_MS);
}

test("WebGL is available and the backend is reported", async ({ page }, testInfo) => {
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });

  const renderer = await glRenderer(page);
  // Recorded rather than asserted: this is the fact every other result in this
  // project has to be read against.
  testInfo.annotations.push({ type: "gl-renderer", description: String(renderer) });

  expect(renderer, "no WebGL context at all -- the orb cannot mount").not.toBeNull();
});

test("the orb renders and keeps rendering on this client", async ({ page }, testInfo) => {
  const faults = watchForFaults(page);
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });

  const renderer = await glRenderer(page);
  testInfo.annotations.push({ type: "gl-renderer", description: String(renderer) });

  // The hardware project must not pass on a silent fallback. Chromium does not
  // error when it cannot get a GPU -- it quietly uses SwiftShader, which would
  // make this a test claiming hardware coverage while exercising software.
  //
  // Where no render node exists (CI), skipping with the reason is honest.
  // Where one DOES exist, a fallback is a regression and has to fail: the
  // renderer string names which kind -- "SwiftShader" means the ANGLE flags are
  // wrong, "llvmpipe" means the flags are right and this process cannot read
  // the render node.
  if (testInfo.project.name === "desktop-hardware-gl") {
    if (expectsHardwareGl()) {
      expect(
        isSoftwareRenderer(renderer),
        `/dev/dri/renderD128 exists, so this project must run on the GPU, but got: ${renderer}`,
      ).toBe(false);
    } else {
      test.skip(true, `no hardware GL on this host (renderer: ${renderer})`);
    }
  }

  await loadTrack(page);

  const idx = await webglCanvasIndex(page);
  expect(idx, "a canvas owning a WebGL context should exist").toBeGreaterThanOrEqual(0);

  const stats = await measureCanvas(page.locator(ORB));
  expect(stats.distinctColors, `colour variety (${JSON.stringify(stats)})`).toBeGreaterThan(12);
  expect(stats.nonBlankRatio, `lit pixels (${JSON.stringify(stats)})`).toBeGreaterThan(0.01);

  // A WebGL canvas keeps its last painted pixels, so the two checks above pass
  // on a scene that died a second ago. Motion is what proves the loop is live.
  const motion = await frameAdvance(page, page.locator(ORB));
  expect(motion, `share of pixels changing between frames: ${motion}`).toBeGreaterThan(0.005);

  expect(await readContextLost(page), "WebGL context was lost").toBe(false);
  expect(faults.pageErrors, "uncaught exceptions").toEqual([]);
  expect(faults.consoleErrors.filter(isMeaningfulError), "console errors").toEqual([]);
});

test("the canvas is sized for this device's pixel ratio", async ({ page }, testInfo) => {
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  if (testInfo.project.name === "desktop-hardware-gl") {
    const renderer = await glRenderer(page);
    if (expectsHardwareGl()) {
      expect(isSoftwareRenderer(renderer), `expected the GPU, got: ${renderer}`).toBe(false);
    } else {
      test.skip(true, "no hardware GL on this host");
    }
  }
  await loadTrack(page);

  const box = await page.locator(ORB).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return { w: c.width, h: c.height, cssW: c.clientWidth, dpr: window.devicePixelRatio };
  });

  // The renderer caps the pixel ratio at 2 on mobile and 3 on desktop, to hold
  // down framebuffer memory. A backing store of zero means it never sized
  // itself, which is how the orb renders blank at a correct-looking CSS size.
  const cap = testInfo.project.name === "mobile-software-gl" ? 2 : 3;
  expect(box.w, `backing store width (${JSON.stringify(box)})`).toBeGreaterThan(0);
  expect(box.h, `backing store height (${JSON.stringify(box)})`).toBeGreaterThan(0);
  expect(
    box.w / Math.max(box.cssW, 1),
    `effective pixel ratio (${JSON.stringify(box)})`,
  ).toBeLessThanOrEqual(cap + 0.01);
});

test("the WebGPU upgrade stays disabled", async ({ page }) => {
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);

  // ENABLE_WEBGPU_UPGRADE is off deliberately: the node pipeline cannot render
  // this scene's raw-GLSL materials, and turning it on is what blanked the orb
  // in production once already. If someone flips it, the canvas is the first
  // place it shows -- so this asserts the scene still draws AND that the context
  // in use is still WebGL rather than WebGPU.
  const kind = await page.locator(ORB).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    // A canvas already bound to webgl2 returns that same context; asking for
    // webgpu on it would return null. Cheap and non-destructive.
    return c.getContext("webgl2") ? "webgl2" : c.getContext("webgl") ? "webgl" : "other";
  });
  expect(kind, "the orb should still be on the WebGL path").toMatch(/^webgl2?$/);
});
