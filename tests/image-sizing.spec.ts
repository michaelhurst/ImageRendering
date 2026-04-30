/**
 * SZ-01 through SZ-08: Image Dimensions & Sizing
 *
 * Verifies pixel dimensions, aspect ratio, and browser rendering
 * using images from the SmugMug baseline gallery.
 *
 * SZ-01 through SZ-06 use gallery metadata (no image download needed).
 * SZ-07 downloads the image for browser rendering.
 */

import { test, expect } from "../helpers/test-fixtures";
import { getGalleryImages } from "../helpers/gallery-images";

const gallery = getGalleryImages();

// -----------------------------------------------------------------------
// SZ-01: Landscape image has correct dimensions (6000x4000)
// -----------------------------------------------------------------------
test("SZ-01: Landscape image has correct dimensions", async () => {
  const info = await gallery.getImageInfo("c-sizing-landscape.jpg");
  console.log(`Landscape: ${info.OriginalWidth}x${info.OriginalHeight}`);
  expect(info.OriginalWidth).toBe(6000);
  expect(info.OriginalHeight).toBe(4000);
});

// -----------------------------------------------------------------------
// SZ-02: Portrait image has correct dimensions (4000x6000)
// -----------------------------------------------------------------------
test("SZ-02: Portrait image has correct dimensions", async () => {
  const info = await gallery.getImageInfo("c-sizing-portrait.jpg");
  console.log(`Portrait: ${info.OriginalWidth}x${info.OriginalHeight}`);
  expect(info.OriginalWidth).toBe(4000);
  expect(info.OriginalHeight).toBe(6000);
});

// -----------------------------------------------------------------------
// SZ-03: Square image has equal width and height (5000x5000)
// -----------------------------------------------------------------------
test("SZ-03: Square image has equal width and height", async () => {
  const info = await gallery.getImageInfo("c-sizing-square.jpg");
  console.log(`Square: ${info.OriginalWidth}x${info.OriginalHeight}`);
  expect(info.OriginalWidth).toBe(info.OriginalHeight);
  expect(info.OriginalWidth).toBe(5000);
});

// -----------------------------------------------------------------------
// SZ-04: Panoramic image has extreme landscape aspect ratio (12000x2000)
// -----------------------------------------------------------------------
test("SZ-04: Panoramic image has extreme landscape aspect ratio", async () => {
  const info = await gallery.getImageInfo("c-sizing-panoramic.jpg");
  const { OriginalWidth: w, OriginalHeight: h } = info;
  console.log(`Panoramic: ${w}x${h}, ratio: ${(w / h).toFixed(2)}`);
  expect(w).toBe(12000);
  expect(h).toBe(2000);
  expect(w / h).toBeGreaterThan(5);
});

// -----------------------------------------------------------------------
// SZ-05: Tall image has extreme portrait aspect ratio (2000x10000)
// -----------------------------------------------------------------------
test("SZ-05: Tall image has extreme portrait aspect ratio", async () => {
  const info = await gallery.getImageInfo("c-sizing-tall.jpg");
  const { OriginalWidth: w, OriginalHeight: h } = info;
  console.log(`Tall: ${w}x${h}, ratio: ${(h / w).toFixed(2)}`);
  expect(w).toBe(2000);
  expect(h).toBe(10000);
  expect(h / w).toBeGreaterThan(4);
});

// -----------------------------------------------------------------------
// SZ-06: Small image has correct dimensions (400x300)
// -----------------------------------------------------------------------
test("SZ-06: Small image has correct dimensions", async () => {
  const info = await gallery.getImageInfo("c-sizing-small.jpg");
  console.log(`Small: ${info.OriginalWidth}x${info.OriginalHeight}`);
  expect(info.OriginalWidth).toBe(400);
  expect(info.OriginalHeight).toBe(300);
});

// -----------------------------------------------------------------------
// SZ-07: Small image renders at correct natural dimensions in browser
// -----------------------------------------------------------------------
test("SZ-07: Small image renders at correct natural dimensions in browser", async ({
  page,
}) => {
  const info = await gallery.getImageInfo("c-sizing-small.jpg");
  const buf = await gallery.fetchImage("c-sizing-small.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "c-sizing-small.jpg");

  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const dims = await page.evaluate(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return { width: el.naturalWidth, height: el.naturalHeight };
  });

  console.log(`Browser natural: ${dims.width}x${dims.height}`);
  expect(dims.width).toBe(info.OriginalWidth);
  expect(dims.height).toBe(info.OriginalHeight);
});
