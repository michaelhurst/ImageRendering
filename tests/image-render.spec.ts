/**
 * IR-01 through IR-13: Image Render at Multiple Size Tiers
 *
 * Verifies that the candidate image renders correctly in a browser
 * at each SmugMug size tier viewport. Uses c-sizing-landscape.jpg
 * (400KB, 6000x4000) as the test image — small enough for data URLs.
 *
 * Baseline screenshots are generated on first run and saved to
 * tests/baselines/. Delete a baseline PNG to regenerate it.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const BASELINE_DIR = path.join(__dirname, "baselines");

// Use the sizing landscape image — it's a known 6000x4000 JPEG, ~2MB, manageable as a data URL
const TEST_IMAGE_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg");

const viewports = [
  { name: "Ti", width: 100, height: 75 },
  { name: "Th", width: 150, height: 112 },
  { name: "S", width: 400, height: 300 },
  { name: "M", width: 600, height: 450 },
  { name: "L", width: 800, height: 600 },
  { name: "XL", width: 1024, height: 768 },
  { name: "X2", width: 1280, height: 960 },
  { name: "X3", width: 1600, height: 1200 },
  { name: "X4", width: 1920, height: 1440 },
  { name: "X5", width: 2048, height: 1536 },
  { name: "4K", width: 3840, height: 2160 },
  { name: "5K", width: 5120, height: 2880 },
  { name: "O", width: 1280, height: 720 },
];

function fileToDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function loadImage(page: any, dataUrl: string): Promise<void> {
  await page.setContent(
    `<html><body style="margin:0;padding:0;background:#000"><img id="img" src="${dataUrl}" style="max-width:100%;max-height:100vh;display:block"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });
}

// Cache the data URL — only read the file once across all tests
let _dataUrl: string | null = null;
function getDataUrl(): string {
  if (!_dataUrl) _dataUrl = fileToDataUrl(TEST_IMAGE_PATH);
  return _dataUrl;
}

for (const { name, width, height } of viewports) {
  // -----------------------------------------------------------------------
  // IR-xx: Image renders and is visible at each viewport size
  // -----------------------------------------------------------------------
  test(`IR: image renders and is visible at [${name}] ${width}x${height}`, async ({
    browser,
  }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await loadImage(page, getDataUrl());
      const loaded = await page.evaluate(
        () =>
          (document.getElementById("img") as HTMLImageElement).naturalWidth > 0,
      );
      expect(loaded).toBe(true);
    } finally {
      await page.close();
    }
  });

  // -----------------------------------------------------------------------
  // IR-xx: Screenshot matches saved baseline at each viewport size
  // -----------------------------------------------------------------------
  test(`IR: screenshot matches baseline at [${name}] ${width}x${height}`, async ({
    browser,
  }) => {
    const baselinePath = path.join(BASELINE_DIR, `baseline-${name}.png`);

    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await loadImage(page, getDataUrl());
      const screenshot = await page.locator("#img").screenshot();

      if (!fs.existsSync(baselinePath)) {
        fs.mkdirSync(BASELINE_DIR, { recursive: true });
        fs.writeFileSync(baselinePath, screenshot);
        console.log(`Baseline saved for [${name}]`);
        return; // First run — nothing to compare against yet
      }

      const baseline = fs.readFileSync(baselinePath);
      expect(screenshot).toEqual(baseline);
    } finally {
      await page.close();
    }
  });
}
