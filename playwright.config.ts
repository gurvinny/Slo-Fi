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

export default defineConfig({
  testDir: "./tests/e2e",
  // WebGL under SwiftShader is slow to reach a first frame.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        // Force a working software GL stack on a GPU-less runner. Without
        // these Chromium reports no WebGL at all and the orb never mounts.
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-dev-shm-usage",
        // decodeAudioData and the analyser must work without a user gesture.
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/serve-dist.mjs dist`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
