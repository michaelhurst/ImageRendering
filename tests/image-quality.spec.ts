/**
 * IQ-01 through IQ-10: Image Quality & Compression
 *
 * Verifies that SmugMug preserves image quality across upload, resize,
 * and format conversion. Tests cover JPEG, PNG, GIF, and HEIC formats.
 *
 * Reference images required in /reference-images/:
 *   - quality-detail.jpg       — JPEG with fine detail (text, fabric), known Q95
 *   - quality-reference.png    — PNG with lossless reference data
 *   - quality-reference.gif    — GIF reference
 *   - quality-reference.heic   — HEIC reference
 *   - quality-noisy.jpg        — High-ISO image with natural noise
 *   - quality-resolution-chart.jpg — Resolution chart with fine lines
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

const SSIM_THRESHOLD = 0.92;
const SHARPNESS_MIN_VARIANCE = 50;

test.describe('Image Quality & Compression', () => {
  let uploadedImageKey: string;

  // -----------------------------------------------------------------------
  // IQ-01: JPEG quality preserved at each CDN size tier
  // -----------------------------------------------------------------------
  test('IQ-01: JPEG quality preserved at each CDN size tier', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-detail.jpg');
    const refBuffer = fs.readFileSync(refPath);

    // Upload reference image
    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-01 Quality Detail',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Fetch all size tiers
    const tiers = await api.getSizeDetails(imageKey);
    expect(tiers.length).toBeGreaterThan(0);

    for (const tier of tiers) {
      const tierBuffer = await api.downloadBuffer(tier.url);

      // Resize reference to same dimensions for fair comparison
      const sharp = require('sharp');
      const resizedRef = await sharp(refBuffer)
        .resize(tier.width, tier.height, { fit: 'fill' })
        .jpeg()
        .toBuffer();

      const ssim = await imageCompare.computeSSIM(resizedRef, tierBuffer, SSIM_THRESHOLD);
      expect(
        ssim.passed,
        `Tier ${tier.label} (${tier.width}×${tier.height}) SSIM=${ssim.score.toFixed(4)} below threshold ${SSIM_THRESHOLD}`,
      ).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // IQ-02: Original download matches uploaded file
  // -----------------------------------------------------------------------
  test('IQ-02: Original download matches uploaded file byte-for-byte', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-detail.jpg');
    const refBuffer = fs.readFileSync(refPath);
    const expectedMD5 = imageCompare.md5Hex(refBuffer);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-02 MD5 Match',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    // Verify ArchivedMD5 from API
    // Note: SmugMug returns MD5 in hex or base64 — compare both
    const expectedMD5Base64 = imageCompare.md5Base64(refBuffer);
    expect(imageData.ArchivedMD5).toBe(expectedMD5Base64);

    // Download and verify byte-for-byte
    const downloadedBuffer = await api.downloadBuffer(imageData.ArchivedUri);
    const downloadedMD5 = imageCompare.md5Hex(downloadedBuffer);
    expect(downloadedMD5).toBe(expectedMD5);
  });

  // -----------------------------------------------------------------------
  // IQ-03: Original download preserves file size
  // -----------------------------------------------------------------------
  test('IQ-03: Original download preserves file size', async ({
    api,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-detail.jpg');
    const refSize = fs.statSync(refPath).size;

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-03 File Size',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    expect(imageData.ArchivedSize).toBe(refSize);
    expect(imageData.OriginalSize).toBe(refSize);
  });

  // -----------------------------------------------------------------------
  // IQ-04: No double-compression on JPEG uploads
  // -----------------------------------------------------------------------
  test('IQ-04: No double-compression on JPEG uploads', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-detail.jpg');
    const refBuffer = fs.readFileSync(refPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-04 Double Compression',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    // Find the largest non-original tier
    const nonOriginal = tiers
      .filter((t) => t.label !== 'O')
      .sort((a, b) => b.width * b.height - a.width * a.height);

    expect(nonOriginal.length).toBeGreaterThan(0);
    const largest = nonOriginal[0];
    const tierBuffer = await api.downloadBuffer(largest.url);

    // Locally resize the reference to the same dimensions and single-compress
    const sharp = require('sharp');
    const localResized = await sharp(refBuffer)
      .resize(largest.width, largest.height, { fit: 'fill' })
      .jpeg({ quality: 85 })
      .toBuffer();

    // SSIM between SmugMug's version and a single-pass local resize
    // should be very close — large gaps indicate double-compression
    const ssim = await imageCompare.computeSSIM(localResized, tierBuffer, 0.90);
    expect(
      ssim.score,
      `Double-compression detected: SSIM=${ssim.score.toFixed(4)} for tier ${largest.label}`,
    ).toBeGreaterThanOrEqual(0.90);
  });

  // -----------------------------------------------------------------------
  // IQ-05: PNG served losslessly at original size
  // -----------------------------------------------------------------------
  test('IQ-05: PNG served losslessly at original size', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-reference.png');
    const refBuffer = fs.readFileSync(refPath);
    const expectedMD5 = imageCompare.md5Hex(refBuffer);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-05 PNG Lossless',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    const downloadedBuffer = await api.downloadBuffer(imageData.ArchivedUri);
    const downloadedMD5 = imageCompare.md5Hex(downloadedBuffer);
    expect(downloadedMD5).toBe(expectedMD5);
  });

  // -----------------------------------------------------------------------
  // IQ-06: PNG resized tiers convert to JPEG acceptably
  // -----------------------------------------------------------------------
  test('IQ-06: PNG resized tiers convert to JPEG without severe quality loss', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-reference.png');
    const refBuffer = fs.readFileSync(refPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-06 PNG Resize',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    // Test M and L tiers
    const targetLabels = ['M', 'L'];
    for (const label of targetLabels) {
      const tier = tiers.find((t) => t.label === label);
      if (!tier) continue;

      const tierBuffer = await api.downloadBuffer(tier.url);
      const sharp = require('sharp');
      const localResized = await sharp(refBuffer)
        .resize(tier.width, tier.height, { fit: 'fill' })
        .jpeg({ quality: 90 })
        .toBuffer();

      const ssim = await imageCompare.computeSSIM(localResized, tierBuffer, SSIM_THRESHOLD);
      expect(
        ssim.passed,
        `PNG→JPEG tier ${label} SSIM=${ssim.score.toFixed(4)} below ${SSIM_THRESHOLD}`,
      ).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // IQ-07: GIF upload preserves original
  // -----------------------------------------------------------------------
  test('IQ-07: GIF upload preserves original at archived size', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-reference.gif');
    const refBuffer = fs.readFileSync(refPath);
    const expectedMD5 = imageCompare.md5Hex(refBuffer);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-07 GIF Original',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    const downloadedBuffer = await api.downloadBuffer(imageData.ArchivedUri);
    expect(imageCompare.md5Hex(downloadedBuffer)).toBe(expectedMD5);
  });

  // -----------------------------------------------------------------------
  // IQ-08: HEIC upload produces viewable JPEG conversion
  // -----------------------------------------------------------------------
  test('IQ-08: HEIC upload produces viewable JPEG conversion', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-reference.heic');
    if (!fs.existsSync(refPath)) {
      test.skip();
      return;
    }

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-08 HEIC Conversion',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    // Find L or XL tier
    const tier = tiers.find((t) => t.label === 'L' || t.label === 'XL');
    expect(tier, 'No L or XL tier found for HEIC image').toBeTruthy();

    const tierBuffer = await api.downloadBuffer(tier!.url);
    const dims = await imageCompare.getDimensions(tierBuffer);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // IQ-09: High-ISO image doesn't gain additional artifacts
  // -----------------------------------------------------------------------
  test('IQ-09: High-ISO noisy image not degraded by resize', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-noisy.jpg');
    const refBuffer = fs.readFileSync(refPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-09 Noisy Image',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    if (!tier) { test.skip(); return; }

    const tierBuffer = await api.downloadBuffer(tier.url);
    const sharp = require('sharp');
    const localResized = await sharp(refBuffer)
      .resize(tier.width, tier.height, { fit: 'fill' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const ssim = await imageCompare.computeSSIM(localResized, tierBuffer, 0.88);
    expect(ssim.score).toBeGreaterThanOrEqual(0.88);
  });

  // -----------------------------------------------------------------------
  // IQ-10: Image sharpness maintained after resize
  // -----------------------------------------------------------------------
  test('IQ-10: Image sharpness maintained after resize', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'quality-resolution-chart.jpg');
    const refBuffer = fs.readFileSync(refPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'IQ-10 Sharpness',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const label of ['M', 'L']) {
      const tier = tiers.find((t) => t.label === label);
      if (!tier) continue;

      const tierBuffer = await api.downloadBuffer(tier.url);
      const sharpness = await imageCompare.measureSharpness(tierBuffer, SHARPNESS_MIN_VARIANCE);
      expect(
        sharpness.passed,
        `Tier ${label} sharpness variance=${sharpness.laplacianVariance.toFixed(1)} below ${SHARPNESS_MIN_VARIANCE}`,
      ).toBe(true);
    }
  });
});
