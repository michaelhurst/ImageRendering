/**
 * SZ-01 through SZ-08: Image Dimensions & Sizing
 *
 * Verifies pixel dimensions, aspect ratio, and browser rendering
 * using dedicated sizing test images.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const LANDSCAPE_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg"); // 6000x4000
const PORTRAIT_PATH = path.join(IMAGES_DIR, "c-sizing-portrait.jpg"); // 4000x6000
const SQUARE_PATH = path.join(IMAGES_DIR, "c-sizing-square.jpg"); // 5000x5000
const PANORAMIC_PATH = path.join(IMAGES_DIR, "c-sizing-panoramic.jpg"); // 12000x2000
const TALL_PATH = path.join(IMAGES_DIR, "c-sizing-tall.jpg"); // 2000x10000
const SMALL_PATH = path.join(IMAGES_DIR, "c-sizing-small.jpg"); // 400x300

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

async function getDimensions(
  buf: Buffer,
): Promise<{ width: number; height: number }> {
  const sharp = require("sharp");
  const { width, height } = await sharp(buf).metadata();
  return { width: width!, height: height! };
}

function fileToDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

// -----------------------------------------------------------------------
// SZ-01: Landscape image has correct dimensions (6000x4000)
// -----------------------------------------------------------------------
test("SZ-01: Landscape image has correct dimensions", async () => {
  const { width, height } = await getDimensions(readBuffer(LANDSCAPE_PATH));
  console.log(`Landscape: ${width}x${height}`);
  expect(width).toBe(6000);
  expect(height).toBe(4000);
});

// -----------------------------------------------------------------------
// SZ-02: Portrait image has correct dimensions (4000x6000)
// -----------------------------------------------------------------------
test("SZ-02: Portrait image has correct dimensions", async () => {
  const { width, height } = await getDimensions(readBuffer(PORTRAIT_PATH));
  console.log(`Portrait: ${width}x${height}`);
  expect(width).toBe(4000);
  expect(height).toBe(6000);
});

// -----------------------------------------------------------------------
// SZ-03: Square image has equal width and height (5000x5000)
// -----------------------------------------------------------------------
test("SZ-03: Square image has equal width and height", async () => {
  const { width, height } = await getDimensions(readBuffer(SQUARE_PATH));
  console.log(`Square: ${width}x${height}`);
  expect(width).toBe(height);
  expect(width).toBe(5000);
});

// -----------------------------------------------------------------------
// SZ-04: Panoramic image has extreme landscape aspect ratio (12000x2000)
// -----------------------------------------------------------------------
test("SZ-04: Panoramic image has extreme landscape aspect ratio", async () => {
  const { width, height } = await getDimensions(readBuffer(PANORAMIC_PATH));
  console.log(
    `Panoramic: ${width}x${height}, ratio: ${(width / height).toFixed(2)}`,
  );
  expect(width).toBe(12000);
  expect(height).toBe(2000);
  expect(width / height).toBeGreaterThan(5);
});

// -----------------------------------------------------------------------
// SZ-05: Tall image has extreme portrait aspect ratio (2000x10000)
// -----------------------------------------------------------------------
test("SZ-05: Tall image has extreme portrait aspect ratio", async () => {
  const { width, height } = await getDimensions(readBuffer(TALL_PATH));
  console.log(
    `Tall: ${width}x${height}, ratio: ${(height / width).toFixed(2)}`,
  );
  expect(width).toBe(2000);
  expect(height).toBe(10000);
  expect(height / width).toBeGreaterThan(4);
});

// -----------------------------------------------------------------------
// SZ-06: Small image has correct dimensions (400x300)
// -----------------------------------------------------------------------
test("SZ-06: Small image has correct dimensions", async () => {
  const { width, height } = await getDimensions(readBuffer(SMALL_PATH));
  console.log(`Small: ${width}x${height}`);
  expect(width).toBe(400);
  expect(height).toBe(300);
});

// -----------------------------------------------------------------------
// SZ-07: Small image renders at correct natural dimensions in browser
// -----------------------------------------------------------------------
test("SZ-07: Small image renders at correct natural dimensions in browser", async ({
  page,
}) => {
  const { width: bufWidth, height: bufHeight } = await getDimensions(
    readBuffer(SMALL_PATH),
  );
  const dataUrl = fileToDataUrl(SMALL_PATH);

  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const dims = await page.evaluate(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return { width: el.naturalWidth, height: el.naturalHeight };
  });

  console.log(`Browser natural: ${dims.width}x${dims.height}`);
  expect(dims.width).toBe(bufWidth);
  expect(dims.height).toBe(bufHeight);
});
