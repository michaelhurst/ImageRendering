/**
 * OR-01 through OR-08: EXIF Orientation
 *
 * Verifies EXIF orientation tags and correct raw pixel dimensions
 * for all 8 EXIF orientation variants.
 *
 * OR-01/OR-02 download images to parse EXIF tags.
 * OR-03 through OR-08 use gallery metadata (no download needed).
 */

import { test, expect } from "../helpers/test-fixtures";
import { getGalleryImages } from "../helpers/gallery-images";

const gallery = getGalleryImages();

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

// -----------------------------------------------------------------------
// OR-01: All orientation images have a valid EXIF orientation tag (1–8)
// -----------------------------------------------------------------------
for (const [, filename] of [...LANDSCAPE_IMAGES, ...PORTRAIT_IMAGES]) {
  test(`OR-01: ${filename} has valid EXIF orientation tag`, async () => {
    const exifr = require("exifr");
    const buf = await gallery.fetchImage(filename);
    const exif = await exifr.parse(buf, {
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
    const buf = await gallery.fetchImage(filename);
    const exif = await exifr.parse(buf, {
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
    const info = await gallery.getImageInfo(filename);
    expect(info.OriginalWidth).toBeGreaterThan(0);
    expect(info.OriginalHeight).toBeGreaterThan(0);
  });
}

// -----------------------------------------------------------------------
// OR-04: Landscape orientation-1 (Normal) dimensions are width > height
// -----------------------------------------------------------------------
test("OR-04: Landscape_1-Normal.jpg has landscape aspect ratio", async () => {
  const info = await gallery.getImageInfo("Landscape_1-Normal.jpg");
  console.log(`Landscape normal: ${info.OriginalWidth}x${info.OriginalHeight}`);
  expect(info.OriginalWidth).toBeGreaterThan(info.OriginalHeight);
});

// -----------------------------------------------------------------------
// OR-05: Portrait orientation-1 (Normal) dimensions are height > width
// -----------------------------------------------------------------------
test("OR-05: Portrait_1-Normal.jpg has portrait aspect ratio", async () => {
  const info = await gallery.getImageInfo("Portrait_1-Normal.jpg");
  console.log(`Portrait normal: ${info.OriginalWidth}x${info.OriginalHeight}`);
  expect(info.OriginalHeight).toBeGreaterThan(info.OriginalWidth);
});

// -----------------------------------------------------------------------
// OR-06: Dedicated 6000x4000 Landscape_6 variant has expected dimensions
// -----------------------------------------------------------------------
test("OR-06: Landscape_6 (6000x4000 variant) has expected dimensions", async () => {
  const info = await gallery.getImageInfo(
    "c-Landscape_6-Rotated-90-CW-6000x4000.jpg",
  );
  console.log(
    `Landscape_6 (6000x4000): ${info.OriginalWidth}x${info.OriginalHeight}`,
  );
  expect(info.OriginalWidth).toBe(6000);
  expect(info.OriginalHeight).toBe(4000);
});

// -----------------------------------------------------------------------
// OR-07: Orientation 3 (180°) has same raw dimensions as orientation 1
// -----------------------------------------------------------------------
test("OR-07: Landscape_3 (180°) has same dimensions as Landscape_1", async () => {
  const [info1, info3] = await Promise.all([
    gallery.getImageInfo("Landscape_1-Normal.jpg"),
    gallery.getImageInfo("Landscape_3-Rotated-180.jpg"),
  ]);
  expect(info3.OriginalWidth).toBe(info1.OriginalWidth);
  expect(info3.OriginalHeight).toBe(info1.OriginalHeight);
});

// -----------------------------------------------------------------------
// OR-08: Reference images have valid dimensions and are readable
// -----------------------------------------------------------------------
test("OR-08: Orientation reference images are valid", async () => {
  const refFiles = [
    "Landscape_orientation-reference.jpg",
    "Portrait-orientation-reference.jpg",
  ];
  for (const filename of refFiles) {
    const info = await gallery.getImageInfo(filename);
    expect(info.OriginalWidth).toBeGreaterThan(0);
    expect(info.OriginalHeight).toBeGreaterThan(0);
    console.log(`${filename}: ${info.OriginalWidth}x${info.OriginalHeight}`);
  }
});
