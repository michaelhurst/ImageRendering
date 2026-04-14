/**
 * SZ-01 through SZ-08: Image Dimensions & Sizing
 *
 * Verifies that the candidate image serves correct pixel dimensions
 * and preserves aspect ratio compared to the baseline.
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

async function getDimensions(
  buf: Buffer,
): Promise<{ width: number; height: number }> {
  const sharp = require("sharp");
  const { width, height } = await sharp(buf).metadata();
  return { width: width!, height: height! };
}

// -----------------------------------------------------------------------
// SZ-01: Candidate image has valid non-zero dimensions
// -----------------------------------------------------------------------
test("SZ-01: Candidate image has valid non-zero dimensions", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { width, height } = await getDimensions(buffer);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  console.log(`Candidate dimensions: ${width}x${height}`);
});

// -----------------------------------------------------------------------
// SZ-02: Baseline image has valid non-zero dimensions
// -----------------------------------------------------------------------
test("SZ-02: Baseline image has valid non-zero dimensions", async () => {
  const buffer = await fetchImageBuffer(BASELINE_URL);
  const { width, height } = await getDimensions(buffer);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  console.log(`Baseline dimensions: ${width}x${height}`);
});

// -----------------------------------------------------------------------
// SZ-03: Candidate and baseline have matching aspect ratio
// -----------------------------------------------------------------------
test("SZ-03: Candidate and baseline aspect ratios match within tolerance", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const [bDims, cDims] = await Promise.all([
    getDimensions(baselineBuffer),
    getDimensions(candidateBuffer),
  ]);

  const baselineRatio = bDims.width / bDims.height;
  const candidateRatio = cDims.width / cDims.height;

  console.log(
    `Baseline: ${bDims.width}x${bDims.height} (ratio ${baselineRatio.toFixed(3)})`,
  );
  console.log(
    `Candidate: ${cDims.width}x${cDims.height} (ratio ${candidateRatio.toFixed(3)})`,
  );

  expect(Math.abs(baselineRatio - candidateRatio)).toBeLessThanOrEqual(0.02);
});

// -----------------------------------------------------------------------
// SZ-04: Candidate width is positive and reasonable (not upscaled beyond 10K)
// -----------------------------------------------------------------------
test("SZ-04: Candidate width is within reasonable bounds", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { width } = await getDimensions(buffer);
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(10_000);
});

// -----------------------------------------------------------------------
// SZ-05: Candidate height is positive and reasonable
// -----------------------------------------------------------------------
test("SZ-05: Candidate height is within reasonable bounds", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { height } = await getDimensions(buffer);
  expect(height).toBeGreaterThan(0);
  expect(height).toBeLessThanOrEqual(10_000);
});

// -----------------------------------------------------------------------
// SZ-06: Candidate dimensions match baseline dimensions exactly
// -----------------------------------------------------------------------
test("SZ-06: Candidate dimensions match baseline dimensions", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const [bDims, cDims] = await Promise.all([
    getDimensions(baselineBuffer),
    getDimensions(candidateBuffer),
  ]);

  expect(cDims.width).toBe(bDims.width);
  expect(cDims.height).toBe(bDims.height);
});

// -----------------------------------------------------------------------
// SZ-07: Candidate renders at correct natural dimensions in browser
// -----------------------------------------------------------------------
test("SZ-07: Candidate renders at correct natural dimensions in browser", async ({
  page,
}) => {
  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const el = document.querySelector("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const dims = await img.evaluate((el: HTMLImageElement) => ({
    width: el.naturalWidth,
    height: el.naturalHeight,
  }));

  expect(dims.width).toBeGreaterThan(0);
  expect(dims.height).toBeGreaterThan(0);
  console.log(`Browser natural dimensions: ${dims.width}x${dims.height}`);
});

// -----------------------------------------------------------------------
// SZ-08: Browser natural dimensions match buffer dimensions
// -----------------------------------------------------------------------
test("SZ-08: Browser natural dimensions match buffer dimensions", async ({
  page,
}) => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { width: bufWidth, height: bufHeight } = await getDimensions(buffer);

  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const el = document.querySelector("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const dims = await img.evaluate((el: HTMLImageElement) => ({
    width: el.naturalWidth,
    height: el.naturalHeight,
  }));

  expect(dims.width).toBe(bufWidth);
  expect(dims.height).toBe(bufHeight);
});
