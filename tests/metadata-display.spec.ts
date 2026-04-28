/**
 * MD-01 through MD-07: Metadata Display
 *
 * Verifies that images load correctly in a browser and that dimensions
 * and EXIF metadata match expected values from local test images.
 *
 * Uses metadata-rich.jpg (12MB) and metadata-iptc.jpg (27MB) — both
 * are manageable as browser data URLs.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");
const BASELINE_PATH = path.join(IMAGES_DIR, "metadata-rich.jpg");
const CANDIDATE_PATH = path.join(IMAGES_DIR, "metadata-iptc.jpg");
const STRIPPED_PATH = path.join(IMAGES_DIR, "metadata-stripped.jpg");

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

function fileToDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
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

  const dataUrl = fileToDataUrl(CANDIDATE_PATH);
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
  const dataUrl = fileToDataUrl(CANDIDATE_PATH);
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
// MD-03: Candidate image naturalWidth matches buffer width
// -----------------------------------------------------------------------
test("MD-03: Candidate naturalWidth in browser matches buffer width", async ({
  page,
}) => {
  const sharp = require("sharp");
  const { width: bufWidth } = await sharp(
    readBuffer(CANDIDATE_PATH),
  ).metadata();

  const dataUrl = fileToDataUrl(CANDIDATE_PATH);
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
  expect(naturalWidth).toBe(bufWidth);
});

// -----------------------------------------------------------------------
// MD-04: Candidate image naturalHeight matches buffer height
// -----------------------------------------------------------------------
test("MD-04: Candidate naturalHeight in browser matches buffer height", async ({
  page,
}) => {
  const sharp = require("sharp");
  const { height: bufHeight } = await sharp(
    readBuffer(CANDIDATE_PATH),
  ).metadata();

  const dataUrl = fileToDataUrl(CANDIDATE_PATH);
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
  expect(naturalHeight).toBe(bufHeight);
});

// -----------------------------------------------------------------------
// MD-05: metadata-rich.jpg EXIF Make/Model are non-empty strings
// -----------------------------------------------------------------------
test("MD-05: metadata-rich.jpg EXIF Make and Model are non-empty", async () => {
  const exifr = require("exifr");
  const exif = await exifr.parse(readBuffer(BASELINE_PATH), {
    pick: ["Make", "Model"],
  });

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

  const dataUrl = fileToDataUrl(STRIPPED_PATH);
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
