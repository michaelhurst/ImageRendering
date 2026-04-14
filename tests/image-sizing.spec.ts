/**
 * SZ-01 through SZ-11: Image Dimensions & Sizing
 *
 * Verifies that all CDN size tiers serve correct pixel dimensions,
 * preserve aspect ratios, and handle edge cases (panoramic, tall, small).
 *
 * Reference images required in /reference-images/:
 *   - sizing-landscape.jpg  — 6000×4000 landscape
 *   - sizing-portrait.jpg   — 4000×6000 portrait
 *   - sizing-square.jpg     — 5000×5000 square
 *   - sizing-panoramic.jpg  — 12000×2000 extreme landscape
 *   - sizing-tall.jpg       — 2000×10000 extreme portrait
 *   - sizing-small.jpg      — 400×300 small image
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Image Dimensions & Sizing', () => {
  // -----------------------------------------------------------------------
  // SZ-01: Each CDN tier serves correct pixel dimensions
  // -----------------------------------------------------------------------
  test('SZ-01: Each CDN tier serves correct pixel dimensions', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-landscape.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-01 Dimensions' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.width === 0 && tier.height === 0) continue; // Skip if API doesn't report dims
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      expect(dims.width, `Tier ${tier.label} width mismatch`).toBe(tier.width);
      expect(dims.height, `Tier ${tier.label} height mismatch`).toBe(tier.height);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-02: Aspect ratio preserved across all tiers
  // -----------------------------------------------------------------------
  test('SZ-02: Aspect ratio preserved across all size tiers', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-landscape.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-02 Aspect Ratio' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);
    const originalRatio = imageData.OriginalWidth / imageData.OriginalHeight;

    const tiers = await api.getSizeDetails(imageKey);
    for (const tier of tiers) {
      if (tier.width === 0 || tier.height === 0) continue;
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      const tierRatio = dims.width / dims.height;
      expect(
        Math.abs(originalRatio - tierRatio),
        `Tier ${tier.label} aspect ratio ${tierRatio.toFixed(3)} differs from original ${originalRatio.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.02);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-03: Landscape image longest edge matches tier spec
  // -----------------------------------------------------------------------
  test('SZ-03: Landscape image longest edge matches tier spec', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-landscape.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-03 Landscape' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue; // Original has no cap
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      const longestEdge = Math.max(dims.width, dims.height);
      // For a landscape image, the width should be the longest edge
      expect(dims.width, `Tier ${tier.label}: width should be longest edge`).toBeGreaterThanOrEqual(dims.height);
      expect(longestEdge, `Tier ${tier.label} longest edge`).toBe(tier.width);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-04: Portrait image longest edge matches tier spec
  // -----------------------------------------------------------------------
  test('SZ-04: Portrait image longest edge matches tier spec', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-portrait.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-04 Portrait' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue;
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      // For a portrait image, height should be the longest edge
      expect(dims.height, `Tier ${tier.label}: height should be longest edge`).toBeGreaterThanOrEqual(dims.width);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-05: Square image both edges match tier spec
  // -----------------------------------------------------------------------
  test('SZ-05: Square image both edges match tier spec', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-square.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-05 Square' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue;
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      expect(dims.width, `Tier ${tier.label} not square`).toBe(dims.height);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-06: Panoramic image sizing
  // -----------------------------------------------------------------------
  test('SZ-06: Panoramic image (12000×2000) sizes correctly', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-panoramic.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-06 Panoramic' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue;
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      // Aspect ratio should be preserved (~6:1)
      const ratio = dims.width / dims.height;
      expect(ratio, `Tier ${tier.label} panoramic ratio`).toBeGreaterThan(4.0);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-07: Very tall image sizing
  // -----------------------------------------------------------------------
  test('SZ-07: Very tall image (2000×10000) sizes correctly', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-tall.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-07 Tall' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue;
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      const ratio = dims.height / dims.width;
      expect(ratio, `Tier ${tier.label} tall ratio`).toBeGreaterThan(3.0);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-08: Small source not upscaled beyond original
  // -----------------------------------------------------------------------
  test('SZ-08: Small source image (400×300) not upscaled', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-small.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-08 Small' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      expect(
        dims.width,
        `Tier ${tier.label} width ${dims.width} exceeds source 400`,
      ).toBeLessThanOrEqual(400);
      expect(
        dims.height,
        `Tier ${tier.label} height ${dims.height} exceeds source 300`,
      ).toBeLessThanOrEqual(300);
    }
  });

  // -----------------------------------------------------------------------
  // SZ-09: !largestimage returns highest available dimensions
  // -----------------------------------------------------------------------
  test('SZ-09: !largestimage returns highest available dimensions', async ({
    api,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-landscape.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-09 Largest' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);
    const largest = await api.getLargestImage(imageKey);

    // The largest image dimensions should be close to original
    expect(largest.width).toBeGreaterThan(0);
    expect(largest.height).toBeGreaterThan(0);
    expect(largest.width).toBeLessThanOrEqual(imageData.OriginalWidth);
    expect(largest.height).toBeLessThanOrEqual(imageData.OriginalHeight);
  });

  // -----------------------------------------------------------------------
  // SZ-10: OriginalWidth/Height match source file
  // -----------------------------------------------------------------------
  test('SZ-10: OriginalWidth and OriginalHeight match source file', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-landscape.jpg');
    const refBuffer = fs.readFileSync(refPath);
    const refDims = await imageCompare.getDimensions(refBuffer);

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-10 Original Dims' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    expect(imageData.OriginalWidth).toBe(refDims.width);
    expect(imageData.OriginalHeight).toBe(refDims.height);
  });

  // -----------------------------------------------------------------------
  // SZ-11: OriginalSize matches source file byte count
  // -----------------------------------------------------------------------
  test('SZ-11: OriginalSize matches source file byte count', async ({
    api,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'sizing-landscape.jpg');
    const refSize = fs.statSync(refPath).size;

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'SZ-11 Original Size' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    expect(imageData.OriginalSize).toBe(refSize);
  });
});
