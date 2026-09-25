/**
 * Playwright config — browser QA.
 * Author: gurvinny
 *
 * CI runners have no GPU, so Chromium falls back to SwiftShader (software
 * WebGL). That is deliberate: it is the weakest client the orb has to survive,
 * and it is where the renderer has historically failed.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Software GL. Without these Chromium reports no WebGL at all on a GPU-less
// host and the orb never mounts.
const SOFTWARE_GL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

// Ask for real hardware GL. Specs that care read the renderer back and skip when
// this silently falls back -- Chromium does not error, it just uses SwiftShader,
// and a project that claimed hardware coverage while running software would be
// exactly the kind of green check that proves nothing.
//
// `--use-angle=gl-egl` is load-bearing, not a synonym for `--use-angle=gl`.
// Measured on this host with /dev/dri passed through: `gl` returned the
// SwiftShader renderer string byte-for-byte identically to the software
// project, while `gl-egl` returned "ANGLE (Intel, Mesa Intel(R) UHD Graphics
// 770 (ADL-S GT1))". There is no X server here, so ANGLE's default GL backend
// finds no display and falls back silently; gl-egl selects Mesa's surfaceless
// EGL platform, which is the only one that initialises headless.
// `--ozone-platform=headless` was tested and changes nothing either way.
//
// The two software renderer strings are a useful diagnostic pair: "SwiftShader"
// means the FLAGS are wrong, "llvmpipe" means the flags are right and the
// process lacks read access to the render node (its group). isSoftwareRenderer
// matches both.
const HARDWARE_GL = [
  "--use-gl=angle",
  "--use-angle=gl-egl",
  "--ignore-gpu-blocklist",
  "--enable-gpu-rasterization",
];

const SHARED = ["--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"];

export default defineConfig({
  testDir: "./tests/e2e",
  // WebGL under SwiftShader is slow to reach a first frame, and several specs do
  // two full decode + detect + render cycles. 60s left no margin on a loaded
  // host: two tests timed out at 60s having already done most of their work,
  // then passed comfortably in 45-56s when given room.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // The orb is a different scene per environment, not one scene at different
  // sizes. AnomalySphere branches on a mobile UA regex (AnomalySphere.ts:778)
  // and that branch changes the geometry (icosahedron detail 4 vs 6), the
  // particle count, antialiasing, powerPreference, the pixel-ratio cap, the
  // bloom resolution, and drops the grain and glitch passes entirely. A
  // mobile-only shader or geometry failure is invisible to a desktop-only run.
  projects: [
    {
      name: "desktop-software-gl",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: [...SOFTWARE_GL, ...SHARED] },
      },
    },
    {
      name: "mobile-software-gl",
      use: {
        // Pixel 5 supplies the mobile UA the renderer actually branches on, so
        // the mobile path is entered for real rather than stubbed.
        ...devices["Pixel 5"],
        launchOptions: { args: [...SOFTWARE_GL, ...SHARED] },
      },
    },
    {
      name: "desktop-hardware-gl",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: [...HARDWARE_GL, ...SHARED] },
      },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs dist`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
