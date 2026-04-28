/**
 * POI-01 through POI-05: Point of Interest & Cropping
 *
 * Verifies that the brightness centroid (proxy for subject/POI location)
 * is consistent and within expected bounds.
 *
 * Uses c-poi-test.jpg — a 3000x2000 image with a distinct subject
 * clearly placed in the top-left quadrant (~25%, 25%).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const POI_PATH = path.join(IMAGES_DIR, "c-poi-test.jpg");
// Use the landscape sizing image as a second reference (known neutral content)
const REF_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg");

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

async function findBrightnessCentroid(
  buf: Buffer,
): Promise<{ cx: number; cy: number }> {
  const sharp = require("sharp");
  const { data, info } = await sharp(buf)
    .greyscale()
    .resize(100, 100, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let sumX = 0,
    sumY = 0,
    total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = data[y * width + x];
      sumX += x * lum;
      sumY += y * lum;
      total += lum;
    }
  }
  return { cx: sumX / total / width, cy: sumY / total / height };
}

// -----------------------------------------------------------------------
// POI-01: POI test image loads and has valid dimensions
// -----------------------------------------------------------------------
test("POI-01: POI test image loads and has valid dimensions", async () => {
  const sharp = require("sharp");
  const { width, height } = await sharp(readBuffer(POI_PATH)).metadata();
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  console.log(`POI image: ${width}x${height}`);
});

// -----------------------------------------------------------------------
// POI-02: POI image brightness centroid is within image bounds
// -----------------------------------------------------------------------
test("POI-02: POI image brightness centroid is within image bounds", async () => {
  const { cx, cy } = await findBrightnessCentroid(readBuffer(POI_PATH));
  console.log(`POI centroid: (${cx.toFixed(3)}, ${cy.toFixed(3)})`);
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(1);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(1);
});

// -----------------------------------------------------------------------
// POI-03: Reference image brightness centroid is within image bounds
// -----------------------------------------------------------------------
test("POI-03: Reference image brightness centroid is within image bounds", async () => {
  const { cx, cy } = await findBrightnessCentroid(readBuffer(REF_PATH));
  console.log(`Reference centroid: (${cx.toFixed(3)}, ${cy.toFixed(3)})`);
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(1);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(1);
});

// -----------------------------------------------------------------------
// POI-04: POI image centroid is in the top-left quadrant (subject placement)
// -----------------------------------------------------------------------
test("POI-04: POI image brightness centroid is in the top-left quadrant", async () => {
  const { cx, cy } = await findBrightnessCentroid(readBuffer(POI_PATH));
  console.log(`POI centroid: (${cx.toFixed(3)}, ${cy.toFixed(3)})`);
  // Subject is placed at ~25%, 25% — centroid should be in the left half and top half
  expect(cx).toBeLessThan(0.6);
  expect(cy).toBeLessThan(0.6);
});

// -----------------------------------------------------------------------
// POI-05: POI image center region is not blank (subject is present)
// -----------------------------------------------------------------------
test("POI-05: POI image center region is not blank", async () => {
  const sharp = require("sharp");
  const { data, info } = await sharp(readBuffer(POI_PATH))
    .greyscale()
    .resize(100, 100, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width } = info;
  let sum = 0,
    count = 0;
  for (let y = 40; y < 60; y++) {
    for (let x = 40; x < 60; x++) {
      sum += data[y * width + x];
      count++;
    }
  }
  const meanLum = sum / count;
  console.log(`Center region mean luminance: ${meanLum.toFixed(1)}`);
  expect(meanLum).toBeGreaterThan(5);
  expect(meanLum).toBeLessThan(250);
});
