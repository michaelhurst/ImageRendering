/**
 * IQ-01 through IQ-10: Image Quality & Compression
 *
 * Verifies that the candidate image preserves quality across compression,
 * format, sharpness, and file integrity compared to the baseline.
 *
 * Images are fetched directly from CDN URLs:
 *   BASELINE_URL — production smugmug.com image (ground truth)
 *   CANDIDATE_URL — inside.smugmug.net image under test
 */

import { test, expect } from "@playwright/test";
import * as https from "https";
import * as crypto from "crypto";

const BASELINE_URL =
  "https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg";
const CANDIDATE_URL =
  "https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg";

const SSIM_THRESHOLD = 0.92;
const SHARPNESS_MIN_VARIANCE = 50;

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

function md5Hex(buf: Buffer): string {
  return crypto.createHash("md5").update(buf).digest("hex");
}

// Compute a simple SSIM approximation using mean/variance of pixel values
async function computeSSIM(buf1: Buffer, buf2: Buffer): Promise<number> {
  const sharp = require("sharp");
  const { width, height } = await sharp(buf1).metadata();

  const [d1, d2] = await Promise.all([
    sharp(buf1).resize(width, height).greyscale().raw().toBuffer(),
    sharp(buf2)
      .resize(width, height, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer(),
  ]);

  const n = Math.min(d1.length, d2.length);
  let sum1 = 0,
    sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum1 += d1[i];
    sum2 += d2[i];
  }
  const mu1 = sum1 / n,
    mu2 = sum2 / n;

  let var1 = 0,
    var2 = 0,
    cov = 0;
  for (let i = 0; i < n; i++) {
    var1 += Math.pow(d1[i] - mu1, 2);
    var2 += Math.pow(d2[i] - mu2, 2);
    cov += (d1[i] - mu1) * (d2[i] - mu2);
  }
  var1 /= n;
  var2 /= n;
  cov /= n;

  const C1 = 6.5025,
    C2 = 58.5225;
  return (
    ((2 * mu1 * mu2 + C1) * (2 * cov + C2)) /
    ((mu1 * mu1 + mu2 * mu2 + C1) * (var1 + var2 + C2))
  );
}

// Laplacian variance as a sharpness measure
async function measureSharpness(buf: Buffer): Promise<number> {
  const sharp = require("sharp");
  const { data, info } = await sharp(buf)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let sum = 0,
    sumSq = 0,
    count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        -data[idx - width] -
        data[idx - 1] +
        4 * data[idx] -
        data[idx + 1] -
        data[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

// -----------------------------------------------------------------------
// IQ-01: Candidate image loads and is visible
// -----------------------------------------------------------------------
test("IQ-01: Candidate image loads and is visible", async ({ page }) => {
  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  const loaded = await img.evaluate(
    (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

// -----------------------------------------------------------------------
// IQ-02: Candidate SSIM vs baseline meets threshold
// -----------------------------------------------------------------------
test("IQ-02: Candidate SSIM vs baseline meets quality threshold", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const ssim = await computeSSIM(baselineBuffer, candidateBuffer);
  console.log(`SSIM: ${ssim.toFixed(4)}`);
  expect(ssim).toBeGreaterThanOrEqual(SSIM_THRESHOLD);
});

// -----------------------------------------------------------------------
// IQ-03: Candidate file size is non-trivial
// -----------------------------------------------------------------------
test("IQ-03: Candidate file size is non-trivial (not empty or truncated)", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  // Expect at least 10KB — a real image, not a stub
  expect(buffer.length).toBeGreaterThan(10_000);
});

// -----------------------------------------------------------------------
// IQ-04: Baseline file size is non-trivial
// -----------------------------------------------------------------------
test("IQ-04: Baseline file size is non-trivial", async () => {
  const buffer = await fetchImageBuffer(BASELINE_URL);
  expect(buffer.length).toBeGreaterThan(10_000);
});

// -----------------------------------------------------------------------
// IQ-05: Candidate is a valid JPEG (correct magic bytes)
// -----------------------------------------------------------------------
test("IQ-05: Candidate is a valid JPEG", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  // JPEG magic bytes: FF D8 FF
  expect(buffer[0]).toBe(0xff);
  expect(buffer[1]).toBe(0xd8);
  expect(buffer[2]).toBe(0xff);
});

// -----------------------------------------------------------------------
// IQ-06: Baseline is a valid JPEG
// -----------------------------------------------------------------------
test("IQ-06: Baseline is a valid JPEG", async () => {
  const buffer = await fetchImageBuffer(BASELINE_URL);
  expect(buffer[0]).toBe(0xff);
  expect(buffer[1]).toBe(0xd8);
  expect(buffer[2]).toBe(0xff);
});

// -----------------------------------------------------------------------
// IQ-07: Candidate sharpness meets minimum variance threshold
// -----------------------------------------------------------------------
test("IQ-07: Candidate image sharpness meets minimum threshold", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const variance = await measureSharpness(buffer);
  console.log(`Sharpness (Laplacian variance): ${variance.toFixed(1)}`);
  expect(variance).toBeGreaterThan(SHARPNESS_MIN_VARIANCE);
});

// -----------------------------------------------------------------------
// IQ-08: Candidate has no extreme compression artifacts (mean diff check)
// -----------------------------------------------------------------------
test("IQ-08: Candidate has no extreme compression artifacts vs baseline", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const sharp = require("sharp");
  const { width, height } = await sharp(baselineBuffer).metadata();

  const [d1, d2] = await Promise.all([
    sharp(baselineBuffer).resize(width, height).raw().toBuffer(),
    sharp(candidateBuffer)
      .resize(width, height, { fit: "fill" })
      .raw()
      .toBuffer(),
  ]);

  let totalDiff = 0;
  for (let i = 0; i < d1.length; i++) totalDiff += Math.abs(d1[i] - d2[i]);
  const meanDiff = totalDiff / d1.length;

  console.log(`Mean per-channel pixel difference: ${meanDiff.toFixed(2)}`);
  expect(meanDiff).toBeLessThan(20);
});

// -----------------------------------------------------------------------
// IQ-09: Candidate dimensions are positive
// -----------------------------------------------------------------------
test("IQ-09: Candidate image has valid non-zero dimensions", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { width, height } = await sharp(buffer).metadata();
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------
// IQ-10: Candidate and baseline have same aspect ratio (within tolerance)
// -----------------------------------------------------------------------
test("IQ-10: Candidate and baseline have matching aspect ratio", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const sharp = require("sharp");
  const [bMeta, cMeta] = await Promise.all([
    sharp(baselineBuffer).metadata(),
    sharp(candidateBuffer).metadata(),
  ]);

  const baselineRatio = bMeta.width! / bMeta.height!;
  const candidateRatio = cMeta.width! / cMeta.height!;

  console.log(
    `Baseline ratio: ${baselineRatio.toFixed(3)}, Candidate ratio: ${candidateRatio.toFixed(3)}`,
  );
  expect(Math.abs(baselineRatio - candidateRatio)).toBeLessThanOrEqual(0.05);
});
