/**
 * WM-01 through WM-05: Watermark Rendering
 *
 * Verifies that the candidate image does not have unexpected watermark
 * artifacts compared to the baseline, and that both images render
 * cleanly in the browser.
 *
 * Images are fetched directly from CDN URLs:
 *   BASELINE_URL — production smugmug.com image (ground truth, no watermark)
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

// Compute mean per-pixel difference between two same-size buffers
async function meanPixelDiff(buf1: Buffer, buf2: Buffer): Promise<number> {
  const sharp = require("sharp");
  const { width, height } = await sharp(buf1).metadata();
  const [d1, d2] = await Promise.all([
    sharp(buf1).resize(width, height).raw().toBuffer(),
    sharp(buf2).resize(width, height, { fit: "fill" }).raw().toBuffer(),
  ]);
  let total = 0;
  for (let i = 0; i < d1.length; i++) total += Math.abs(d1[i] - d2[i]);
  return total / d1.length;
}

// -----------------------------------------------------------------------
// WM-01: Candidate image loads and is visible
// -----------------------------------------------------------------------
test("WM-01: Candidate image loads and is visible", async ({ page }) => {
  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  const loaded = await img.evaluate(
    (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

// -----------------------------------------------------------------------
// WM-02: Baseline image loads and is visible
// -----------------------------------------------------------------------
test("WM-02: Baseline image loads and is visible", async ({ page }) => {
  await page.goto(BASELINE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  const loaded = await img.evaluate(
    (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

// -----------------------------------------------------------------------
// WM-03: Candidate pixel difference vs baseline is within tolerance
//        (large diff could indicate an unexpected watermark overlay)
// -----------------------------------------------------------------------
test("WM-03: Candidate pixel difference vs baseline is within tolerance", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const meanDiff = await meanPixelDiff(baselineBuffer, candidateBuffer);
  console.log(`Mean per-channel pixel difference: ${meanDiff.toFixed(2)}`);

  // A watermark typically causes a large, localized diff.
  // Allow up to 20/255 average — beyond that suggests an overlay.
  expect(meanDiff).toBeLessThan(20);
});

// -----------------------------------------------------------------------
// WM-04: Candidate has no large uniform rectangular region
//        (a solid watermark block would show as a low-variance patch)
// -----------------------------------------------------------------------
test("WM-04: Candidate has no large uniform rectangular region (watermark block)", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize(100, 100, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Check 10x10 blocks for suspiciously low variance (< 2)
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

  console.log(`Uniform blocks (variance < 2): ${uniformBlocks}/100`);
  // A few uniform blocks are fine (sky, solid backgrounds), but many suggests a watermark
  expect(uniformBlocks).toBeLessThan(20);
});

// -----------------------------------------------------------------------
// WM-05: Candidate and baseline render at same dimensions
// -----------------------------------------------------------------------
test("WM-05: Candidate and baseline render at same dimensions", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const sharp = require("sharp");
  const [bMeta, cMeta] = await Promise.all([
    sharp(baselineBuffer).metadata(),
    sharp(candidateBuffer).metadata(),
  ]);

  expect(cMeta.width).toBe(bMeta.width);
  expect(cMeta.height).toBe(bMeta.height);
});
