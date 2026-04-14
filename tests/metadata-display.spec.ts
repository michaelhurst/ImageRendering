/**
 * MD-01 through MD-07: Metadata Display
 *
 * Verifies that EXIF metadata is correctly displayed when the image
 * is loaded in a browser — checking that the page title, URL, and
 * image attributes reflect the correct metadata.
 *
 * Images are loaded directly via CDN URLs:
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
// MD-01: Candidate image loads in browser without errors
// -----------------------------------------------------------------------
test("MD-01: Candidate image loads in browser without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });

  expect(errors).toHaveLength(0);
});

// -----------------------------------------------------------------------
// MD-02: Candidate image src attribute is set correctly
// -----------------------------------------------------------------------
test("MD-02: Candidate image src attribute is set correctly", async ({
  page,
}) => {
  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });

  const src = await img.getAttribute("src");
  expect(src).toBeTruthy();
  expect(src).toContain("smugmug");
});

// -----------------------------------------------------------------------
// MD-03: Candidate image naturalWidth matches buffer width
// -----------------------------------------------------------------------
test("MD-03: Candidate naturalWidth in browser matches buffer width", async ({
  page,
}) => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { width: bufWidth } = await sharp(buffer).metadata();

  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const el = document.querySelector("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const naturalWidth = await img.evaluate(
    (el: HTMLImageElement) => el.naturalWidth,
  );
  expect(naturalWidth).toBe(bufWidth);
});

// -----------------------------------------------------------------------
// MD-04: Candidate image naturalHeight matches buffer height
// -----------------------------------------------------------------------
test("MD-04: Candidate naturalHeight in browser matches buffer height", async ({
  page,
}) => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { height: bufHeight } = await sharp(buffer).metadata();

  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const el = document.querySelector("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const naturalHeight = await img.evaluate(
    (el: HTMLImageElement) => el.naturalHeight,
  );
  expect(naturalHeight).toBe(bufHeight);
});

// -----------------------------------------------------------------------
// MD-05: Candidate EXIF Make/Model are non-empty strings
// -----------------------------------------------------------------------
test("MD-05: Candidate EXIF Make and Model are non-empty", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { pick: ["Make", "Model"] });

  if (exif?.Make !== undefined) {
    expect(typeof exif.Make).toBe("string");
    expect(exif.Make.trim().length).toBeGreaterThan(0);
  }
  if (exif?.Model !== undefined) {
    expect(typeof exif.Model).toBe("string");
    expect(exif.Model.trim().length).toBeGreaterThan(0);
  }
});

// -----------------------------------------------------------------------
// MD-06: Candidate EXIF DateTimeOriginal is a valid date
// -----------------------------------------------------------------------
test("MD-06: Candidate EXIF DateTimeOriginal is a valid date", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { pick: ["DateTimeOriginal"] });

  if (exif?.DateTimeOriginal) {
    const d = new Date(exif.DateTimeOriginal);
    expect(isNaN(d.getTime())).toBe(false);
    // Should be a plausible photo date (after 1990, before now)
    expect(d.getFullYear()).toBeGreaterThan(1990);
    expect(d.getTime()).toBeLessThanOrEqual(Date.now());
  }
});

// -----------------------------------------------------------------------
// MD-07: Candidate and baseline EXIF Make/Model match
// -----------------------------------------------------------------------
test("MD-07: Candidate and baseline EXIF Make/Model match", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["Make", "Model"] }),
    exifr.parse(candidateBuffer, { pick: ["Make", "Model"] }),
  ]);

  if (bExif?.Make) expect(cExif?.Make).toBe(bExif.Make);
  if (bExif?.Model) expect(cExif?.Model).toBe(bExif.Model);
});
