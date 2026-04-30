/**
 * RC-01 through RC-05: Display Resolution Cap
 *
 * Verifies that test images do not exceed expected resolution limits.
 * Uses gallery metadata for dimension checks (no image download needed).
 *
 * Set TEST_RESOLUTION_CAP_MAX in .env to enforce a maximum longest edge.
 * If not set, RC-01 and RC-02 report the actual dimensions and skip enforcement.
 */

import { test, expect } from "../helpers/test-fixtures";
import { getGalleryImages } from "../helpers/gallery-images";

const gallery = getGalleryImages();

const RESOLUTION_CAP_MAX = process.env.TEST_RESOLUTION_CAP_MAX
  ? parseInt(process.env.TEST_RESOLUTION_CAP_MAX, 10)
  : null;

// -----------------------------------------------------------------------
// RC-01: Candidate longest edge does not exceed resolution cap (if set)
// -----------------------------------------------------------------------
test("RC-01: Candidate longest edge does not exceed resolution cap", async () => {
  const info = await gallery.getImageInfo("c-resolution-cap-test.jpg");
  const longestEdge = Math.max(info.OriginalWidth, info.OriginalHeight);
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
  const info = await gallery.getImageInfo("quality-resolution-chart.jpg");
  const longestEdge = Math.max(info.OriginalWidth, info.OriginalHeight);
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
// RC-03: All gallery images have valid dimensions within sane upper bound
// -----------------------------------------------------------------------
test("RC-03: All gallery images have valid dimensions within sane bounds", async () => {
  const imageExts = /\.(jpg|jpeg|png|gif|tiff|tif)$/i;
  const files = await gallery.listFilenames(imageExts);

  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const info = await gallery.getImageInfo(file);
    const w = info.OriginalWidth;
    const h = info.OriginalHeight;
    if (w && h) {
      expect(w, `${file} width out of bounds`).toBeGreaterThan(0);
      expect(h, `${file} height out of bounds`).toBeGreaterThan(0);
      expect(Math.max(w, h), `${file} exceeds 15K`).toBeLessThanOrEqual(15_000);
      console.log(`${file}: ${w}x${h}`);
    }
  }
});

// -----------------------------------------------------------------------
// RC-04: Resolution chart image has valid dimensions
// -----------------------------------------------------------------------
test("RC-04: quality-resolution-chart.jpg has valid dimensions", async () => {
  const info = await gallery.getImageInfo("quality-resolution-chart.jpg");
  const { OriginalWidth: w, OriginalHeight: h } = info;
  console.log(`Resolution chart: ${w}x${h}, longest edge: ${Math.max(w, h)}px`);
  expect(w).toBeGreaterThan(0);
  expect(h).toBeGreaterThan(0);
  expect(Math.max(w, h)).toBeLessThanOrEqual(15_000);
});
