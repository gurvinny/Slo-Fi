/**
 * Shared browser-QA helpers.
 * Author: gurvinny
 */
import { PNG } from "pngjs";
import type { Page, Locator } from "@playwright/test";

export type PageFaults = {
  consoleErrors: string[];
  pageErrors: string[];
  contextLost: boolean;
};

/**
 * Attach listeners for the failure modes that matter here: console errors,
 * uncaught exceptions, and WebGL context loss. Context loss is the signature
 * of the GPU budget being blown -- the canvas goes white and stays white.
 */
export function watchForFaults(page: Page): PageFaults {
  const faults: PageFaults = { consoleErrors: [], pageErrors: [], contextLost: false };

  page.on("console", (msg) => {
    if (msg.type() === "error") faults.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => faults.pageErrors.push(String(err)));

  // Set before any app script runs, so a loss during first paint is caught.
  page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__contextLost = false;
    window.addEventListener(
      "webglcontextlost",
      () => {
        (window as unknown as Record<string, unknown>).__contextLost = true;
      },
      true,
    );
  });

  return faults;
}

export async function readContextLost(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__contextLost === true,
  );
}

/**
 * Ignore noise that says nothing about whether rendering works: a missing
 * favicon, or the API being absent in a static preview.
 */
export function isMeaningfulError(text: string): boolean {
  const benign = [
    /favicon/i,
    /Failed to load resource.*404/i,
    /ERR_CONNECTION_REFUSED/i,
    /net::ERR_/i,
    /Download the React DevTools/i,
  ];
  return !benign.some((re) => re.test(text));
}

/**
 * Index of the first canvas that owns a WebGL context.
 *
 * Do NOT reach for `canvas` first-match: these apps mount decorative 2D
 * canvases (a starfield background, waveform strips) ahead of the 3D one in
 * the DOM, so the first canvas is usually the wrong one. Measuring it would
 * report a confident pass against something that is not the scene under test.
 *
 * Probing with getContext is safe here because every canvas on the page has
 * already been initialised; a 2D canvas simply answers null.
 */
export async function webglCanvasIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("canvas"));
    for (let i = 0; i < all.length; i++) {
      try {
        if (all[i].getContext("webgl2") || all[i].getContext("webgl")) return i;
      } catch {
        /* a 2D canvas can throw rather than return null */
      }
    }
    return -1;
  });
}

export type CanvasStats = { width: number; height: number; distinctColors: number; nonBlankRatio: number };

/**
 * Screenshot the canvas and measure how much of it is actually drawn.
 *
 * Reading pixels back through WebGL is unreliable without
 * preserveDrawingBuffer, so this goes through the compositor instead: what
 * Playwright captures is what a user would see.
 */
export async function measureCanvas(canvas: Locator): Promise<CanvasStats> {
  const buf = await canvas.screenshot();
  const png = PNG.sync.read(buf);
  const seen = new Set<number>();
  let nonBlank = 0;
  const total = png.width * png.height;

  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
    // Quantise to 5 bits per channel so gradient dithering does not inflate
    // the distinct-colour count into looking like real content.
    seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    if (a > 8 && r + g + b > 24) nonBlank++;
  }

  return {
    width: png.width,
    height: png.height,
    distinctColors: seen.size,
    nonBlankRatio: total ? nonBlank / total : 0,
  };
}

export type CanvasTint = { r: number; g: number; b: number; lit: number };

/**
 * Mean colour of the lit pixels on a canvas.
 *
 * A theme change cannot be verified by diffing screenshots: the orb animates
 * continuously, so two captures always differ and the comparison proves nothing
 * about the theme. Averaging the lit pixels collapses the animation out and
 * leaves the palette, which is what a theme actually controls.
 *
 * Dark pixels are excluded rather than averaged in -- the scene is mostly
 * background, and including it drags every theme toward the same near-black
 * mean.
 */
export async function measureTint(canvas: Locator): Promise<CanvasTint> {
  const buf = await canvas.screenshot();
  const png = PNG.sync.read(buf);
  let r = 0, g = 0, b = 0, lit = 0;

  for (let i = 0; i < png.data.length; i += 4) {
    const pr = png.data[i], pg = png.data[i + 1], pb = png.data[i + 2];
    if (pr + pg + pb < 90) continue;
    r += pr; g += pg; b += pb; lit++;
  }

  return lit === 0
    ? { r: 0, g: 0, b: 0, lit: 0 }
    : { r: r / lit, g: g / lit, b: b / lit, lit };
}

