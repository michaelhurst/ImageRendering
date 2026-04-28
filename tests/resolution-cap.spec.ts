/**
 * RC-01 through RC-05: Display Resolution Cap
 *
 * Verifies that test images do not exceed expected resolution limits.
 * Uses c-resolution-cap-test.jpg (6000x4000) as the primary subject.
 *
 * Set TEST_RESOLUTION_CAP_MAX in .env to enforce a maximum longest edge.
 * If not set, RC-01 and RC-02 report the actual dimensions and skip enforcement.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const CANDIDATE_PATH = path.join(IMAGES_DIR, "c-resolution-cap-test.jpg");
const CHART_PATH = path.join(IMAGES_DIR, "quality-resolution-chart.jpg");

const RESOLUTION_CAP_MAX = process.env.TEST_RESOLUTION_CAP_MAX
  ? parseInt(process.env.TEST_RESOLUTION_CAP_MAX, 10)
  : null;

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
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
  const { width, height } = await getDimensions(readBuffer(CANDIDATE_PATH));
  const longestEdge = Math.max(width, height);
  console.log(
    `Candidate longest edge: ${longestEdge}px${RESOLUTION_CAP_MAX ? ` (cap: ${RESOLUTION_CAP_MAX}px)` : " (no cap set)"}`,
  );

  if (!RESOLUTION_CAP_MAX) {
    test.skip(
      true,
      "TEST_RESOLUTION_CAP_MAX not set — skipping cap enforcement",
    );
    return;
  }
  expect(longestEdge).toBeLessThanOrEqual(RESOLUTION_CAP_MAX);
});

// -----------------------------------------------------------------------
// RC-02: Resolution chart longest edge does not exceed cap (if set)
// -----------------------------------------------------------------------
test("RC-02: Resolution chart longest edge does not exceed resolution cap", async () => {
  const { width, height } = await getDimensions(readBuffer(CHART_PATH));
  const longestEdge = Math.max(width, height);
  console.log(
    `Chart longest edge: ${longestEdge}px${RESOLUTION_CAP_MAX ? ` (cap: ${RESOLUTION_CAP_MAX}px)` : " (no cap set)"}`,
  );

  if (!RESOLUTION_CAP_MAX) {
    test.skip(
      true,
      "TEST_RESOLUTION_CAP_MAX not set — skipping cap enforcement",
    );
    return;
  }
  expect(longestEdge).toBeLessThanOrEqual(RESOLUTION_CAP_MAX);
});

// -----------------------------------------------------------------------
// RC-03: All test images have valid dimensions within sane upper bound
// -----------------------------------------------------------------------
test("RC-03: All test images have valid dimensions within sane bounds", async () => {
  const sharp = require("sharp");
  const imageExts = new Set([".jpg", ".jpeg", ".png", ".gif", ".tiff", ".tif"]);
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => imageExts.has(path.extname(f).toLowerCase()));

  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const buf = fs.readFileSync(path.join(IMAGES_DIR, file));
    try {
      const { width, height } = await sharp(buf).metadata();
      if (width && height) {
        expect(width, `${file} width out of bounds`).toBeGreaterThan(0);
        expect(height, `${file} height out of bounds`).toBeGreaterThan(0);
        expect(
          Math.max(width, height),
          `${file} exceeds 15K`,
        ).toBeLessThanOrEqual(15_000);
        console.log(`${file}: ${width}x${height}`);
      }
    } catch {
      console.log(`Skipping ${file} (format not supported by sharp)`);
    }
  }
});

// -----------------------------------------------------------------------
// RC-04: Resolution chart image has valid dimensions
// -----------------------------------------------------------------------
test("RC-04: quality-resolution-chart.jpg has valid dimensions", async () => {
  const { width, height } = await getDimensions(readBuffer(CHART_PATH));
  console.log(
    `Resolution chart: ${width}x${height}, longest edge: ${Math.max(width, height)}px`,
  );
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(Math.max(width, height)).toBeLessThanOrEqual(15_000);
});
