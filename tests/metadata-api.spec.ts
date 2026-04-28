/**
 * MA-01 through MA-03: Metadata API Accuracy (Local)
 *
 * Verifies that EXIF metadata fields are correctly present in local
 * test images. Stripped/IPTC checks live in metadata-preservation.spec.ts.
 *
 *   BASELINE — metadata-rich.jpg (full EXIF)
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const BASELINE_PATH = path.join(IMAGES_DIR, "metadata-rich.jpg");

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

// -----------------------------------------------------------------------
// MA-01: metadata-rich.jpg EXIF contains required fields
// -----------------------------------------------------------------------
test("MA-01: metadata-rich.jpg EXIF contains required fields", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(BASELINE_PATH), { all: true });
  expect(exif).not.toBeNull();

  const requiredFields = [
    "Make",
    "Model",
    "ExposureTime",
    "FNumber",
    "FocalLength",
  ];
  const missing = requiredFields.filter((f) => exif?.[f] === undefined);
  if (missing.length) console.log("Missing fields:", missing.join(", "));
  expect(missing, `Missing EXIF fields: ${missing.join(", ")}`).toHaveLength(0);
});

// -----------------------------------------------------------------------
// MA-02: metadata-rich.jpg format is JPEG
// -----------------------------------------------------------------------
test("MA-02: metadata-rich.jpg image format is JPEG", async () => {
  const sharp = require("sharp");
  const { format } = await sharp(readBuffer(BASELINE_PATH)).metadata();
  expect(format).toBe("jpeg");
});

// -----------------------------------------------------------------------
// MA-03: metadata-rich.jpg EXIF DateTimeOriginal is a valid date
// -----------------------------------------------------------------------
test("MA-03: metadata-rich.jpg EXIF DateTimeOriginal is a valid date", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(BASELINE_PATH), {
    pick: ["DateTimeOriginal"],
  });
  if (exif?.DateTimeOriginal) {
    const d = new Date(exif.DateTimeOriginal);
    expect(isNaN(d.getTime())).toBe(false);
    expect(d.getFullYear()).toBeGreaterThan(1990);
  }
});
