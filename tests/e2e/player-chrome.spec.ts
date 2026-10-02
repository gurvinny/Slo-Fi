/**
 * Browser QA — the player chrome: panel bounds, the track timer, the Help route.
 * Author: gurvinny
 *
 * Panel bounds. The four flyouts are position: fixed. Their offsets used to be hardcoded and
 * redefined several times in main.css, the last one winning, so a panel could
 * slide under the header or over the waveform as soon as the chrome stopped
 * matching the number it was tuned for. A short landscape window is where that
 * shows first, which is why it is in the matrix.
 *
 * The invariant is geometric, not a pixel offset: an open panel's box must not
 * intersect any visible piece of chrome, and must keep a usable height.
 */
import { test, expect, type Page } from "@playwright/test";
import { skipSplash, startPlayback } from "./helpers";
import { makeWavFile } from "./fixtures";

const PANELS = ["playlist", "sound", "visual", "export"] as const;
const PANEL_ID: Record<(typeof PANELS)[number], [panel: string, close: string]> = {
  playlist: ["playlistDrawer", "playlistCloseBtn"],
  sound: ["soundDrawer", "soundCloseBtn"],
  visual: ["settingsDrawer", "settingsCloseBtn"],
  export: ["exportDrawer", "exportCloseBtn"],
};

// Chrome a panel must never cover. Hidden ones (the header on phones, the dock
// below 600px) report an empty box and are skipped.
const CHROME = [".header", ".player-top", ".player-bottom", ".control-dock", ".mobile-logo"];

// Below this a panel is technically in bounds and practically unusable.
const MIN_USABLE_HEIGHT = 160;

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 1280, height: 600 },
];

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  // Sub-pixel tolerance: a shared 1px border edge is adjacency, not overlap.
  const e = 0.5;
  return (
    a.x < b.x + b.width - e &&
    b.x < a.x + a.width - e &&
    a.y < b.y + b.height - e &&
    b.y < a.y + a.height - e
  );
}

async function loadTrack(page: Page, seconds = 2) {
  await skipSplash(page);
  // Reduced motion drops the slide transition, so the box read below is the
  // panel's resting geometry rather than a frame of its entrance.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.setInputFiles("#fileInput", makeWavFile(seconds));
  // #player itself has no box (every child is position: fixed), so wait on the
  // class the app sets once the track has decoded, not on visibility.
  await expect(page.locator("#player")).toHaveClass(/\bvisible\b/, { timeout: 30_000 });
}

async function chromeBoxes(page: Page): Promise<Record<string, Box>> {
  return page.evaluate((selectors) => {
    const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el || getComputedStyle(el).display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out[sel] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return out;
  }, CHROME);
}

async function assertPanelsInBounds(page: Page) {
  for (const name of PANELS) {
    // The dock owns the triggers on desktop, .bottom-nav on phones.
    await page.locator(`[data-panel="${name}"]:visible`).first().click();
    const [panelId, closeId] = PANEL_ID[name];
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toHaveClass(/panel--visible/);

    const box = (await panel.boundingBox())!;
    const chrome = await chromeBoxes(page);
    const viewport = page.viewportSize()!;

    for (const [sel, c] of Object.entries(chrome)) {
      expect(intersects(box, c), `${name} panel overlaps ${sel}: ${JSON.stringify({ box, c })}`).toBe(false);
    }
    expect(box.y, `${name} panel starts above the viewport`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${name} panel runs past the viewport`).toBeLessThanOrEqual(viewport.height);
    expect(box.height, `${name} panel is too short to use`).toBeGreaterThanOrEqual(MIN_USABLE_HEIGHT);
    // The scroll body is a flex child: it only gets height if the panel's own
    // height is definite. Insets alone must still give it room to scroll in.
    const bodyHeight = await panel.locator(".drawer-scroll-body").first().evaluate((e) => e.clientHeight);
    expect(bodyHeight, `${name} panel scroll body collapsed`).toBeGreaterThan(MIN_USABLE_HEIGHT / 2);

    await page.locator(`#${closeId}`).click();
    await expect(panel).not.toHaveClass(/panel--visible/);
  }
}

test.describe("flyout panels stay inside the chrome", () => {
  test.beforeEach(({}, info) => {
    // Layout does not depend on the GL backend; the hardware project would only
    // repeat the desktop run on a slower, GPU-gated runner.
    test.skip(info.project.name === "desktop-hardware-gl", "layout is renderer-independent");
  });

  for (const vp of DESKTOP_VIEWPORTS) {
    test(`desktop UA at ${vp.width}x${vp.height}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop-software-gl", "desktop viewport matrix");
      await page.setViewportSize(vp);
      await loadTrack(page);
      await assertPanelsInBounds(page);
    });
  }

  test("mobile device in portrait", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-software-gl", "mobile project only");
    await loadTrack(page);
    await assertPanelsInBounds(page);
  });
});

test.describe("the track timer", () => {
  test("reads elapsed / total in one place and advances without moving the transport", async ({ page }, info) => {
    test.skip(info.project.name === "desktop-hardware-gl", "layout is renderer-independent");
    // Long enough that the readout is still counting when it is read back.
    await loadTrack(page, 8);
    // The engine is ready once the orb mounts; the #player class can land first.
    await expect(page.locator("#anomaly canvas")).toBeVisible({ timeout: 30_000 });

    const readout = page.locator(".transport-row .time-readout");
    await expect(readout).toHaveCount(1);
    // Both halves live inside the one readout, left of the transport buttons.
    await expect(readout.locator("#currentTime")).toHaveCount(1);
    await expect(readout.locator("#duration")).toHaveText("00:08");
    const readoutBox = (await readout.boundingBox())!;
    const transportBefore = (await page.locator(".transport").boundingBox())!;
    expect(readoutBox.x + readoutBox.width).toBeLessThanOrEqual(transportBefore.x + 0.5);
    await expect(readout).toHaveText(/^\s*00:00\s*\/\s*00:08\s*$/);

    await startPlayback(page);
    const transportAfter = (await page.locator(".transport").boundingBox())!;
    expect(transportAfter.x, "the transport moved as the time changed").toBeCloseTo(transportBefore.x, 1);
    expect(transportAfter.width).toBeCloseTo(transportBefore.width, 1);
  });
});

test.describe("the Help route", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name === "desktop-hardware-gl", "layout is renderer-independent");
  });

  test("desktop has one visible Help trigger, in the dock", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-software-gl", "desktop layout");
    await loadTrack(page);
    await expect(page.locator("#helpBtn")).toBeHidden();
    await page.locator(".control-dock [data-help]").click();
    await expect(page.locator("#help-modal")).toBeVisible();
  });

  test("a phone, with no dock, still reaches Help from the corner button", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-software-gl", "mobile layout");
    await loadTrack(page);
    await expect(page.locator(".control-dock")).toBeHidden();
    await page.locator("#helpBtn").click();
    await expect(page.locator("#help-modal")).toBeVisible();
  });
});
