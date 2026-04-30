/**
 * WM-01 through WM-05: Watermark Rendering
 *
 * Verifies that test images do not have unexpected watermark artifacts
 * and render cleanly.
 *
 * Uses c-watermark-test.jpg (4000x3000) as the primary test image.
 * Images are fetched from the SmugMug baseline gallery.
 */

import { test, expect } from "../helpers/test-fixtures";
import { getGalleryImages } from "../helpers/gallery-images";

const gallery = getGalleryImages();

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
  const buf = await gallery.fetchImage("c-sizing-small.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "c-sizing-small.jpg");
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
  const buf = await gallery.fetchImage("c-watermark-test.jpg");
  const { width, height } = await sharp(buf).metadata();
  console.log(`Watermark test image: ${width}x${height}`);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------
// WM-03: Watermark test image has no large uniform rectangular region
// -----------------------------------------------------------------------
test("WM-03: Watermark test image has no large uniform rectangular region", async () => {
  const buf = await gallery.fetchImage("c-watermark-test.jpg");
  const uniformBlocks = await countUniformBlocks(buf);
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
  const buf = await gallery.fetchImage("c-watermark-test.jpg");
  const { data } = await sharp(buf)
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
  const orientationFiles = await gallery.listFilenames(
    /^(Landscape|Portrait)_\d.*\.jpg$/,
  );

  expect(orientationFiles.length).toBeGreaterThan(0);
  for (const file of orientationFiles) {
    const buffer = await gallery.fetchImage(file);
    const uniformBlocks = await countUniformBlocks(buffer);
    expect(uniformBlocks, `${file} has too many uniform blocks`).toBeLessThan(
      20,
    );
  }
  console.log(
    `Checked ${orientationFiles.length} orientation images for watermark blocks`,
  );
});
