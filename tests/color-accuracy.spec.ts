/**
 * CL-01 through CL-10: Color Accuracy & Profiles
 *
 * Uses dedicated color test images with companion JSON files
 * that specify pixel coordinates and expected RGB values.
 *
 * Set TEST_IMAGES_DIR in .env to point at your local test images folder.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR =
  process.env.TEST_IMAGES_DIR || path.join(__dirname, "../Test Images");

const SRGB_PATH = path.join(IMAGES_DIR, "c-color-checker-srgb.jpg");
const ADOBERGB_PATH = path.join(IMAGES_DIR, "c-color-checker-adobergb.jpg");
const PROPHOTO_PATH = path.join(IMAGES_DIR, "c-color-checker-prophoto.jpg");
const ICC_CUSTOM_PATH = path.join(IMAGES_DIR, "c-color-icc-custom.jpg");
const UNTAGGED_PATH = path.join(IMAGES_DIR, "c-color-untagged.jpg");
const CMYK_PATH = path.join(IMAGES_DIR, "c-color-cmyk.jpg");
const GRADIENT_PATH = path.join(IMAGES_DIR, "c-color-16bit-gradient.tiff");
const BW_PATH = path.join(IMAGES_DIR, "c-color-blackwhite.jpg");
const GRAYSCALE_PATH = path.join(IMAGES_DIR, "c-color-grayscale-ramp.jpg");
const SATURATED_PATH = path.join(IMAGES_DIR, "c-color-saturated-patches.jpg");

const SRGB_JSON = path.join(IMAGES_DIR, "c-color-checker-srgb.json");
const ADOBERGB_JSON = path.join(IMAGES_DIR, "c-color-checker-adobergb.json");
const PROPHOTO_JSON = path.join(IMAGES_DIR, "c-color-checker-prophoto.json");
const BW_JSON = path.join(IMAGES_DIR, "c-color-blackwhite.json");
const GRAYSCALE_JSON = path.join(IMAGES_DIR, "c-color-grayscale-ramp.json");
const SATURATED_JSON = path.join(IMAGES_DIR, "c-color-saturated-patches.json");

const MAX_DELTA_E = 10;
const MAX_DELTA_E_STRICT = 5;
// Wider gamut images (Adobe RGB, ProPhoto) have larger conversion errors
const MAX_DELTA_E_WIDE_GAMUT = 25;

function readBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r: number, g: number, b: number) {
  const rl = toLinear(r),
    gl = toLinear(g),
    bl = toLinear(b);
  return {
    x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    y: rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175,
    z: rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  };
}

function f(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function xyzToLab(x: number, y: number, z: number) {
  const fx = f(x / 0.95047),
    fy = f(y / 1.0),
    fz = f(z / 1.08883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const xyz1 = rgbToXyz(r1, g1, b1);
  const lab1 = xyzToLab(xyz1.x, xyz1.y, xyz1.z);
  const xyz2 = rgbToXyz(r2, g2, b2);
  const lab2 = xyzToLab(xyz2.x, xyz2.y, xyz2.z);
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
      Math.pow(lab1.a - lab2.a, 2) +
      Math.pow(lab1.b - lab2.b, 2),
  );
}

async function samplePixel(
  buffer: Buffer,
  x: number,
  y: number,
): Promise<{ r: number; g: number; b: number }> {
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

// -----------------------------------------------------------------------
// CL-01: sRGB color checker — patch colors within strict Delta-E
// -----------------------------------------------------------------------
test("CL-01: sRGB color checker patches match expected RGB values", async () => {
  const buffer = readBuffer(SRGB_PATH);
  const patches = JSON.parse(fs.readFileSync(SRGB_JSON, "utf8")).patches;
  const failures: string[] = [];

  for (const [name, patch] of Object.entries(patches) as any[]) {
    const actual = await samplePixel(buffer, patch.x, patch.y);
    const de = deltaE(patch.r, patch.g, patch.b, actual.r, actual.g, actual.b);
    if (de > MAX_DELTA_E_STRICT) {
      failures.push(
        `${name}: expected rgb(${patch.r},${patch.g},${patch.b}) got rgb(${actual.r},${actual.g},${actual.b}) ΔE=${de.toFixed(2)}`,
      );
    }
  }

  if (failures.length) console.log("CL-01 failures:\n" + failures.join("\n"));
  expect(
    failures,
    `${failures.length} patch(es) exceeded ΔE ${MAX_DELTA_E_STRICT}`,
  ).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-02: Adobe RGB color checker — sRGB-converted targets within Delta-E
// -----------------------------------------------------------------------
test("CL-02: Adobe RGB color checker patches within Delta-E of sRGB targets", async () => {
  const buffer = readBuffer(ADOBERGB_PATH);
  const patches = JSON.parse(fs.readFileSync(ADOBERGB_JSON, "utf8")).patches;
  const failures: string[] = [];

  for (const [name, patch] of Object.entries(patches) as any[]) {
    const actual = await samplePixel(buffer, patch.x, patch.y);
    const de = deltaE(patch.r, patch.g, patch.b, actual.r, actual.g, actual.b);
    if (de > MAX_DELTA_E_WIDE_GAMUT) {
      failures.push(`${name}: ΔE=${de.toFixed(2)}`);
    }
  }

  if (failures.length) console.log("CL-02 failures:\n" + failures.join("\n"));
  expect(
    failures,
    `${failures.length} patch(es) exceeded ΔE ${MAX_DELTA_E_WIDE_GAMUT}`,
  ).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-03: ProPhoto RGB color checker — sRGB-converted targets within Delta-E
// -----------------------------------------------------------------------
test("CL-03: ProPhoto RGB color checker patches within Delta-E of sRGB targets", async () => {
  const buffer = readBuffer(PROPHOTO_PATH);
  const patches = JSON.parse(fs.readFileSync(PROPHOTO_JSON, "utf8")).patches;
  const failures: string[] = [];

  for (const [name, patch] of Object.entries(patches) as any[]) {
    const actual = await samplePixel(buffer, patch.x, patch.y);
    const de = deltaE(patch.r, patch.g, patch.b, actual.r, actual.g, actual.b);
    if (de > MAX_DELTA_E_WIDE_GAMUT) {
      failures.push(`${name}: ΔE=${de.toFixed(2)}`);
    }
  }

  if (failures.length) console.log("CL-03 failures:\n" + failures.join("\n"));
  expect(
    failures,
    `${failures.length} patch(es) exceeded ΔE ${MAX_DELTA_E_WIDE_GAMUT}`,
  ).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-04: Custom ICC profile image is readable and has ICC data
// -----------------------------------------------------------------------
test("CL-04: Custom ICC profile image has embedded ICC profile", async () => {
  const sharp = require("sharp");
  const meta = await sharp(readBuffer(ICC_CUSTOM_PATH)).metadata();
  expect(meta.icc, "Expected ICC profile to be present").toBeTruthy();
  console.log(`CL-04: ICC profile present, color space: ${meta.space}`);
});

// -----------------------------------------------------------------------
// CL-05: Untagged image has no ICC profile
// -----------------------------------------------------------------------
test("CL-05: Untagged image has no embedded ICC profile", async () => {
  const sharp = require("sharp");
  const meta = await sharp(readBuffer(UNTAGGED_PATH)).metadata();
  expect(meta.icc, "Expected no ICC profile").toBeFalsy();
  console.log(`CL-05: No ICC profile, color space reported as: ${meta.space}`);
});

// -----------------------------------------------------------------------
// CL-06: CMYK image is detected as CMYK color space
// -----------------------------------------------------------------------
test("CL-06: CMYK image is detected as CMYK color space", async () => {
  const sharp = require("sharp");
  const meta = await sharp(readBuffer(CMYK_PATH)).metadata();
  expect(meta.space).toBe("cmyk");
  console.log(`CL-06: Color space: ${meta.space}, channels: ${meta.channels}`);
});

// -----------------------------------------------------------------------
// CL-07: 16-bit gradient TIFF has smooth tonal range (no banding)
// -----------------------------------------------------------------------
test("CL-07: 16-bit gradient has smooth tonal transitions", async () => {
  const sharp = require("sharp");
  const { data, info } = await sharp(readBuffer(GRADIENT_PATH))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const midY = Math.floor(height / 2);
  const diffs: number[] = [];
  for (let x = 1; x < width; x++) {
    diffs.push(Math.abs(data[midY * width + x] - data[midY * width + x - 1]));
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`CL-07: Mean adjacent pixel diff: ${mean.toFixed(3)}`);
  expect(mean).toBeLessThan(5);
});

// -----------------------------------------------------------------------
// CL-08: Black/white point image — pure black and white at known coords
// -----------------------------------------------------------------------
test("CL-08: Black and white point pixels match expected values", async () => {
  const buffer = readBuffer(BW_PATH);
  const patches = JSON.parse(fs.readFileSync(BW_JSON, "utf8")).patches;
  const failures: string[] = [];

  for (const [name, patch] of Object.entries(patches) as any[]) {
    const actual = await samplePixel(buffer, patch.x, patch.y);
    const de = deltaE(patch.r, patch.g, patch.b, actual.r, actual.g, actual.b);
    if (de > MAX_DELTA_E_STRICT) {
      failures.push(
        `${name}: expected rgb(${patch.r},${patch.g},${patch.b}) got rgb(${actual.r},${actual.g},${actual.b}) ΔE=${de.toFixed(2)}`,
      );
    }
  }

  if (failures.length) console.log("CL-08 failures:\n" + failures.join("\n"));
  expect(failures).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-09: Grayscale ramp — each step within tolerance of expected luminance
// -----------------------------------------------------------------------
test("CL-09: Grayscale ramp steps match expected luminance values", async () => {
  const buffer = readBuffer(GRAYSCALE_PATH);
  const patches = JSON.parse(fs.readFileSync(GRAYSCALE_JSON, "utf8")).patches;
  const failures: string[] = [];
  const LUMA_TOLERANCE = 15;

  for (const [name, patch] of Object.entries(patches) as any[]) {
    const actual = await samplePixel(buffer, patch.x, patch.y);
    const luma = Math.round(
      0.299 * actual.r + 0.587 * actual.g + 0.114 * actual.b,
    );
    const diff = Math.abs(luma - patch.luminance);
    if (diff > LUMA_TOLERANCE) {
      failures.push(
        `${name}: expected luma=${patch.luminance} got ${luma} (diff=${diff})`,
      );
    }
  }

  if (failures.length) console.log("CL-09 failures:\n" + failures.join("\n"));
  expect(failures).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-10: Saturated patches — R/G/B/C/M/Y within strict Delta-E
// -----------------------------------------------------------------------
test("CL-10: Saturated color patches match expected RGB values", async () => {
  const buffer = readBuffer(SATURATED_PATH);
  const patches = JSON.parse(fs.readFileSync(SATURATED_JSON, "utf8")).patches;
  const failures: string[] = [];

  for (const [name, patch] of Object.entries(patches) as any[]) {
    const actual = await samplePixel(buffer, patch.x, patch.y);
    const de = deltaE(patch.r, patch.g, patch.b, actual.r, actual.g, actual.b);
    if (de > MAX_DELTA_E_STRICT) {
      failures.push(
        `${name}: expected rgb(${patch.r},${patch.g},${patch.b}) got rgb(${actual.r},${actual.g},${actual.b}) ΔE=${de.toFixed(2)}`,
      );
    }
  }

  if (failures.length) console.log("CL-10 failures:\n" + failures.join("\n"));
  expect(
    failures,
    `${failures.length} patch(es) exceeded ΔE ${MAX_DELTA_E_STRICT}`,
  ).toHaveLength(0);
});
