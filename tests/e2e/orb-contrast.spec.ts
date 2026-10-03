/**
 * The orb carries visible surface structure.
 * Author: gurvinny
 *
 * Every other orb spec asks whether the renderer is alive -- does it mount, does
 * the frame advance, is it non-blank, does it hold enough distinct colours. All
 * of those pass on an orb whose surface is a featureless uniform mass, which is
 * what shipped: the wireframe luminance curve spanned 1.08x across the entire
 * displacement range, and desktop drew 245,760 wireframe edge segments into an
 * orb about 410 pixels across, so per-vertex brightness differences averaged
 * away inside each pixel.
 *
 * Neither failure is visible to a liveness check, and neither whites out -- no
 * achromatic pixel was ever measured on either platform. They are contrast
 * failures, so this measures contrast.
 */
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { skipSplash, startPlayback, measureOrbContrast } from "./helpers";

const ORB = "#anomaly canvas";

/**
 * Real music, supplied by path through SLOFI_ORB_BEAT.
 *
 * This used to be a synthetic 120bpm kick + sub + hats WAV generated in the
 * spec. A controlled signal is not a representative one: it drove the kick in
 * a way no real track does and overstated the blow-out about 6x. Real music,
 * with a full spectrum and an actual arrangement, is the condition the orb is
 * judged in.
 *
 * The fixture is not committed: it is a full-length track, larger than the
 * whole shipping bundle. Point the variable at any real, bass-carrying track
 * of at least ~30 seconds; the spec plays about 8s before its first capture,
 * spends several more on eight captures, and the orb irons flat the moment
 * playback stops.
 */
const BEAT = process.env.SLOFI_ORB_BEAT;

// HARDWARE ONLY, measured 2026-10-01 on the old synthetic fixture.
//
// A single absolute floor cannot serve all three projects, because they do not
// disagree by noise -- they disagree by a FACTOR OF FIVE on identical code:
//
//   desktop-hardware-gl   0.0238  (n=4, stdev 0.0038)   local, real iGPU
//   desktop-software-gl   0.0904                        local
//   desktop-software-gl  >0.12    PASSED TWICE          GitHub runner, no GPU
//
// So this spec's expected failure was greened in CI by the weakest instrument
// while the orb on real hardware measured five times WORSE than the floor. That
// is not a flaky threshold, it is the recorded law that software measurements
// MIS-RANK rather than merely adding noise -- and here the mis-ranking inverted
// the verdict on the one oracle that is supposed to tell us the white-out is
// fixed.
//
// Skipped rather than given per-project floors: three thresholds whose
// relationship to each other nobody has validated is three chances to be
// confidently wrong. The cost is explicit -- CI no longer watches this oracle,
// so a genuine fix is visible only in a local hardware run. A CI pass on a
// renderer that reads 5x high was worse than no signal, because it looked like
// good news.
test("the orb surface carries local contrast at the shipped defaults", async ({ page }, testInfo) => {
  // Before anything else: this measurement is only meaningful on the real GPU.
  testInfo.project.name === "desktop-hardware-gl" ||
    test.skip(true, "software renderers read this metric ~5x high — see above");

  // No fixture is not a pass. CI has no GPU and no fixture, and already cannot
  // measure this, so it skips there and says why. A local hardware run without
  // the fixture fails instead: a skip would read as a green oracle.
  if (!BEAT) {
    test.skip(!!process.env.CI, "SLOFI_ORB_BEAT is not set; this oracle needs real music");
    throw new Error("set SLOFI_ORB_BEAT to a real music file to run the orb contrast oracle");
  }
  expect(existsSync(BEAT), `SLOFI_ORB_BEAT does not exist: ${BEAT}`).toBe(true);

  // This spec spent its first life as an expected failure, and the history
  // is the reason the floor stays where it is.
  //
  // It first passed only because nothing in this suite pressed play, so it
  // measured a motionless orb. With playback in place the surface blew out:
  // main read 0.0321 and feat/anomaly-iii 0.0238 on hardware (2026-10-01).
  // #172 had two causes, and each one alone kept this under the floor:
  //
  //   1. The bloom threshold sat at 0.22, so every outward bulge bloomed and
  //      the halos washed over the gaps between them.
  //   2. The crack vein mask was inverted. It lit ~82% of the surface instead
  //      of the lines, and on a hard hit the orb bloomed solid white
  //      (single captures near 0.015).
  //
  // Measured 2026-10-02 on hardware, real music, four runs per row:
  //
  //   threshold 0.22, old mask           0.036-0.046
  //   threshold 1.00, old mask           0.116-0.121   (2 of 4 runs pass)
  //   threshold 1.00, lines-only mask    0.143-0.148
  //     ... with lightning off           0.148-0.156
  //
  // The fixed build also passed 4/4 on two other real tracks (0.139-0.157).
  // The lightning-off row is what makes the pass trustworthy: the surface
  // clears the floor on its own, not on a flash. Do not lower the floor to
  // green a regression.
  test.setTimeout(180_000);
  await skipSplash(page);
  await page.goto("/");

  await page.setInputFiles("#fileInput", BEAT);
  await expect(page.locator(ORB)).toBeVisible({ timeout: 30_000 });

  // Loading a file is not playing it. Without this the analysers read silence,
  // every audio-derived uniform stays at exactly zero, and this spec measures a
  // motionless orb -- which it did, and passed, when it was first written.
  await startPlayback(page);
  await page.waitForTimeout(5_000);       // software WebGL needs real time to settle

  // The exact configuration the surface was reported unreadable at.
  await page.evaluate(() => {
    const el = document.getElementById("orbReactivitySlider") as HTMLInputElement;
    if (el) { el.value = "80"; el.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.waitForTimeout(1_500);

  // Averaged over several captures: the orb animates, and mesh.scale tracks the
  // kick, so a single frame lands wherever the beat happens to be. Eight, not
  // four: a four-capture window could end just before a hard hit, and it did.
  // The old mask passed 4 captures most of the time and failed every run at 8.
  const canvas = page.locator(ORB);
  const samples: Awaited<ReturnType<typeof measureOrbContrast>>[] = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await measureOrbContrast(canvas));
    await page.waitForTimeout(350);
  }
  const mean = (k: "relativeContrast" | "meanV") =>
    samples.reduce((s, x) => s + x[k], 0) / samples.length;

  // Re-measured with audio actually playing. The figures this floor was first
  // set from (0.233 desktop / 0.141 mobile) were taken on a resting orb, so
  // they described the mesh and the resting luminance curve and nothing the
  // audio does. Playing material moves, which is why this asserts on a mean
  // over several captures and not on any one frame.
  //
  // Measure the noise; do not quote it. A stale "per-sample spread near 0.04"
  // in this comment once nearly hid a real 0.011 difference between main and
  // feat/anomaly-iii as noise. Eight-capture run means on the fixed build
  // spread 0.143-0.148 on one track; single captures spread far wider.
  expect(mean("relativeContrast"), "the orb surface reads as a uniform mass")
    .toBeGreaterThan(0.12);

  // The surface must not be won by simply blowing the orb out: a blown-out orb
  // loses contrast rather than gaining it, so this pins the other direction.
  expect(mean("meanV"), "the orb has gone dark").toBeGreaterThan(30);
  expect(mean("meanV"), "the orb has blown out").toBeLessThan(200);
});
