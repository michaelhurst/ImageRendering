/**
 * OR-01 through OR-08: EXIF Orientation
 *
 * Verifies EXIF orientation tags and correct raw pixel dimensions
 * for all 8 EXIF orientation variants.
 *
 * All orientation images live directly in TEST_IMAGES_DIR (no subfolder).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");

const LANDSCAPE_IMAGES: [number, string][] = [
  [1, "Landscape_1-Normal.jpg"],
  [2, "Landscape_2-Mirrored-horizontal.jpg"],
  [3, "Landscape_3-Rotated-180.jpg"],
  [4, "Landscape_4-Mirrored-vertical.jpg"],
  [5, "Landscape_5-Mirrored-horizontal-rotated-270-CW.jpg"],
  [6, "Landscape_6-Rotated-90-CW.jpg"],
  [7, "Landscape_7-Mirrored-horizontal-rotated-90-CW.jpg"],
  [8, "Landscape_8-Rotated-270-CW.jpg"],
];

const PORTRAIT_IMAGES: [number, string][] = [
  [1, "Portrait_1-Normal.jpg"],
  [2, "Portrait_2-Mirrored-horizontal.jpg"],
  [3, "Portrait_3-Rotated-180.jpg"],
  [4, "Portrait_4-Mirrored-vertical.jpg"],
  [5, "Portrait_5-Mirrored-horizontal-rotated-270-CW.jpg"],
  [6, "Portrait_6-Rotated-90-CW.jpg"],
  [7, "Portrait_7-Mirrored-horizontal-rotated-90-CW.jpg"],
  [8, "Portrait_8-Rotated-270-CW.jpg"],
];

const REFERENCE_LANDSCAPE = path.join(
  IMAGES_DIR,
  "Landscape_orientation-reference.jpg",
);
const REFERENCE_PORTRAIT = path.join(
  IMAGES_DIR,
  "Portrait-orientation-reference.jpg",
);

function readBuffer(filename: string): Buffer {
  return fs.readFileSync(path.join(IMAGES_DIR, filename));
}

// -----------------------------------------------------------------------
// OR-01: All orientation images have a valid EXIF orientation tag (1–8)
// -----------------------------------------------------------------------
for (const [, filename] of [...LANDSCAPE_IMAGES, ...PORTRAIT_IMAGES]) {
  test(`OR-01: ${filename} has valid EXIF orientation tag`, async () => {
    const exifr = require("exifr");
    const exif = await exifr.parse(readBuffer(filename), {
      pick: ["Orientation"],
      translateValues: false,
    });
    const orientation = exif?.Orientation ?? 1;
    console.log(`${filename} orientation: ${orientation}`);
    expect(orientation).toBeGreaterThanOrEqual(1);
    expect(orientation).toBeLessThanOrEqual(8);
  });
}

// -----------------------------------------------------------------------
// OR-02: Each orientation image matches its expected tag value
// -----------------------------------------------------------------------
for (const [expectedTag, filename] of [
  ...LANDSCAPE_IMAGES,
  ...PORTRAIT_IMAGES,
]) {
  test(`OR-02: ${filename} has expected orientation tag ${expectedTag}`, async () => {
    const exifr = require("exifr");
    const exif = await exifr.parse(readBuffer(filename), {
      pick: ["Orientation"],
      translateValues: false,
    });
    const orientation = exif?.Orientation ?? 1;
    expect(orientation).toBe(expectedTag);
  });
}

// -----------------------------------------------------------------------
// OR-03: All orientation images have positive dimensions
// -----------------------------------------------------------------------
for (const [, filename] of [...LANDSCAPE_IMAGES, ...PORTRAIT_IMAGES]) {
  test(`OR-03: ${filename} has valid non-zero dimensions`, async () => {
    const sharp = require("sharp");
    const { width, height } = await sharp(readBuffer(filename)).metadata();
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
}

// -----------------------------------------------------------------------
// OR-04: Landscape orientation-1 (Normal) dimensions are width > height
// -----------------------------------------------------------------------
test("OR-04: Landscape_1-Normal.jpg has landscape aspect ratio", async () => {
  const sharp = require("sharp");
  const { width, height } = await sharp(
    readBuffer("Landscape_1-Normal.jpg"),
  ).metadata();
  console.log(`Landscape normal: ${width}x${height}`);
  expect(width).toBeGreaterThan(height);
});

// -----------------------------------------------------------------------
// OR-05: Portrait orientation-1 (Normal) dimensions are height > width
// -----------------------------------------------------------------------
test("OR-05: Portrait_1-Normal.jpg has portrait aspect ratio", async () => {
  const sharp = require("sharp");
  const { width, height } = await sharp(
    readBuffer("Portrait_1-Normal.jpg"),
  ).metadata();
  console.log(`Portrait normal: ${width}x${height}`);
  expect(height).toBeGreaterThan(width);
});

// -----------------------------------------------------------------------
// OR-06: Dedicated 6000x4000 Landscape_6 variant has expected dimensions
// -----------------------------------------------------------------------
test("OR-06: Landscape_6 (6000x4000 variant) has expected dimensions", async () => {
  const sharp = require("sharp");
  const orient6Path = path.join(
    IMAGES_DIR,
    "c-Landscape_6-Rotated-90-CW-6000x4000.jpg",
  );
  const meta6 = await sharp(fs.readFileSync(orient6Path)).metadata();
  console.log(`Landscape_6 (6000x4000): ${meta6.width}x${meta6.height}`);
  expect(meta6.width).toBe(6000);
  expect(meta6.height).toBe(4000);
});

// -----------------------------------------------------------------------
// OR-07: Orientation 3 (180°) has same raw dimensions as orientation 1
// -----------------------------------------------------------------------
test("OR-07: Landscape_3 (180°) has same dimensions as Landscape_1", async () => {
  const sharp = require("sharp");
  const [meta1, meta3] = await Promise.all([
    sharp(readBuffer("Landscape_1-Normal.jpg")).metadata(),
    sharp(readBuffer("Landscape_3-Rotated-180.jpg")).metadata(),
  ]);
  expect(meta3.width).toBe(meta1.width);
  expect(meta3.height).toBe(meta1.height);
});

// -----------------------------------------------------------------------
// OR-08: Reference images have valid dimensions and are readable
// -----------------------------------------------------------------------
test("OR-08: Orientation reference images are valid", async () => {
  const sharp = require("sharp");
  for (const refPath of [REFERENCE_LANDSCAPE, REFERENCE_PORTRAIT]) {
    const { width, height } = await sharp(fs.readFileSync(refPath)).metadata();
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    console.log(`${path.basename(refPath)}: ${width}x${height}`);
  }
});
