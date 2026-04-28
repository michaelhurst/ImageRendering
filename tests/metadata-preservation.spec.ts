/**
 * MP-01 through MP-10: Metadata Preservation
 *
 * Verifies that key EXIF/IPTC metadata fields are present and consistent
 * in local test images. Uses metadata-rich.jpg as the reference source.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const RICH_PATH = path.join(IMAGES_DIR, "metadata-rich.jpg");
const IPTC_PATH = path.join(IMAGES_DIR, "metadata-iptc.jpg");
const STRIPPED_PATH = path.join(IMAGES_DIR, "metadata-stripped.jpg");

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

// -----------------------------------------------------------------------
// MP-01: Camera make is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-01: Camera make is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), { pick: ["Make"] });
  expect(exif?.Make).toBeTruthy();
  console.log(`Make: ${exif?.Make}`);
});

// -----------------------------------------------------------------------
// MP-02: Camera model is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-02: Camera model is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), { pick: ["Model"] });
  expect(exif?.Model).toBeTruthy();
  console.log(`Model: ${exif?.Model}`);
});

// -----------------------------------------------------------------------
// MP-03: Exposure time is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-03: Exposure time is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), {
    pick: ["ExposureTime"],
  });
  expect(exif?.ExposureTime).toBeDefined();
  expect(exif?.ExposureTime).toBeGreaterThan(0);
  console.log(`ExposureTime: ${exif?.ExposureTime}`);
});

// -----------------------------------------------------------------------
// MP-04: Aperture (FNumber) is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-04: Aperture (FNumber) is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), { pick: ["FNumber"] });
  expect(exif?.FNumber).toBeDefined();
  expect(exif?.FNumber).toBeGreaterThan(0);
  console.log(`FNumber: ${exif?.FNumber}`);
});

// -----------------------------------------------------------------------
// MP-05: ISO is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-05: ISO is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), {
    pick: ["ISO", "ISOSpeedRatings"],
  });
  const hasISO = exif?.ISO !== undefined || exif?.ISOSpeedRatings !== undefined;
  expect(hasISO).toBe(true);
  console.log(`ISO: ${exif?.ISO ?? exif?.ISOSpeedRatings}`);
});

// -----------------------------------------------------------------------
// MP-06: Focal length is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-06: Focal length is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), {
    pick: ["FocalLength"],
  });
  expect(exif?.FocalLength).toBeDefined();
  expect(exif?.FocalLength).toBeGreaterThan(0);
  console.log(`FocalLength: ${exif?.FocalLength}`);
});

// -----------------------------------------------------------------------
// MP-07: DateTimeOriginal is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-07: DateTimeOriginal is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(RICH_PATH), {
    pick: ["DateTimeOriginal"],
  });
  expect(exif?.DateTimeOriginal).toBeDefined();
  const d = new Date(exif.DateTimeOriginal);
  expect(isNaN(d.getTime())).toBe(false);
  console.log(`DateTimeOriginal: ${d.toISOString()}`);
});

// -----------------------------------------------------------------------
// MP-08: metadata-stripped.jpg has no camera EXIF fields
// -----------------------------------------------------------------------
test("MP-08: metadata-stripped.jpg has no camera EXIF fields", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(STRIPPED_PATH), {
    pick: ["Make", "Model", "ISO", "FNumber", "ExposureTime"],
  });
  const present = ["Make", "Model", "ISO", "FNumber", "ExposureTime"].filter(
    (f) => exif?.[f] !== undefined,
  );
  console.log("Fields present in stripped:", present.join(", ") || "none");
  expect(present).toHaveLength(0);
});

// -----------------------------------------------------------------------
// MP-09: metadata-iptc.jpg has IPTC data
// -----------------------------------------------------------------------
test("MP-09: metadata-iptc.jpg has IPTC metadata present", async () => {
  const exifr = require("exifr");
  const data = await exifr.parse(readBuffer(IPTC_PATH), {
    iptc: true,
    all: true,
  });
  expect(data).not.toBeNull();
  expect(Object.keys(data || {}).length).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------
// MP-10: All orientation test images are valid JPEGs with positive dimensions
// -----------------------------------------------------------------------
test("MP-10: All orientation test images are valid and readable", async () => {
  const sharp = require("sharp");
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => /^(Landscape|Portrait)_\d/.test(f) && f.endsWith(".jpg"));

  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const buf = fs.readFileSync(path.join(IMAGES_DIR, file));
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    const { width, height } = await sharp(buf).metadata();
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  }
  console.log(`Verified ${files.length} orientation test images`);
});
