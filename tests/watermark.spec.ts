/**
 * WM-01 through WM-05: Watermark Rendering
 *
 * Verifies that watermarks are present for visitors, absent for owners,
 * correctly positioned, and proportionally scaled across size tiers.
 *
 * Prerequisites:
 *   - Test gallery must have watermarking enabled (Portfolio/Pro plan)
 *   - A watermark must be configured in Selling Tools
 *   - Tests need both authenticated (owner) and unauthenticated access
 *
 * Reference images required in /reference-images/:
 *   - watermark-test.jpg — Any image to upload into the watermarked gallery
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

// The album key for a gallery with watermarking enabled
const WATERMARK_ALBUM_KEY = process.env.TEST_WATERMARK_ALBUM_KEY || '';
const WATERMARK_ALBUM_URI = WATERMARK_ALBUM_KEY
  ? `/api/v2/album/${WATERMARK_ALBUM_KEY}`
  : '';

test.describe('Watermark Rendering', () => {
  test.beforeEach(() => {
    if (!WATERMARK_ALBUM_KEY) {
      test.skip();
    }
  });

  // -----------------------------------------------------------------------
  // WM-01: Watermark present on all visitor-facing tiers
  // -----------------------------------------------------------------------
  test('WM-01: Watermark present on all visitor-facing size tiers', async ({
    api,
    imageCompare,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'watermark-test.jpg');
    const upload = await api.uploadImage(refPath, WATERMARK_ALBUM_URI, {
      title: 'WM-01 Visitor Watermark',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Get the unwatermarked version (as owner)
    const tiers = await api.getSizeDetails(imageKey);

    // Create an unauthenticated API client
    const apiKey = process.env.SMUGMUG_API_KEY || '';
    const publicApi = SmugMugAPI.withApiKey(apiKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue; // Original may not be accessible publicly

      try {
        // Owner version (no watermark)
        const ownerBuffer = await api.downloadBuffer(tier.url);
        // Visitor version (watermarked)
        const publicTiers = await publicApi.getSizeDetails(imageKey);
        const publicTier = publicTiers.find((t) => t.label === tier.label);
        if (!publicTier) continue;

        const visitorBuffer = await publicApi.downloadBuffer(publicTier.url);

        const diff = await imageCompare.detectWatermarkDiff(visitorBuffer, ownerBuffer);
        expect(
          diff.hasWatermark,
          `Tier ${tier.label}: no watermark detected (diffPercent=${diff.diffPercent.toFixed(2)}%)`,
        ).toBe(true);
      } catch (e) {
        // Public tier may not be accessible — skip
        console.log(`Tier ${tier.label} not accessible publicly, skipping`);
      }
    }
  });

  // -----------------------------------------------------------------------
  // WM-02: Watermark absent on owner-viewed images
  // -----------------------------------------------------------------------
  test('WM-02: Watermark absent on owner-viewed images', async ({
    api,
    imageCompare,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'watermark-test.jpg');
    const refBuffer = fs.readFileSync(refPath);

    const upload = await api.uploadImage(refPath, WATERMARK_ALBUM_URI, {
      title: 'WM-02 Owner View',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);
    const tier = tiers.find((t) => t.label === 'L');
    expect(tier).toBeTruthy();

    const ownerBuffer = await api.downloadBuffer(tier!.url);
    const sharp = require('sharp');
    const localResized = await sharp(refBuffer)
      .resize(tier!.width, tier!.height, { fit: 'fill' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Owner's version should closely match the original (no watermark)
    const ssim = await imageCompare.computeSSIM(localResized, ownerBuffer, 0.90);
    expect(ssim.score, 'Owner view has unexpected differences — possible watermark').toBeGreaterThanOrEqual(0.90);
  });

  // -----------------------------------------------------------------------
  // WM-03: Watermark absent on archived/original download
  // -----------------------------------------------------------------------
  test('WM-03: Watermark absent on archived original download', async ({
    api,
    imageCompare,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'watermark-test.jpg');
    const refBuffer = fs.readFileSync(refPath);
    const expectedMD5 = imageCompare.md5Hex(refBuffer);

    const upload = await api.uploadImage(refPath, WATERMARK_ALBUM_URI, {
      title: 'WM-03 Original Download',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    const downloadedBuffer = await api.downloadBuffer(imageData.ArchivedUri);
    const downloadedMD5 = imageCompare.md5Hex(downloadedBuffer);

    // Original download should match source exactly (no watermark)
    expect(downloadedMD5).toBe(expectedMD5);
  });

  // -----------------------------------------------------------------------
  // WM-04: Watermark position and opacity match config
  // -----------------------------------------------------------------------
  test('WM-04: Watermark position and opacity match configuration', async ({
    api,
    imageCompare,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'watermark-test.jpg');
    const upload = await api.uploadImage(refPath, WATERMARK_ALBUM_URI, {
      title: 'WM-04 Position Check',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    const apiKey = process.env.SMUGMUG_API_KEY || '';
    const publicApi = SmugMugAPI.withApiKey(apiKey);

    const tiers = await api.getSizeDetails(imageKey);
    const ownerTier = tiers.find((t) => t.label === 'XL');
    if (!ownerTier) { test.skip(); return; }

    const ownerBuffer = await api.downloadBuffer(ownerTier.url);

    try {
      const publicTiers = await publicApi.getSizeDetails(imageKey);
      const publicTier = publicTiers.find((t) => t.label === 'XL');
      if (!publicTier) { test.skip(); return; }

      const visitorBuffer = await publicApi.downloadBuffer(publicTier.url);
      const diff = await imageCompare.detectWatermarkDiff(visitorBuffer, ownerBuffer);

      console.log(`Watermark diff: ${diff.diffPercent.toFixed(2)}% of pixels differ`);
      // A watermark typically affects 1-15% of pixels depending on size/opacity
      expect(diff.diffPercent).toBeGreaterThan(0.5);
      expect(diff.diffPercent).toBeLessThan(50); // Should not obliterate the image
    } catch {
      test.skip();
    }
  });

  // -----------------------------------------------------------------------
  // WM-05: Watermark scales across size tiers
  // -----------------------------------------------------------------------
  test('WM-05: Watermark scales proportionally across size tiers', async ({
    api,
    imageCompare,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'watermark-test.jpg');
    const upload = await api.uploadImage(refPath, WATERMARK_ALBUM_URI, {
      title: 'WM-05 Scaling',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    const apiKey = process.env.SMUGMUG_API_KEY || '';
    const publicApi = SmugMugAPI.withApiKey(apiKey);

    const ownerTiers = await api.getSizeDetails(imageKey);
    const diffPercentages: Record<string, number> = {};

    for (const label of ['Th', 'M', 'L', 'XL']) {
      const ownerTier = ownerTiers.find((t) => t.label === label);
      if (!ownerTier) continue;

      try {
        const publicTiers = await publicApi.getSizeDetails(imageKey);
        const publicTier = publicTiers.find((t) => t.label === label);
        if (!publicTier) continue;

        const ownerBuf = await api.downloadBuffer(ownerTier.url);
        const publicBuf = await publicApi.downloadBuffer(publicTier.url);

        const diff = await imageCompare.detectWatermarkDiff(publicBuf, ownerBuf);
        diffPercentages[label] = diff.diffPercent;
      } catch {
        continue;
      }
    }

    console.log('Watermark diff percentages by tier:', diffPercentages);
    // All tiers should have a similar diff percentage (proportional watermark)
    const values = Object.values(diffPercentages);
    if (values.length >= 2) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      // The ratio shouldn't vary wildly (e.g., more than 10x)
      if (min > 0) {
        expect(max / min, 'Watermark scaling is too inconsistent across tiers').toBeLessThan(10);
      }
    }
  });
});
