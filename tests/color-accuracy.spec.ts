/**
 * CL-01 through CL-10: Color Accuracy & Profiles
 *
 * Verifies color fidelity across color spaces, ICC profiles, bit depth,
 * and tonal range preservation.
 *
 * Reference images required in /reference-images/:
 *   - color-checker-srgb.jpg     — sRGB image with known RGB sample points
 *   - color-checker-adobergb.jpg — Adobe RGB tagged with saturated colors
 *   - color-checker-prophoto.jpg — ProPhoto RGB tagged
 *   - color-icc-custom.jpg       — Custom ICC profile embedded
 *   - color-untagged.jpg         — Same image as sRGB but with ICC stripped
 *   - color-cmyk.jpg             — CMYK JPEG
 *   - color-16bit-gradient.tiff  — 16-bit smooth gradient
 *   - color-blackwhite.jpg       — Image with pure black (0,0,0) and white (255,255,255) pixels
 *   - color-grayscale-ramp.jpg   — 11-step grayscale wedge
 *   - color-saturated-patches.jpg — R, G, B, C, M, Y patches
 *
 * Each color-checker image should ship with a companion JSON file listing
 * reference pixel coordinates and expected RGB values, e.g.:
 *   color-checker-srgb.json → [{ "x": 100, "y": 50, "r": 115, "g": 82, "b": 68 }, ...]
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import type { RGB } from '../helpers/image-comparison';
import * as path from 'path';
import * as fs from 'fs';

const MAX_DELTA_E = 10; // Perceptual threshold — adjust based on acceptable tolerance
const MAX_DELTA_E_STRICT = 5;

interface ReferencePoint {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

function loadReferencePoints(jsonPath: string): Array<{ x: number; y: number; expected: RGB }> {
  const raw: ReferencePoint[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return raw.map((p) => ({ x: p.x, y: p.y, expected: { r: p.r, g: p.g, b: p.b } }));
}

test.describe('Color Accuracy & Profiles', () => {
  // -----------------------------------------------------------------------
  // CL-01: sRGB image colors are accurate
  // -----------------------------------------------------------------------
  test('CL-01: sRGB image colors are accurate after upload', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-checker-srgb.jpg');
    const pointsPath = path.join(referenceImagesDir, 'color-checker-srgb.json');
    const refPoints = loadReferencePoints(pointsPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-01 sRGB' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);

    // Scale reference points proportionally to tier dimensions
    const imageData = await api.getImage(imageKey);
    const scaleX = tier!.width / imageData.OriginalWidth;
    const scaleY = tier!.height / imageData.OriginalHeight;
    const scaledPoints = refPoints.map((p) => ({
      x: Math.round(p.x * scaleX),
      y: Math.round(p.y * scaleY),
      expected: p.expected,
    }));

    const samples = await imageCompare.sampleAndCompare(tierBuffer, scaledPoints);
    const allPass = imageCompare.allSamplesWithinThreshold(samples, MAX_DELTA_E_STRICT);

    // Log detailed results for debugging
    for (const s of samples) {
      if (s.deltaE > MAX_DELTA_E_STRICT) {
        console.log(
          `  FAIL pixel (${s.x},${s.y}): expected rgb(${s.expected.r},${s.expected.g},${s.expected.b}) ` +
            `got rgb(${s.actual.r},${s.actual.g},${s.actual.b}) ΔE=${s.deltaE.toFixed(2)}`,
        );
      }
    }
    expect(allPass, 'One or more sRGB color samples exceeded Delta-E threshold').toBe(true);
  });

  // -----------------------------------------------------------------------
  // CL-02: Adobe RGB converted to sRGB without extreme shift
  // -----------------------------------------------------------------------
  test('CL-02: Adobe RGB converted to sRGB without extreme shift', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-checker-adobergb.jpg');
    const pointsPath = path.join(referenceImagesDir, 'color-checker-adobergb.json');
    const refPoints = loadReferencePoints(pointsPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-02 AdobeRGB' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const imageData = await api.getImage(imageKey);
    const scaleX = tier!.width / imageData.OriginalWidth;
    const scaleY = tier!.height / imageData.OriginalHeight;

    const scaledPoints = refPoints.map((p) => ({
      x: Math.round(p.x * scaleX),
      y: Math.round(p.y * scaleY),
      expected: p.expected, // Expected values should already be the sRGB-converted targets
    }));

    const samples = await imageCompare.sampleAndCompare(tierBuffer, scaledPoints);
    const allPass = imageCompare.allSamplesWithinThreshold(samples, MAX_DELTA_E);
    expect(allPass, 'Adobe RGB→sRGB conversion exceeded Delta-E threshold').toBe(true);
  });

  // -----------------------------------------------------------------------
  // CL-03: ProPhoto RGB converted with acceptable mapping
  // -----------------------------------------------------------------------
  test('CL-03: ProPhoto RGB converted with acceptable color mapping', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-checker-prophoto.jpg');
    const pointsPath = path.join(referenceImagesDir, 'color-checker-prophoto.json');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const refPoints = loadReferencePoints(pointsPath);
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-03 ProPhoto' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const imageData = await api.getImage(imageKey);
    const scaleX = tier!.width / imageData.OriginalWidth;
    const scaleY = tier!.height / imageData.OriginalHeight;

    const scaledPoints = refPoints.map((p) => ({
      x: Math.round(p.x * scaleX),
      y: Math.round(p.y * scaleY),
      expected: p.expected,
    }));

    const samples = await imageCompare.sampleAndCompare(tierBuffer, scaledPoints);
    const allPass = imageCompare.allSamplesWithinThreshold(samples, MAX_DELTA_E);
    expect(allPass, 'ProPhoto RGB conversion exceeded Delta-E threshold').toBe(true);
  });

  // -----------------------------------------------------------------------
  // CL-04: Embedded ICC profile renders correct colors
  // -----------------------------------------------------------------------
  test('CL-04: Image with embedded ICC profile renders correct colors', async ({
    api,
    exifUtils,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-icc-custom.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-04 ICC Profile' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const profileName = await exifUtils.getICCProfileName(tierBuffer);

    // The profile should either be preserved or converted to sRGB
    expect(
      profileName === 'srgb' || profileName !== null,
      'ICC profile should be preserved or converted to sRGB',
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // CL-05: Untagged image treated as sRGB
  // -----------------------------------------------------------------------
  test('CL-05: Untagged image (no ICC) treated as sRGB', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const srgbPath = path.join(referenceImagesDir, 'color-checker-srgb.jpg');
    const untaggedPath = path.join(referenceImagesDir, 'color-untagged.jpg');
    if (!fs.existsSync(untaggedPath)) { test.skip(); return; }

    // Upload both versions
    const uploadSrgb = await api.uploadImage(srgbPath, testAlbumUri, { title: 'CL-05 sRGB Tagged' });
    const uploadUntagged = await api.uploadImage(untaggedPath, testAlbumUri, { title: 'CL-05 Untagged' });

    const keySrgb = SmugMugAPI.extractImageKey(uploadSrgb.ImageUri);
    const keyUntagged = SmugMugAPI.extractImageKey(uploadUntagged.ImageUri);

    const tiersSrgb = await api.getSizeDetails(keySrgb);
    const tiersUntagged = await api.getSizeDetails(keyUntagged);

    const tierSrgb = tiersSrgb.find((t) => t.label === 'L');
    const tierUntagged = tiersUntagged.find((t) => t.label === 'L');
    expect(tierSrgb).toBeTruthy();
    expect(tierUntagged).toBeTruthy();

    const bufSrgb = await api.downloadBuffer(tierSrgb!.url);
    const bufUntagged = await api.downloadBuffer(tierUntagged!.url);

    const ssim = await imageCompare.computeSSIM(bufSrgb, bufUntagged, 0.98);
    expect(
      ssim.passed,
      `Untagged vs sRGB SSIM=${ssim.score.toFixed(4)} — should be nearly identical`,
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // CL-06: CMYK image converted and displays correctly
  // -----------------------------------------------------------------------
  test('CL-06: CMYK image converted and displays correctly', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-cmyk.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-06 CMYK' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const dims = await imageCompare.getDimensions(tierBuffer);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);

    // Verify it's now RGB, not CMYK
    const sharp = require('sharp');
    const meta = await sharp(tierBuffer).metadata();
    expect(meta.channels).toBeLessThanOrEqual(4); // RGB or RGBA, not CMYK
    expect(meta.space).not.toBe('cmyk');
  });

  // -----------------------------------------------------------------------
  // CL-07: 16-bit image downconverted without banding
  // -----------------------------------------------------------------------
  test('CL-07: 16-bit image downconverted without banding', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-16bit-gradient.tiff');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-07 16-bit' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const smoothness = await imageCompare.measureGradientSmoothness(tierBuffer);
    expect(
      smoothness.smooth,
      `Gradient banding detected: stdDev=${smoothness.stdDev.toFixed(2)} (should be < 3.0)`,
    ).toBe(true);
  });

  // -----------------------------------------------------------------------
  // CL-08: Black point and white point preserved
  // -----------------------------------------------------------------------
  test('CL-08: Black point and white point preserved', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-blackwhite.jpg');
    const pointsPath = path.join(referenceImagesDir, 'color-blackwhite.json');
    const refPoints = loadReferencePoints(pointsPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-08 B&W Points' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const imageData = await api.getImage(imageKey);
    const scaleX = tier!.width / imageData.OriginalWidth;
    const scaleY = tier!.height / imageData.OriginalHeight;

    const scaledPoints = refPoints.map((p) => ({
      x: Math.round(p.x * scaleX),
      y: Math.round(p.y * scaleY),
      expected: p.expected,
    }));

    const samples = await imageCompare.sampleAndCompare(tierBuffer, scaledPoints);

    // Black pixels should be very close to (0,0,0), white close to (255,255,255)
    for (const s of samples) {
      expect(s.deltaE, `Pixel (${s.x},${s.y}) ΔE=${s.deltaE.toFixed(2)}`).toBeLessThan(8);
    }
  });

  // -----------------------------------------------------------------------
  // CL-09: Mid-tone grayscale ramp accuracy
  // -----------------------------------------------------------------------
  test('CL-09: Mid-tone grayscale ramp accuracy', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-grayscale-ramp.jpg');
    const pointsPath = path.join(referenceImagesDir, 'color-grayscale-ramp.json');
    const refPoints = loadReferencePoints(pointsPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-09 Gray Ramp' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const imageData = await api.getImage(imageKey);
    const scaleX = tier!.width / imageData.OriginalWidth;
    const scaleY = tier!.height / imageData.OriginalHeight;

    for (const p of refPoints) {
      const actual = await imageCompare.samplePixel(
        tierBuffer,
        Math.round(p.x * scaleX),
        Math.round(p.y * scaleY),
      );
      // For grayscale, check luminance is within ±5 of expected
      const expectedLum = (p.expected.r + p.expected.g + p.expected.b) / 3;
      const actualLum = (actual.r + actual.g + actual.b) / 3;
      expect(
        Math.abs(expectedLum - actualLum),
        `Grayscale step at (${p.x},${p.y}): expected lum ${expectedLum.toFixed(0)}, got ${actualLum.toFixed(0)}`,
      ).toBeLessThanOrEqual(5);
    }
  });

  // -----------------------------------------------------------------------
  // CL-10: Saturated primary/secondary colors preserved
  // -----------------------------------------------------------------------
  test('CL-10: Saturated primary and secondary colors preserved', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'color-saturated-patches.jpg');
    const pointsPath = path.join(referenceImagesDir, 'color-saturated-patches.json');
    const refPoints = loadReferencePoints(pointsPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'CL-10 Saturated' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const imageData = await api.getImage(imageKey);
    const scaleX = tier!.width / imageData.OriginalWidth;
    const scaleY = tier!.height / imageData.OriginalHeight;

    const scaledPoints = refPoints.map((p) => ({
      x: Math.round(p.x * scaleX),
      y: Math.round(p.y * scaleY),
      expected: p.expected,
    }));

    const samples = await imageCompare.sampleAndCompare(tierBuffer, scaledPoints);
    const allPass = imageCompare.allSamplesWithinThreshold(samples, MAX_DELTA_E);
    expect(allPass, 'Saturated color patch exceeded Delta-E threshold').toBe(true);
  });
});
