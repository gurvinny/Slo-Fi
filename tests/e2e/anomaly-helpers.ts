/**
 * Shared fixtures for the AnomalySphere browser specs.
 *
 * Author: gurvinny
 *
 * These specs are split across several files so that no single file+project
 * becomes a shard's critical path: with fullyParallel false, Playwright shards
 * at file granularity, so one heavy file is an atomic block that no shard count
 * can break up. Splitting the files is what lets the work spread.
 *
 * The helpers live here rather than being copied into each spec: a duplicated
 * helper drifts silently, which is the same failure as a hand-copied DOM
 * fixture.
 */
import { expect, type Page } from "@playwright/test";
import { makeWavFile } from "./fixtures";

// #eqCurveCanvas and #waveform appear earlier in the DOM, and the EQ one sits
// in a collapsed panel -- a first-match canvas selector finds the wrong one.
export const ORB = "#anomaly canvas";

// Software WebGL under SwiftShader needs real time to produce frames. These are
// deliberately generous: a flaky renderer test is worse than a slow one.
export const FIRST_FRAME_MS = 4000;
export const SETTLE_MS = 1500;
// Long enough for a theme selection to take full effect before sampling.
export const THEME_SETTLE_MS = 15_000;

export async function loadTrack(page: Page) {
  await page.setInputFiles("#fileInput", makeWavFile());
  await expect(page.locator(ORB)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(FIRST_FRAME_MS);
}

/** Open the Visual settings drawer, where the theme and lite controls live. */
export async function openVisualPanel(page: Page) {
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
export async function toggleSwitch(page: Page, id: string, want: boolean) {
  const input = page.locator(`#${id}`);
  await expect(input).toBeAttached();
  if ((await input.isChecked()) === want) return;

  await page.locator("label.toggle-row", { has: input }).click();
  await expect(input).toBeChecked({ checked: want });
}

