/**
 * CL-01 through CL-10: Color Accuracy & Profiles
 *
 * Verifies color fidelity across color spaces, ICC profiles, bit depth,
 * and tonal range preservation.
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

const MAX_DELTA_E = 10;
const MAX_DELTA_E_STRICT = 5;

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

// Convert sRGB 0-255 to linear light
function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// Convert linear RGB to CIE XYZ (D65)
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

// Convert XYZ to CIE L*a*b*
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

// Sample a grid of pixels from a raw JPEG buffer using sharp
async function samplePixelGrid(
  buffer: Buffer,
  gridSize = 5,
): Promise<Array<{ r: number; g: number; b: number }>> {
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const samples: Array<{ r: number; g: number; b: number }> = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = Math.floor(((col + 0.5) * width) / gridSize);
      const y = Math.floor(((row + 0.5) * height) / gridSize);
      const idx = (y * width + x) * channels;
      samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }
  return samples;
}

// -----------------------------------------------------------------------
// CL-01: Candidate image loads and is visible
// -----------------------------------------------------------------------
test("CL-01: Candidate image loads and is visible", async ({ page }) => {
  await page.goto(CANDIDATE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  const loaded = await img.evaluate(
    (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

// -----------------------------------------------------------------------
// CL-02: Baseline image loads and is visible
// -----------------------------------------------------------------------
test("CL-02: Baseline image loads and is visible", async ({ page }) => {
  await page.goto(BASELINE_URL);
  const img = page.locator("img");
  await img.waitFor({ state: "visible" });
  const loaded = await img.evaluate(
    (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

// -----------------------------------------------------------------------
// CL-03: Candidate pixel colors are within strict Delta-E of baseline
// -----------------------------------------------------------------------
test("CL-03: Candidate pixel colors within strict Delta-E of baseline", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const sharp = require("sharp");

  // Resize both to the same dimensions for fair comparison
  const { width, height } = await sharp(baselineBuffer).metadata();
  const resizedCandidate = await sharp(candidateBuffer)
    .resize(width, height, { fit: "fill" })
    .toBuffer();

  const baselineSamples = await samplePixelGrid(baselineBuffer);
  const candidateSamples = await samplePixelGrid(resizedCandidate);

  const failures: string[] = [];
  for (let i = 0; i < baselineSamples.length; i++) {
    const { r: r1, g: g1, b: b1 } = baselineSamples[i];
    const { r: r2, g: g2, b: b2 } = candidateSamples[i];
    const de = deltaE(r1, g1, b1, r2, g2, b2);
    if (de > MAX_DELTA_E_STRICT) {
      failures.push(
        `Sample ${i}: baseline=rgb(${r1},${g1},${b1}) candidate=rgb(${r2},${g2},${b2}) ΔE=${de.toFixed(2)}`,
      );
    }
  }

  if (failures.length > 0)
    console.log("Color failures:\n" + failures.join("\n"));
  expect(
    failures,
    `${failures.length} sample(s) exceeded ΔE threshold of ${MAX_DELTA_E_STRICT}`,
  ).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-04: Candidate pixel colors within loose Delta-E of baseline
// -----------------------------------------------------------------------
test("CL-04: Candidate pixel colors within loose Delta-E of baseline", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const sharp = require("sharp");
  const { width, height } = await sharp(baselineBuffer).metadata();
  const resizedCandidate = await sharp(candidateBuffer)
    .resize(width, height, { fit: "fill" })
    .toBuffer();

  const baselineSamples = await samplePixelGrid(baselineBuffer, 10);
  const candidateSamples = await samplePixelGrid(resizedCandidate, 10);

  const failures: string[] = [];
  for (let i = 0; i < baselineSamples.length; i++) {
    const { r: r1, g: g1, b: b1 } = baselineSamples[i];
    const { r: r2, g: g2, b: b2 } = candidateSamples[i];
    const de = deltaE(r1, g1, b1, r2, g2, b2);
    if (de > MAX_DELTA_E) {
      failures.push(`Sample ${i}: ΔE=${de.toFixed(2)}`);
    }
  }

  expect(
    failures,
    `${failures.length} sample(s) exceeded ΔE threshold of ${MAX_DELTA_E}`,
  ).toHaveLength(0);
});

// -----------------------------------------------------------------------
// CL-05: Candidate is RGB (not CMYK)
// -----------------------------------------------------------------------
test("CL-05: Candidate image is RGB color space", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const meta = await sharp(buffer).metadata();
  expect(meta.space).not.toBe("cmyk");
  expect(meta.channels).toBeLessThanOrEqual(4);
});

// -----------------------------------------------------------------------
// CL-06: Baseline is RGB (not CMYK)
// -----------------------------------------------------------------------
test("CL-06: Baseline image is RGB color space", async () => {
  const buffer = await fetchImageBuffer(BASELINE_URL);
  const sharp = require("sharp");
  const meta = await sharp(buffer).metadata();
  expect(meta.space).not.toBe("cmyk");
  expect(meta.channels).toBeLessThanOrEqual(4);
});

// -----------------------------------------------------------------------
// CL-07: Black point preserved — darkest region stays dark
// -----------------------------------------------------------------------
test("CL-07: Black point preserved in candidate", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Find the minimum luminance pixel
  let minLum = 255;
  for (let i = 0; i < data.length; i += channels) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
  }

  // There should be at least some dark pixels (lum < 30)
  expect(minLum).toBeLessThan(30);
});

// -----------------------------------------------------------------------
// CL-08: White point preserved — brightest region stays bright
// -----------------------------------------------------------------------
test("CL-08: White point preserved in candidate", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { channels } = info;

  let maxLum = 0;
  for (let i = 0; i < data.length; i += channels) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum > maxLum) maxLum = lum;
  }

  // There should be at least some bright pixels (lum > 200)
  expect(maxLum).toBeGreaterThan(200);
});

// -----------------------------------------------------------------------
// CL-09: Candidate gradient smoothness — no banding
// -----------------------------------------------------------------------
test("CL-09: Candidate image has smooth tonal gradients (no banding)", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { data, info } = await sharp(buffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Measure row-to-row luminance differences in the center column
  const cx = Math.floor(width / 2);
  const diffs: number[] = [];
  for (let y = 1; y < height; y++) {
    const prev = data[(y - 1) * width + cx];
    const curr = data[y * width + cx];
    diffs.push(Math.abs(curr - prev));
  }

  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  // Average per-row luminance jump should be small (smooth gradient)
  expect(mean).toBeLessThan(10);
});

// -----------------------------------------------------------------------
// CL-10: Overall color similarity — SSIM-like mean pixel difference
// -----------------------------------------------------------------------
test("CL-10: Overall color similarity between baseline and candidate", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const sharp = require("sharp");
  const { width, height } = await sharp(baselineBuffer).metadata();

  const [b1, b2] = await Promise.all([
    sharp(baselineBuffer).resize(width, height).raw().toBuffer(),
    sharp(candidateBuffer)
      .resize(width, height, { fit: "fill" })
      .raw()
      .toBuffer(),
  ]);

  let totalDiff = 0;
  const pixels = b1.length / 3;
  for (let i = 0; i < b1.length; i++) {
    totalDiff += Math.abs(b1[i] - b2[i]);
  }
  const meanDiff = totalDiff / b1.length;

  console.log(`Mean per-channel pixel difference: ${meanDiff.toFixed(2)}`);
  // Allow up to 15/255 average difference (~6%)
  expect(meanDiff).toBeLessThan(15);
});
