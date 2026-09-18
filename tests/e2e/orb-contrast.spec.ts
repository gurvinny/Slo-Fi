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
import { skipSplash, measureOrbContrast } from "./helpers";

const ORB = "#anomaly canvas";

/**
 * A 120bpm kick + sustained sub + hats.
 *
 * The shared `makeWavFile` fixture is a 440Hz sine, which carries no bass at
 * all, so uBass stays near zero and none of the displacement path this spec
 * measures ever runs. A fixture that does not exercise the feature makes the
 * measurement meaningless while leaving the test green -- the same trap that
 * produced three earlier bugs here, one frequency band further up.
 */
function makeBassWav(seconds = 10, rate = 44100): string {
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

test("the orb surface carries local contrast at the shipped defaults", async ({ page }) => {
  test.setTimeout(180_000);
  await skipSplash(page);
  await page.goto("/");

  await page.setInputFiles("#fileInput", makeBassWav());
  await expect(page.locator(ORB)).toBeVisible({ timeout: 30_000 });
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

  // Measured on this build: 0.233 desktop / 0.141 mobile, against 0.081 desktop
  // before the fix. 0.12 sits clear of the broken value with room for renderer
  // variance, and is deliberately below the mobile figure so one threshold
  // serves both projects -- the mobile path was never the broken one.
  expect(mean("relativeContrast"), "the orb surface reads as a uniform mass")
    .toBeGreaterThan(0.12);

  // The surface must not be won by simply blowing the orb out: a blown-out orb
  // loses contrast rather than gaining it, so this pins the other direction.
  expect(mean("meanV"), "the orb has gone dark").toBeGreaterThan(30);
  expect(mean("meanV"), "the orb has blown out").toBeLessThan(200);
});
