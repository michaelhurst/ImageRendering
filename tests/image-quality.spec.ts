/**
 * IQ-01 through IQ-10: Image Quality & Compression
 *
 * Verifies quality, sharpness, format integrity, and file size
 * using local test images.
 *
 *   BASELINE — quality-reference.png  (high-quality lossless reference)
 *   CANDIDATE — quality-detail.jpg    (JPEG derivative for comparison)
 *   NOISY     — quality-noisy.jpg     (high-ISO noisy image)
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const BASELINE_PATH = path.join(IMAGES_DIR, "quality-reference.png");
const CANDIDATE_PATH = path.join(IMAGES_DIR, "quality-detail.jpg");
const NOISY_PATH = path.join(IMAGES_DIR, "quality-noisy.jpg");

const SSIM_THRESHOLD = 0.92;
const SHARPNESS_MIN_VARIANCE = 50;
// Downsample large images before SSIM/sharpness to keep tests fast
const COMPARE_WIDTH = 1600;

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

async function computeSSIM(buf1: Buffer, buf2: Buffer): Promise<number> {
  const sharp = require("sharp");
  const [d1, d2] = await Promise.all([
    sharp(buf1)
      .resize(COMPARE_WIDTH, null, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer(),
    sharp(buf2)
      .resize(COMPARE_WIDTH, null, { fit: "inside" })
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

async function measureSharpness(buf: Buffer): Promise<number> {
  const sharp = require("sharp");
  const { data, info } = await sharp(buf)
    .resize(COMPARE_WIDTH, null, { fit: "inside" })
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
// IQ-01: Candidate image is readable and has valid dimensions
// -----------------------------------------------------------------------
test("IQ-01: Candidate image is readable and has valid dimensions", async () => {
  const sharp = require("sharp");
  const { width, height } = await sharp(readBuffer(CANDIDATE_PATH)).metadata();
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  console.log(`Candidate: ${width}x${height}`);
});

// -----------------------------------------------------------------------
// IQ-02: Candidate SSIM vs baseline meets threshold
// -----------------------------------------------------------------------
test("IQ-02: Candidate SSIM vs baseline meets quality threshold", async () => {
  const ssim = await computeSSIM(
    readBuffer(BASELINE_PATH),
    readBuffer(CANDIDATE_PATH),
  );
  console.log(`SSIM: ${ssim.toFixed(4)}`);
  expect(ssim).toBeGreaterThanOrEqual(SSIM_THRESHOLD);
});

// -----------------------------------------------------------------------
// IQ-03: Candidate file size is non-trivial
// -----------------------------------------------------------------------
test("IQ-03: Candidate file size is non-trivial (not empty or truncated)", async () => {
  const buffer = readBuffer(CANDIDATE_PATH);
  expect(buffer.length).toBeGreaterThan(10_000);
});

// -----------------------------------------------------------------------
// IQ-04: Baseline file size is non-trivial
// -----------------------------------------------------------------------
test("IQ-04: Baseline file size is non-trivial", async () => {
  const buffer = readBuffer(BASELINE_PATH);
  expect(buffer.length).toBeGreaterThan(10_000);
});

// -----------------------------------------------------------------------
// IQ-05: Candidate is a valid JPEG (correct magic bytes)
// -----------------------------------------------------------------------
test("IQ-05: Candidate is a valid JPEG", async () => {
  const buffer = readBuffer(CANDIDATE_PATH);
  expect(buffer[0]).toBe(0xff);
  expect(buffer[1]).toBe(0xd8);
  expect(buffer[2]).toBe(0xff);
});

// -----------------------------------------------------------------------
// IQ-06: Baseline is a valid PNG (correct magic bytes)
// -----------------------------------------------------------------------
test("IQ-06: Baseline is a valid PNG", async () => {
  const buffer = readBuffer(BASELINE_PATH);
  expect(buffer[0]).toBe(0x89);
  expect(buffer[1]).toBe(0x50);
  expect(buffer[2]).toBe(0x4e);
  expect(buffer[3]).toBe(0x47);
});

// -----------------------------------------------------------------------
// IQ-07: Candidate sharpness meets minimum variance threshold
// -----------------------------------------------------------------------
test("IQ-07: Candidate image sharpness meets minimum threshold", async () => {
  const variance = await measureSharpness(readBuffer(CANDIDATE_PATH));
  console.log(`Sharpness (Laplacian variance): ${variance.toFixed(1)}`);
  expect(variance).toBeGreaterThan(SHARPNESS_MIN_VARIANCE);
});

// -----------------------------------------------------------------------
// IQ-08: Noisy image has measurable sharpness (grain registers as variance)
// -----------------------------------------------------------------------
test("IQ-08: quality-noisy.jpg has measurable sharpness variance", async () => {
  const variance = await measureSharpness(readBuffer(NOISY_PATH));
  console.log(`Noisy sharpness (Laplacian variance): ${variance.toFixed(1)}`);
  expect(variance).toBeGreaterThan(SHARPNESS_MIN_VARIANCE);
});

// -----------------------------------------------------------------------
// IQ-09: Candidate and baseline have same aspect ratio (within tolerance)
// -----------------------------------------------------------------------
test("IQ-09: Candidate and baseline have matching aspect ratio", async () => {
  const sharp = require("sharp");
  const [bMeta, cMeta] = await Promise.all([
    sharp(readBuffer(BASELINE_PATH)).metadata(),
    sharp(readBuffer(CANDIDATE_PATH)).metadata(),
  ]);
  const baselineRatio = bMeta.width! / bMeta.height!;
  const candidateRatio = cMeta.width! / cMeta.height!;
  console.log(
    `Baseline ratio: ${baselineRatio.toFixed(3)}, Candidate ratio: ${candidateRatio.toFixed(3)}`,
  );
  expect(Math.abs(baselineRatio - candidateRatio)).toBeLessThanOrEqual(0.05);
});
