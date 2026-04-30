/**
 * MP-01 through MP-10: Metadata Preservation
 *
 * Verifies that key EXIF/IPTC metadata fields are present and consistent
 * in images from the SmugMug baseline gallery.
 * Uses metadata-rich.jpg as the reference source.
 */

import { test, expect } from "../helpers/test-fixtures";
import { getGalleryImages } from "../helpers/gallery-images";

const gallery = getGalleryImages();

// -----------------------------------------------------------------------
// MP-01: Camera make is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-01: Camera make is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["Make"] });
  expect(exif?.Make).toBeTruthy();
  console.log(`Make: ${exif?.Make}`);
});

// -----------------------------------------------------------------------
// MP-02: Camera model is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-02: Camera model is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["Model"] });
  expect(exif?.Model).toBeTruthy();
  console.log(`Model: ${exif?.Model}`);
});

// -----------------------------------------------------------------------
// MP-03: Exposure time is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-03: Exposure time is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["ExposureTime"] });
  expect(exif?.ExposureTime).toBeDefined();
  expect(exif?.ExposureTime).toBeGreaterThan(0);
  console.log(`ExposureTime: ${exif?.ExposureTime}`);
});

// -----------------------------------------------------------------------
// MP-04: Aperture (FNumber) is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-04: Aperture (FNumber) is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["FNumber"] });
  expect(exif?.FNumber).toBeDefined();
  expect(exif?.FNumber).toBeGreaterThan(0);
  console.log(`FNumber: ${exif?.FNumber}`);
});

// -----------------------------------------------------------------------
// MP-05: ISO is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-05: ISO is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, {
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
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["FocalLength"] });
  expect(exif?.FocalLength).toBeDefined();
  expect(exif?.FocalLength).toBeGreaterThan(0);
  console.log(`FocalLength: ${exif?.FocalLength}`);
});

// -----------------------------------------------------------------------
// MP-07: DateTimeOriginal is present in metadata-rich.jpg
// -----------------------------------------------------------------------
test("MP-07: DateTimeOriginal is present in metadata-rich.jpg", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["DateTimeOriginal"] });
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
  const buf = await gallery.fetchImage("metadata-stripped.jpg");
  const exif = await exifr.parse(buf, {
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
  const buf = await gallery.fetchImage("metadata-iptc.jpg");
  const data = await exifr.parse(buf, {
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
  const orientationFiles = await gallery.listFilenames(
    /^(Landscape|Portrait)_\d.*\.jpg$/,
  );

  expect(orientationFiles.length).toBeGreaterThan(0);
  for (const file of orientationFiles) {
    const buf = await gallery.fetchImage(file);
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    const { width, height } = await sharp(buf).metadata();
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  }
  console.log(`Verified ${orientationFiles.length} orientation test images`);
});
