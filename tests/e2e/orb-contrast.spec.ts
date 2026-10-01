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
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skipSplash, startPlayback, measureOrbContrast } from "./helpers";

const ORB = "#anomaly canvas";

/**
 * A 120bpm kick + sustained sub + hats.
 *
 * 30 seconds, and the duration is load-bearing. This spec spends ~8s getting
 * to its first capture (settle, reactivity, four averaged samples), and the
 * orb irons flat toward uCrystal the moment playback stops -- so a 10s
 * fixture runs out mid-measurement and reads 0.073 against a floor of 0.12.
 * That was invisible while nothing pressed play and the clock never moved.
 *
 * The shared `makeWavFile` fixture is a 440Hz sine, which carries no bass at
 * all, so uBass stays near zero and none of the displacement path this spec
 * measures ever runs. A fixture that does not exercise the feature makes the
 * measurement meaningless while leaving the test green -- the same trap that
 * produced three earlier bugs here, one frequency band further up.
 */
function makeBassWav(seconds = 30, rate = 44100): string {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  const beat = 0.5;                       // 120bpm, as a DURATION not a frame count
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const ph = (t % beat) / beat;
    const kick = Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-ph * beat * 40)) * t)
      * Math.exp(-ph * beat * 18) * 0.75;
    const sub = Math.sin(2 * Math.PI * 41 * t) * 0.32;
    const hp = ((t + beat / 2) % beat) / beat;
    const hat = (Math.random() * 2 - 1) * Math.exp(-hp * beat * 60) * 0.18;
    const v = Math.max(-1, Math.min(1, kick + sub + hat));
    buf.writeInt16LE(Math.round(v * 0x7000), 44 + i * 2);
  }
  const path = join(mkdtempSync(join(tmpdir(), "slofi-bass-")), "bass.wav");
  writeFileSync(path, buf);
  return path;
}

// HARDWARE ONLY, measured 2026-10-01.
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

  // EXPECTED TO FAIL, and the failure is the point.
  //
  // This spec passed for exactly one reason: nothing in this suite had ever
  // pressed play, so it measured a motionless, silent orb. With startPlayback
  // in place it measures the condition the bug was actually reported in, and
  // the orb does not survive it.
  //
  // Measured on hardware 2026-10-01: main reads 0.0321 (n=4, stdev 0.0033) and
  // feat/anomaly-iii reads 0.0238 (n=4, stdev 0.0038) against this floor of
  // 0.12. The earlier figures in this comment -- "0.068 to 0.081 on all three
  // projects" -- predate both the iGPU passthrough and main's move to Khronos
  // PBR Neutral tone mapping, and described a machine that no longer exists.
  // They were quoted here as the justification for the floor, so they are
  // replaced rather than kept for history.
  //
  // That is not a floor that needs lowering. Under playback the surface blows
  // out: a census of achromatic pixels (min(r,g,b) > 200) on this canvas runs
  // to 9k-33k per frame while a track is running and falls to EXACTLY ZERO the
  // moment it stops. Contrast collapses because the orb saturates, which is a
  // real defect in what ships, not an artifact of the measurement.
  //
  // Marked fail() rather than skipped so it keeps running and keeps reporting.
  // When the blow-out is fixed this will start PASSING, and Playwright will
  // then fail the run for an unexpected pass -- which is the signal to delete
  // this block. Do not green it by touching the threshold.
  test.fail();
  test.setTimeout(180_000);
  await skipSplash(page);
  await page.goto("/");

  await page.setInputFiles("#fileInput", makeBassWav());
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
  // kick, so a single frame lands wherever the beat happens to be.
  const canvas = page.locator(ORB);
  const samples: Awaited<ReturnType<typeof measureOrbContrast>>[] = [];
  for (let i = 0; i < 4; i++) {
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
  // The "per-sample spread near 0.04" this comment used to claim does not hold
  // at the levels actually measured: eight runs on hardware gave a stdev of
  // 0.0033-0.0038, an order of magnitude tighter. That matters because the
  // stale figure was large enough to hide a real difference as noise -- it
  // nearly did exactly that when main (0.0321) was compared against
  // feat/anomaly-iii (0.0238) and the non-overlapping ranges were almost
  // dismissed. Measure the noise; do not quote it.
  expect(mean("relativeContrast"), "the orb surface reads as a uniform mass")
    .toBeGreaterThan(0.12);

  // The surface must not be won by simply blowing the orb out: a blown-out orb
  // loses contrast rather than gaining it, so this pins the other direction.
  expect(mean("meanV"), "the orb has gone dark").toBeGreaterThan(30);
  expect(mean("meanV"), "the orb has blown out").toBeLessThan(200);
});
