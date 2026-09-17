/**
 * Browser QA — AnomalySphere, theme colour.
 *
 * Author: gurvinny
 *
 * Split into its own file because it is the single slowest spec in the suite --
 * a theme needs 15s to settle before the hue can be sampled, and the assertion
 * took five designs before one could fail on a broken app. Keeping it here
 * stops it dominating whichever shard it lands in.
 */
import { test, expect } from "@playwright/test";
import {
  watchForFaults,
  skipSplash,
  sampleWarmth,
} from "./helpers";
import {
  ORB,
  THEME_SETTLE_MS,
  loadTrack,
  openVisualPanel,
} from "./anomaly-helpers";

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
