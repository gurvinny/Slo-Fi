/**
 * Browser QA — AnomalySphere, the 1,799-line Three.js scene.
 *
 * Author: gurvinny
 *
 * orb.spec.ts proves the orb mounts and draws. This file covers the state
 * transitions that happen afterwards, which is where the renderer has actually
 * broken: switching visual quality, changing theme, going idle in a background
 * tab, and reloading against a warm service worker. None of these are visible
 * to a typecheck, a unit test, or a build.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  watchForFaults,
  readContextLost,
  isMeaningfulError,
  measureCanvas,
  measureTint,
  warmth,
  watchForFailedRequests,
  skipSplash,
  frameAdvance,
  sampleWarmth,
} from "./helpers";
import { makeWavFile } from "./fixtures";

// #eqCurveCanvas and #waveform appear earlier in the DOM, and the EQ one sits
// in a collapsed panel -- a first-match canvas selector finds the wrong one.
const ORB = "#anomaly canvas";

// Software WebGL under SwiftShader needs real time to produce frames. These are
// deliberately generous: a flaky renderer test is worse than a slow one.
const FIRST_FRAME_MS = 4000;
const SETTLE_MS = 1500;
// Long enough for a theme selection to take full effect before sampling.
const THEME_SETTLE_MS = 15_000;

async function loadTrack(page: Page) {
  await page.setInputFiles("#fileInput", makeWavFile());
  await expect(page.locator(ORB)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(FIRST_FRAME_MS);
}

/** Open the Visual settings drawer, where the theme and lite controls live. */
async function openVisualPanel(page: Page) {
  // Both the desktop dock and the mobile bottom nav use [data-panel]; the
  // visible one depends on viewport, so this picks whichever is hittable.
  const trigger = page.locator('[data-panel="visual"]:visible').first();
  await trigger.click();

  // #settingsDrawer by id, NOT .settings-drawer -- the export drawer carries the
  // same class, so the class selector matches two elements.
  await expect(page.locator("#settingsDrawer")).toHaveClass(/panel--visible/, {
    timeout: 10_000,
  });
  // A control that is genuinely visible, to prove the drawer rendered its
  // contents and not just gained a class. Deliberately not a toggle input --
  // see toggleSwitch below for why those can never be visible.
  await expect(page.locator('.theme-chip[data-theme="ember"]')).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Flip one of the pill switches and confirm the underlying state changed.
 *
 * The real `<input type="checkbox">` is permanently visually hidden -- absolute,
 * 0x0, opacity 0 (`main.css:2487`) -- and a sibling `.toggle-track` is what the
 * user actually sees and clicks. That is the standard accessible-checkbox
 * pattern, so asserting `toBeVisible()` on the input can never pass whether the
 * panel is open or not, and `check()` would be acting on something no user can
 * reach.
 *
 * Clicking the wrapping label is what a real user does, and asserting `checked`
 * afterwards is what proves the click landed rather than silently missing.
 */
async function toggleSwitch(page: Page, id: string, want: boolean) {
  const input = page.locator(`#${id}`);
  await expect(input).toBeAttached();
  if ((await input.isChecked()) === want) return;

  await page.locator("label.toggle-row", { has: input }).click();
  await expect(input).toBeChecked({ checked: want });
}

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

test("selecting a theme locks the hue to that palette", async ({ page }, testInfo) => {
  // A 15s settle plus a 27s sampling window, under software WebGL.
  test.setTimeout(240_000);

  // Desktop only, and not for convenience. On the mobile render path this
  // metric is BLIND to the defect: with setColorTheme stubbed to a no-op the
  // measured range is 0.0009, against a healthy mobile build's ~0.0011. The
  // mutant is indistinguishable from clean, so any threshold here would be a
  // green check that cannot fail -- worse than no check, because it would claim
  // mobile coverage this metric does not provide.
  //
  // Why it goes blind is not yet established; the mobile branch drops the grain
  // and glitch passes and halves the bloom resolution, any of which could be
  // what makes hue visible in the lit-pixel average on desktop. Finding a probe
  // that works there is open work, not something to paper over with a number.
  test.skip(
    testInfo.project.name === "mobile-software-gl",
    "warmth cannot distinguish a locked hue from a cycling one on the mobile path (mutant 0.0009 vs clean 0.0011)",
  );

  const faults = watchForFaults(page);
  await skipSplash(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await loadTrack(page);
  await openVisualPanel(page);

  // Why this measures ONE theme's STABILITY rather than its colour.
  //
  // The renderer's default theme is 'prism', whose themeHueLock is -1, and at
  // that value hueOffset advances every frame and wraps (AnomalySphere.ts:1417).
  // A named theme skips that block, so its hue stands still. "Did the colour
  // change after clicking a theme" therefore proves nothing -- prism supplies a
  // colour change on its own, and a no-op setColorTheme passed that assertion.
  //
  // Three designs were measured before this one. Ember is unusable as a probe:
  // its warmth decays monotonically for at least 42s after selection and never
  // plateaus, so a stability check and a two-theme separation check both sit on
  // a moving baseline (clean range 0.079-0.086 against a mutant's 0.102-0.104,
  // barely 1.2x). Meridian holds still, so it is the probe.
  //
  // An absolute "meridian should look cool" assertion was also tried and
  // removed. It is renderer-dependent: meridian measures -0.065 on desktop but
  // -0.015 on the mobile branch, which builds a different scene entirely (see
  // the header of playwright.config.ts). That failed the mobile project on a
  // perfectly healthy build -- a threshold calibrated to one renderer, not a
  // defect. Stability is the invariant that holds across both.
  //
  // Measured for THIS configuration (15s settle, 10 samples at 3s):
  //   desktop clean 0.0121-0.0125 | mobile clean ~0.0011 | mutant 0.0965
  // The threshold sits ~2.4x above the worst clean reading and ~3.2x below the
  // mutant.
  await page.locator('.theme-chip[data-theme="meridian"]').click();
  await page.waitForTimeout(THEME_SETTLE_MS);

  const samples = await sampleWarmth(page, page.locator(ORB));
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const detail = `samples=[${samples.map((v) => v.toFixed(4)).join(",")}]`;

  expect(
    max - min,
    `meridian should hold its hue. range=${(max - min).toFixed(4)} ${detail}`,
  ).toBeLessThan(0.03);

  expect(faults.pageErrors, "uncaught exceptions after theme change").toEqual([]);
});

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
