import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config();

const ENVIRONMENT = process.env.ENVIRONMENT;
if (!ENVIRONMENT || !["inside", "production"].includes(ENVIRONMENT)) {
  throw new Error(
    `ENVIRONMENT must be set to "inside" or "production". Got: "${ENVIRONMENT ?? ""}".\n` +
      "Set it in your .env file or pass it on the command line:\n" +
      "  ENVIRONMENT=inside pnpm exec playwright test\n" +
      "  ENVIRONMENT=production pnpm exec playwright test",
  );
}

const BASE_URL =
  ENVIRONMENT === "production"
    ? "https://www.smugmug.com"
    : "https://inside.smugmug.net";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./helpers/global-setup.ts",
  fullyParallel: false, // Many tests share upload state; run serially by default
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html"], ["list"]],
  timeout: 180_000, // 3 min per test — uploads, CDN propagation, and tier generation can be slow

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",

    // HTTP Basic Auth for inside environment
    httpCredentials:
      ENVIRONMENT === "inside"
        ? {
            username: process.env.INSIDE_AUTH_USER || "",
            password: process.env.INSIDE_AUTH_PASS || "",
          }
        : undefined,
  },

  projects: [
    {
      name: "api-tests",
      // Only non-redundant local tests are enabled here.
      // The following were disabled because they duplicate what the
      // smugmug-api-tests project already covers against the live pipeline:
      //   image-quality.spec.ts    → covered by IQ-01 through IQ-10
      //   image-sizing.spec.ts     → covered by SZ-01 through SZ-11
      //   exif-orientation.spec.ts → covered by OR-01 through OR-12
      //   metadata-preservation.spec.ts → covered by MP-01 through MP-14
      //   metadata-api.spec.ts     → covered by MA-01 through MA-07
      //   point-of-interest.spec.ts → covered by POI-01 through POI-05
      //   watermark.spec.ts        → covered by WM-01 through WM-05
      //   resolution-cap.spec.ts   → covered by RC-01 through RC-04
      // These local tests validated source files or a pre-uploaded baseline
      // gallery, which is less thorough than the API tests that upload fresh
      // each run. Re-enable if local-only validation is needed without
      // SmugMug credentials.
      testMatch: ["image-render.spec.ts", "color-accuracy.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ui-tests",
      // Disabled: covered by smugmug-ui-tests (api-metadata-display.spec.ts)
      // which tests the same Lightbox behavior with fresh uploads.
      testMatch: [],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "smugmug-api-tests",
      testMatch: [
        "api-image-quality.spec.ts",
        "api-image-sizing.spec.ts",
        "api-exif-orientation.spec.ts",
        "api-metadata-preservation.spec.ts",
        "api-metadata-api.spec.ts",
        "api-point-of-interest.spec.ts",
        "api-watermark.spec.ts",
        "api-resolution-cap.spec.ts",
        "api-text-overlay.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "smugmug-ui-tests",
      testMatch: ["api-metadata-display.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