/**
 * How warm the lit pixels are: red share minus blue share, in [-1, 1].
 *
 * Themes here are separated mainly along that axis -- meridian and neon are
 * cyan-blue, ember is red-orange -- so one scalar is enough to tell a real
 * palette swap from render noise, and it is far more stable frame to frame than
 * any per-pixel comparison.
 */
export function warmth(t: CanvasTint): number {
  const sum = t.r + t.g + t.b;
  return sum === 0 ? 0 : (t.r - t.b) / sum;
}

/** Requests that failed outright -- a dead code-split chunk shows up here. */
export function watchForFailedRequests(page: Page): string[] {
  const failed: string[] = [];
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()}`));
  page.on("response", (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });
  return failed;
}

/**
 * Skip the first-visit splash sequence. Must be called before `page.goto`.
 *
 * The splash is a full-screen overlay that is only dismissed by a click on its
 * CTA (desktop) or a touch anywhere (mobile). It carries `aria-hidden="true"`
 * but no `pointer-events: none`, so until it is dismissed it silently
 * intercepts every click aimed at the dock or the drawers underneath -- a test
 * that only loads a track and then clicks a control waits out its whole timeout
 * against an overlay it never mentions.
 *
 * Seeding the visited flag sends SplashController down its returning-visitor
 * path, which collapses and removes itself after 280ms with no interaction.
 * addInitScript rather than evaluate, because the flag has to exist before the
 * page's own scripts read it -- including after a reload.
 */
export async function skipSplash(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { localStorage.setItem("sf_visited", "1"); } catch { /* opaque origin */ }
  });
}

/**
 * Fraction of pixels that changed on a canvas over `ms`.
 *
 * Exists because **a WebGL canvas keeps its last painted pixels** after the
 * render loop stops. So "the canvas is not blank" cannot distinguish a running
 * renderer from a frozen stale frame — any assertion on a single capture passes
 * trivially on a scene that died a second ago. A mutation that removed the
 * `resume()` loop restart passed a `nonBlankRatio` check for exactly that reason.
 *
 * The orb rotates and drifts hue continuously, so a live renderer moves a
 * meaningful share of pixels between two captures and a frozen one moves none.
 */
export async function frameAdvance(
  page: Page,
  canvas: Locator,
  ms = 600,
): Promise<number> {
  const first = PNG.sync.read(await canvas.screenshot());
  await page.waitForTimeout(ms);
  const second = PNG.sync.read(await canvas.screenshot());

  if (first.width !== second.width || first.height !== second.height) return 1;

  let changed = 0;
  const total = first.width * first.height;
  for (let i = 0; i < first.data.length; i += 4) {
    // 6 per channel of slack so gradient dithering and 8-bit rounding do not
    // read as motion.
    if (
      Math.abs(first.data[i] - second.data[i]) > 6 ||
      Math.abs(first.data[i + 1] - second.data[i + 1]) > 6 ||
      Math.abs(first.data[i + 2] - second.data[i + 2]) > 6
    ) {
      changed++;
    }
  }
  return total ? changed / total : 0;
}

/**
 * The GL renderer string actually in use, or null when WebGL is unavailable.
 *
 * Read from WEBGL_debug_renderer_info on a throwaway canvas, so it reflects the
 * real backend rather than the flags that were requested.
 */
export async function glRenderer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ||
      c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "unknown";
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  });
}

/** True when the active backend is a software rasteriser rather than a GPU. */
export function isSoftwareRenderer(renderer: string | null): boolean {
  return (
    renderer === null ||
    renderer === "unknown" ||
    /swiftshader|software|llvmpipe|mesa offscreen/i.test(renderer)
  );
}

/**
 * Warmth sampled repeatedly across a window.
 *
 * One reading cannot characterise this scene. The orb orbits continuously, and
 * that changes the specular angle on whatever material is lit, so the mean
 * colour drifts over time even when the hue is locked — a monotonic trend, not
 * noise. A median suppresses noise and does nothing to a trend, which is why an
 * earlier attempt to stabilise a hue-lock assertion by taking medians over a
 * longer window made it strictly worse: the window let the trend accumulate.
 *
 * Returning every sample lets a caller compare the RANGE of one theme against
 * the range of another, so that shared drift cancels instead of being mistaken
 * for signal.
 */
export async function sampleWarmth(
  page: Page,
  canvas: Locator,
  samples = 10,
  gapMs = 3000,
): Promise<number[]> {
  const values: number[] = [];
  for (let i = 0; i < samples; i++) {
    if (i > 0) await page.waitForTimeout(gapMs);
    values.push(warmth(await measureTint(canvas)));
  }
  return values;
}
