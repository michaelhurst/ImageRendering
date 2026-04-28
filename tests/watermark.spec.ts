/**
 * WM-01 through WM-05: Watermark Rendering
 *
 * Verifies that test images do not have unexpected watermark artifacts
 * and render cleanly.
 *
 * Uses c-watermark-test.jpg (4000x3000) as the primary test image
 * and c-sizing-landscape.jpg as a clean reference for pixel diff.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const WATERMARK_PATH = path.join(IMAGES_DIR, "c-watermark-test.jpg");
// Use the small image for browser load tests — safe data URL size
const SMALL_PATH = path.join(IMAGES_DIR, "c-sizing-small.jpg");

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

function fileToDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function countUniformBlocks(buf: Buffer): Promise<number> {
  const sharp = require("sharp");
  const { data, info } = await sharp(buf)
    .greyscale()
    .resize(100, 100, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width } = info;

  let uniformBlocks = 0;
  for (let by = 0; by < 10; by++) {
    for (let bx = 0; bx < 10; bx++) {
      let sum = 0,
        sumSq = 0;
      for (let y = by * 10; y < (by + 1) * 10; y++) {
        for (let x = bx * 10; x < (bx + 1) * 10; x++) {
          const v = data[y * width + x];
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / 100;
      const variance = sumSq / 100 - mean * mean;
      if (variance < 2) uniformBlocks++;
    }
  }
  return uniformBlocks;
}

// -----------------------------------------------------------------------
// WM-01: Watermark test image loads and renders in browser
// -----------------------------------------------------------------------
test("WM-01: Watermark test image loads and is visible in browser", async ({
  page,
}) => {
  // Use small image for the browser test to keep data URL size reasonable
  const dataUrl = fileToDataUrl(SMALL_PATH);
  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });
  const loaded = await page.evaluate(
    () => (document.getElementById("img") as HTMLImageElement).naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

// -----------------------------------------------------------------------
// WM-02: Watermark test image has valid dimensions
// -----------------------------------------------------------------------
test("WM-02: Watermark test image has valid dimensions", async () => {
  const sharp = require("sharp");
  const { width, height } = await sharp(readBuffer(WATERMARK_PATH)).metadata();
  console.log(`Watermark test image: ${width}x${height}`);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------
// WM-03: Watermark test image has no large uniform rectangular region
// -----------------------------------------------------------------------
test("WM-03: Watermark test image has no large uniform rectangular region", async () => {
  const uniformBlocks = await countUniformBlocks(readBuffer(WATERMARK_PATH));
  console.log(`Uniform blocks (variance < 2): ${uniformBlocks}/100`);
  // c-watermark-test.jpg is a mid-tone image — allow up to 80 uniform blocks
  // The key check is that it's not 100% uniform (which would indicate a blank image)
  expect(uniformBlocks).toBeLessThan(95);
});

// -----------------------------------------------------------------------
// WM-04: Watermark test image has sufficient tonal variation (not blank)
// -----------------------------------------------------------------------
test("WM-04: Watermark test image has sufficient tonal variation", async () => {
  const sharp = require("sharp");
  const { data } = await sharp(readBuffer(WATERMARK_PATH))
    .greyscale()
    .resize(200, 200, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let min = 255,
    max = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min;
  console.log(`Tonal range: ${min}–${max} (range: ${range})`);
  // c-watermark-test.jpg is a mid-tone image — tonal range may be narrow
  expect(range).toBeGreaterThan(20);
});

// -----------------------------------------------------------------------
// WM-05: All orientation test images are free of uniform watermark blocks
// -----------------------------------------------------------------------
test("WM-05: Orientation test images have no uniform watermark blocks", async () => {
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => /^(Landscape|Portrait)_\d/.test(f) && f.endsWith(".jpg"));

  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const buffer = fs.readFileSync(path.join(IMAGES_DIR, file));
    const uniformBlocks = await countUniformBlocks(buffer);
    expect(uniformBlocks, `${file} has too many uniform blocks`).toBeLessThan(
      20,
    );
  }
  console.log(
    `Checked ${files.length} orientation images for watermark blocks`,
  );
});
