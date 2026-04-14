/**
 * MP-01 through MP-10: Metadata Preservation
 *
 * Verifies that the candidate image preserves key EXIF/IPTC metadata
 * fields compared to the baseline (production) image.
 *
 * Images are fetched directly from CDN URLs:
 *   BASELINE_URL — production smugmug.com image (ground truth)
 *   CANDIDATE_URL — inside.smugmug.net image under test
 */

import { test, expect } from "@playwright/test";
import * as https from "https";

const BASELINE_URL =
  "https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg";
const CANDIDATE_URL =
  "https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg";

function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

// -----------------------------------------------------------------------
// MP-01: Camera make preserved
// -----------------------------------------------------------------------
test("MP-01: Camera make preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["Make"] }),
    exifr.parse(candidateBuffer, { pick: ["Make"] }),
  ]);
  if (bExif?.Make) {
    expect(cExif?.Make).toBe(bExif.Make);
  }
});

// -----------------------------------------------------------------------
// MP-02: Camera model preserved
// -----------------------------------------------------------------------
test("MP-02: Camera model preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["Model"] }),
    exifr.parse(candidateBuffer, { pick: ["Model"] }),
  ]);
  if (bExif?.Model) {
    expect(cExif?.Model).toBe(bExif.Model);
  }
});

// -----------------------------------------------------------------------
// MP-03: Exposure time preserved
// -----------------------------------------------------------------------
test("MP-03: Exposure time preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["ExposureTime"] }),
    exifr.parse(candidateBuffer, { pick: ["ExposureTime"] }),
  ]);
  if (bExif?.ExposureTime !== undefined) {
    expect(cExif?.ExposureTime).toBeCloseTo(bExif.ExposureTime, 5);
  }
});

// -----------------------------------------------------------------------
// MP-04: Aperture (FNumber) preserved
// -----------------------------------------------------------------------
test("MP-04: Aperture (FNumber) preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["FNumber"] }),
    exifr.parse(candidateBuffer, { pick: ["FNumber"] }),
  ]);
  if (bExif?.FNumber !== undefined) {
    expect(cExif?.FNumber).toBeCloseTo(bExif.FNumber, 2);
  }
});

// -----------------------------------------------------------------------
// MP-05: ISO preserved
// -----------------------------------------------------------------------
test("MP-05: ISO preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["ISO"] }),
    exifr.parse(candidateBuffer, { pick: ["ISO"] }),
  ]);
  if (bExif?.ISO !== undefined) {
    expect(cExif?.ISO).toBe(bExif.ISO);
  }
});

// -----------------------------------------------------------------------
// MP-06: Focal length preserved
// -----------------------------------------------------------------------
test("MP-06: Focal length preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["FocalLength"] }),
    exifr.parse(candidateBuffer, { pick: ["FocalLength"] }),
  ]);
  if (bExif?.FocalLength !== undefined) {
    expect(cExif?.FocalLength).toBeCloseTo(bExif.FocalLength, 1);
  }
});

// -----------------------------------------------------------------------
// MP-07: DateTimeOriginal preserved
// -----------------------------------------------------------------------
test("MP-07: DateTimeOriginal preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["DateTimeOriginal"] }),
    exifr.parse(candidateBuffer, { pick: ["DateTimeOriginal"] }),
  ]);
  if (bExif?.DateTimeOriginal) {
    const bDate = new Date(bExif.DateTimeOriginal).toISOString().slice(0, 19);
    const cDate = new Date(cExif?.DateTimeOriginal).toISOString().slice(0, 19);
    expect(cDate).toBe(bDate);
  }
});

// -----------------------------------------------------------------------
// MP-08: GPS coordinates preserved
// -----------------------------------------------------------------------
test("MP-08: GPS coordinates preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { gps: true }),
    exifr.parse(candidateBuffer, { gps: true }),
  ]);
  if (bExif?.latitude !== undefined) {
    expect(cExif?.latitude).toBeCloseTo(bExif.latitude, 4);
    expect(cExif?.longitude).toBeCloseTo(bExif.longitude, 4);
  }
});

// -----------------------------------------------------------------------
// MP-09: Copyright field preserved
// -----------------------------------------------------------------------
test("MP-09: Copyright field preserved in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["Copyright"] }),
    exifr.parse(candidateBuffer, { pick: ["Copyright"] }),
  ]);
  if (bExif?.Copyright) {
    expect(cExif?.Copyright).toBe(bExif.Copyright);
  }
});

// -----------------------------------------------------------------------
// MP-10: All baseline EXIF fields present in candidate
// -----------------------------------------------------------------------
test("MP-10: All baseline EXIF fields are present in candidate", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { all: true }),
    exifr.parse(candidateBuffer, { all: true }),
  ]);

  const missing: string[] = [];
  for (const key of Object.keys(bExif ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(cExif, key)) {
      missing.push(key);
    }
  }

  if (missing.length > 0)
    console.log("Missing EXIF fields in candidate:", missing.join(", "));
  expect(
    missing,
    `${missing.length} EXIF field(s) missing from candidate`,
  ).toHaveLength(0);
});
