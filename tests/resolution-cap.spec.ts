/**
 * RC-01 through RC-05: Display Resolution Cap
 *
 * Verifies that the candidate image does not exceed expected resolution
 * limits and that its dimensions are consistent with the baseline.
 *
 * Images are fetched directly from CDN URLs:
 *   BASELINE_URL — production smugmug.com image (ground truth)
 *   CANDIDATE_URL — inside.smugmug.net image under test
 *
 * The expected maximum longest edge can be overridden via:
 *   TEST_RESOLUTION_CAP_MAX env var (default: no cap enforced beyond sanity check)
 */

import { test, expect } from "@playwright/test";
import * as https from "https";

const BASELINE_URL =
  "https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg";
const CANDIDATE_URL =
  "https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg";

const RESOLUTION_CAP_MAX = process.env.TEST_RESOLUTION_CAP_MAX
  ? parseInt(process.env.TEST_RESOLUTION_CAP_MAX, 10)
  : null;

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
// RC-01: Candidate longest edge does not exceed resolution cap (if set)
// -----------------------------------------------------------------------
test("RC-01: Candidate longest edge does not exceed resolution cap", async () => {
  if (!RESOLUTION_CAP_MAX) {
    console.log(
      "TEST_RESOLUTION_CAP_MAX not set — skipping cap enforcement check",
    );
    return;
  }
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { width, height } = await getDimensions(buffer);
  const longestEdge = Math.max(width, height);
  console.log(
    `Candidate longest edge: ${longestEdge}px (cap: ${RESOLUTION_CAP_MAX}px)`,
  );
  expect(longestEdge).toBeLessThanOrEqual(RESOLUTION_CAP_MAX);
});

// -----------------------------------------------------------------------
// RC-02: Baseline longest edge does not exceed resolution cap (if set)
// -----------------------------------------------------------------------
test("RC-02: Baseline longest edge does not exceed resolution cap", async () => {
  if (!RESOLUTION_CAP_MAX) {
    console.log("TEST_RESOLUTION_CAP_MAX not set — skipping");
    return;
  }
  const buffer = await fetchImageBuffer(BASELINE_URL);
  const { width, height } = await getDimensions(buffer);
  const longestEdge = Math.max(width, height);
  console.log(
    `Baseline longest edge: ${longestEdge}px (cap: ${RESOLUTION_CAP_MAX}px)`,
  );
  expect(longestEdge).toBeLessThanOrEqual(RESOLUTION_CAP_MAX);
});

// -----------------------------------------------------------------------
// RC-03: Candidate dimensions match baseline dimensions
// -----------------------------------------------------------------------
test("RC-03: Candidate dimensions match baseline dimensions", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bDims, cDims] = await Promise.all([
    getDimensions(baselineBuffer),
    getDimensions(candidateBuffer),
  ]);

  console.log(
    `Baseline: ${bDims.width}x${bDims.height}, Candidate: ${cDims.width}x${cDims.height}`,
  );
  expect(cDims.width).toBe(bDims.width);
  expect(cDims.height).toBe(bDims.height);
});

// -----------------------------------------------------------------------
// RC-04: Candidate longest edge is within a sane upper bound (no runaway upscale)
// -----------------------------------------------------------------------
test("RC-04: Candidate longest edge is within sane upper bound", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const { width, height } = await getDimensions(buffer);
  const longestEdge = Math.max(width, height);
  console.log(`Candidate longest edge: ${longestEdge}px`);
  // No image served from CDN should exceed 10K on the longest edge
  expect(longestEdge).toBeLessThanOrEqual(10_000);
});

// -----------------------------------------------------------------------
// RC-05: Candidate renders at correct dimensions in browser
// -----------------------------------------------------------------------
test("RC-05: Candidate renders at correct dimensions in browser", async ({
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

  const longestEdge = Math.max(dims.width, dims.height);
  console.log(
    `Browser rendered: ${dims.width}x${dims.height}, longest edge: ${longestEdge}px`,
  );

  if (RESOLUTION_CAP_MAX) {
    expect(longestEdge).toBeLessThanOrEqual(RESOLUTION_CAP_MAX);
  }

  expect(dims.width).toBe(bufWidth);
  expect(dims.height).toBe(bufHeight);
});
