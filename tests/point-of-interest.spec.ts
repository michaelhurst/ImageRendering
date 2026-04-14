/**
 * POI-01 through POI-05: Point of Interest & Cropping
 *
 * Verifies that the candidate image crop center is consistent with
 * the baseline — i.e., the subject of the image is in the same
 * relative position after processing.
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

// Find the brightest region centroid (proxy for subject/POI location)
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
// POI-01: Candidate image loads and has valid dimensions
// -----------------------------------------------------------------------
test("POI-01: Candidate image loads and has valid dimensions", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { width, height } = await sharp(buffer).metadata();
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------
// POI-02: Candidate brightness centroid is within image bounds
// -----------------------------------------------------------------------
test("POI-02: Candidate brightness centroid is within image bounds", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { cx, cy } = await findBrightnessCentroid(buffer);
  console.log(
    `Candidate brightness centroid: (${cx.toFixed(3)}, ${cy.toFixed(3)})`,
  );
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(1);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(1);
});

// -----------------------------------------------------------------------
// POI-03: Baseline brightness centroid is within image bounds
// -----------------------------------------------------------------------
test("POI-03: Baseline brightness centroid is within image bounds", async () => {
  const buffer = await fetchImageBuffer(BASELINE_URL);
  const { cx, cy } = await findBrightnessCentroid(buffer);
  console.log(
    `Baseline brightness centroid: (${cx.toFixed(3)}, ${cy.toFixed(3)})`,
  );
  expect(cx).toBeGreaterThan(0);
  expect(cx).toBeLessThan(1);
  expect(cy).toBeGreaterThan(0);
  expect(cy).toBeLessThan(1);
});

// -----------------------------------------------------------------------
// POI-04: Candidate and baseline brightness centroids are close
//         (subject is in the same relative position)
// -----------------------------------------------------------------------
test("POI-04: Candidate and baseline brightness centroids match", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const [bCentroid, cCentroid] = await Promise.all([
    findBrightnessCentroid(baselineBuffer),
    findBrightnessCentroid(candidateBuffer),
  ]);

  console.log(
    `Baseline centroid: (${bCentroid.cx.toFixed(3)}, ${bCentroid.cy.toFixed(3)})`,
  );
  console.log(
    `Candidate centroid: (${cCentroid.cx.toFixed(3)}, ${cCentroid.cy.toFixed(3)})`,
  );

  // Allow up to 10% shift in either axis
  expect(Math.abs(bCentroid.cx - cCentroid.cx)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(bCentroid.cy - cCentroid.cy)).toBeLessThanOrEqual(0.1);
});

// -----------------------------------------------------------------------
// POI-05: Candidate center region is not blank (subject is present)
// -----------------------------------------------------------------------
test("POI-05: Candidate center region is not blank", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize(100, 100, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Sample the center 20x20 region
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

  // Center should not be pure black or pure white — there's content there
  expect(meanLum).toBeGreaterThan(5);
  expect(meanLum).toBeLessThan(250);
});
