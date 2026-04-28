import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config();

const ENVIRONMENT = process.env.ENVIRONMENT || "inside";
const BASE_URL =
  ENVIRONMENT === "production"
    ? "https://www.smugmug.com"
    : "https://inside.smugmug.net";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Many tests share upload state; run serially by default
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html"], ["list"]],
  timeout: 120_000, // 2 min per test — uploads and CDN propagation can be slow

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
      testMatch: [
        "image-render.spec.ts",
        "image-quality.spec.ts",
        "color-accuracy.spec.ts",
        "image-sizing.spec.ts",
        "exif-orientation.spec.ts",
        "metadata-preservation.spec.ts",
        "metadata-api.spec.ts",
        "point-of-interest.spec.ts",
        "watermark.spec.ts",
        "resolution-cap.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "ui-tests",
      testMatch: ["metadata-display.spec.ts"],
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
