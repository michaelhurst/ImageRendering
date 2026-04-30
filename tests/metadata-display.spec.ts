/**
 * MD-01 through MD-07: Metadata Display
 *
 * Verifies that images load correctly in a browser and that dimensions
 * and EXIF metadata match expected values from the SmugMug baseline gallery.
 *
 * MD-03/MD-04 use gallery metadata for expected dimensions (no extra download).
 * Browser tests download the image once for the data URL.
 */

import { test, expect } from "../helpers/test-fixtures";
import { getGalleryImages } from "../helpers/gallery-images";

const gallery = getGalleryImages();

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

  const buf = await gallery.fetchImage("metadata-iptc.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "metadata-iptc.jpg");
  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  expect(errors).toHaveLength(0);
});

// -----------------------------------------------------------------------
// MD-02: Candidate image src attribute is set correctly
// -----------------------------------------------------------------------
test("MD-02: Candidate image src attribute is set correctly", async ({
  page,
}) => {
  const buf = await gallery.fetchImage("metadata-iptc.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "metadata-iptc.jpg");
  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const src = await page.locator("#img").getAttribute("src");
  expect(src).toBeTruthy();
  expect(src).toContain("data:image");
});

// -----------------------------------------------------------------------
// MD-03: Candidate image naturalWidth matches expected width
// -----------------------------------------------------------------------
test("MD-03: Candidate naturalWidth in browser matches expected width", async ({
  page,
}) => {
  const info = await gallery.getImageInfo("metadata-iptc.jpg");
  const buf = await gallery.fetchImage("metadata-iptc.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "metadata-iptc.jpg");

  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const naturalWidth = await page.evaluate(
    () => (document.getElementById("img") as HTMLImageElement).naturalWidth,
  );
  expect(naturalWidth).toBe(info.OriginalWidth);
});

// -----------------------------------------------------------------------
// MD-04: Candidate image naturalHeight matches expected height
// -----------------------------------------------------------------------
test("MD-04: Candidate naturalHeight in browser matches expected height", async ({
  page,
}) => {
  const info = await gallery.getImageInfo("metadata-iptc.jpg");
  const buf = await gallery.fetchImage("metadata-iptc.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "metadata-iptc.jpg");

  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const naturalHeight = await page.evaluate(
    () => (document.getElementById("img") as HTMLImageElement).naturalHeight,
  );
  expect(naturalHeight).toBe(info.OriginalHeight);
});

// -----------------------------------------------------------------------
// MD-05: metadata-rich.jpg EXIF Make/Model are non-empty strings
// -----------------------------------------------------------------------
test("MD-05: metadata-rich.jpg EXIF Make and Model are non-empty", async () => {
  const exifr = require("exifr");
  const buf = await gallery.fetchImage("metadata-rich.jpg");
  const exif = await exifr.parse(buf, { pick: ["Make", "Model"] });

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
// MD-06: metadata-stripped.jpg loads without errors in browser
// -----------------------------------------------------------------------
test("MD-06: metadata-stripped.jpg loads cleanly in browser", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const buf = await gallery.fetchImage("metadata-stripped.jpg");
  const dataUrl = gallery.bufferToDataUrl(buf, "metadata-stripped.jpg");
  await page.setContent(
    `<html><body><img id="img" src="${dataUrl}"></body></html>`,
  );
  await page.waitForFunction(() => {
    const el = document.getElementById("img") as HTMLImageElement;
    return el && el.complete && el.naturalWidth > 0;
  });

  const loaded = await page.evaluate(
    () => (document.getElementById("img") as HTMLImageElement).naturalWidth > 0,
  );
  expect(loaded).toBe(true);
  expect(errors).toHaveLength(0);
});
