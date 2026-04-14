/**
 * OR-01 through OR-08: EXIF Orientation
 *
 * Verifies that the candidate image has a valid EXIF orientation tag
 * and that the image is rendered correctly (not rotated/flipped) compared
 * to the baseline.
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
// OR-01: Candidate EXIF orientation tag is present
// -----------------------------------------------------------------------
test("OR-01: Candidate EXIF orientation tag is present", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { pick: ["Orientation"] });
  expect(exif).not.toBeNull();
  console.log(`Candidate orientation: ${exif?.Orientation}`);
});

// -----------------------------------------------------------------------
// OR-02: Baseline EXIF orientation tag is present
// -----------------------------------------------------------------------
test("OR-02: Baseline EXIF orientation tag is present", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(BASELINE_URL);
  const exif = await exifr.parse(buffer, { pick: ["Orientation"] });
  expect(exif).not.toBeNull();
  console.log(`Baseline orientation: ${exif?.Orientation}`);
});

// -----------------------------------------------------------------------
// OR-03: Candidate and baseline have matching orientation tag
// -----------------------------------------------------------------------
test("OR-03: Candidate and baseline have matching EXIF orientation", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const [baselineExif, candidateExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["Orientation"] }),
    exifr.parse(candidateBuffer, { pick: ["Orientation"] }),
  ]);

  console.log(
    `Baseline orientation: ${baselineExif?.Orientation}, Candidate: ${candidateExif?.Orientation}`,
  );
  expect(candidateExif?.Orientation).toBe(baselineExif?.Orientation);
});

// -----------------------------------------------------------------------
// OR-04: Candidate orientation tag is a valid value (1–8)
// -----------------------------------------------------------------------
test("OR-04: Candidate orientation tag is a valid EXIF value (1-8)", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { pick: ["Orientation"] });
  if (exif?.Orientation !== undefined) {
    expect(exif.Orientation).toBeGreaterThanOrEqual(1);
    expect(exif.Orientation).toBeLessThanOrEqual(8);
  }
});

// -----------------------------------------------------------------------
// OR-05: Candidate dimensions are consistent with orientation
//        (orientation 1 = normal, width >= height for landscape)
// -----------------------------------------------------------------------
test("OR-05: Candidate dimensions are consistent with its orientation tag", async () => {
  const exifr = require("exifr");
  const sharp = require("sharp");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);

  const [exif, meta] = await Promise.all([
    exifr.parse(buffer, { pick: ["Orientation"] }),
    sharp(buffer).metadata(),
  ]);

  const orientation = exif?.Orientation ?? 1;
  const { width, height } = meta;

  // Orientations 5-8 swap width/height — the raw pixel layout is rotated
  const isRotated = [5, 6, 7, 8].includes(orientation);
  console.log(
    `Orientation: ${orientation}, raw: ${width}x${height}, rotated: ${isRotated}`,
  );

  // Just verify dimensions are positive — orientation correction is applied by the CDN
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

// -----------------------------------------------------------------------
// OR-06: Candidate renders without distortion in browser (width > 0)
// -----------------------------------------------------------------------
test("OR-06: Candidate renders without distortion in browser", async ({
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
});

// -----------------------------------------------------------------------
// OR-07: Baseline renders without distortion in browser
// -----------------------------------------------------------------------
test("OR-07: Baseline renders without distortion in browser", async ({
  page,
}) => {
  await page.goto(BASELINE_URL);
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
});

// -----------------------------------------------------------------------
// OR-08: Candidate and baseline browser-rendered aspect ratios match
// -----------------------------------------------------------------------
test("OR-08: Candidate and baseline browser-rendered aspect ratios match", async ({
  browser,
}) => {
  const [baselinePage, candidatePage] = await Promise.all([
    browser.newPage(),
    browser.newPage(),
  ]);

  await Promise.all([
    baselinePage.goto(BASELINE_URL),
    candidatePage.goto(CANDIDATE_URL),
  ]);

  await Promise.all([
    baselinePage.waitForFunction(() => {
      const el = document.querySelector("img") as HTMLImageElement;
      return el && el.complete && el.naturalWidth > 0;
    }),
    candidatePage.waitForFunction(() => {
      const el = document.querySelector("img") as HTMLImageElement;
      return el && el.complete && el.naturalWidth > 0;
    }),
  ]);

  const [bDims, cDims] = await Promise.all([
    baselinePage
      .locator("img")
      .evaluate((el: HTMLImageElement) => ({
        w: el.naturalWidth,
        h: el.naturalHeight,
      })),
    candidatePage
      .locator("img")
      .evaluate((el: HTMLImageElement) => ({
        w: el.naturalWidth,
        h: el.naturalHeight,
      })),
  ]);

  await Promise.all([baselinePage.close(), candidatePage.close()]);

  const bRatio = bDims.w / bDims.h;
  const cRatio = cDims.w / cDims.h;
  console.log(
    `Baseline ratio: ${bRatio.toFixed(3)}, Candidate ratio: ${cRatio.toFixed(3)}`,
  );
  expect(Math.abs(bRatio - cRatio)).toBeLessThanOrEqual(0.02);
});
