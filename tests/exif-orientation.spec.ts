/**
 * OR-01 through OR-12: EXIF Orientation
 *
 * Verifies that SmugMug correctly interprets all 8 EXIF orientation tags,
 * corrects display dimensions, and applies orientation across all size tiers
 * and UI views (Lightbox, Organize thumbnails).
 *
 * Reference images required in /reference-images/:
 *   - orientation-1.jpg through orientation-8.jpg
 *     Each should be the SAME visual content (e.g., an arrow pointing up
 *     with text "TOP") but saved with different EXIF orientation tags.
 *     The raw pixel layout varies per tag; after correction all should
 *     look identical (arrow pointing up, text readable).
 *
 *   - orientation-reference.jpg
 *     The "ground truth" — the image as it should appear after correction
 *     (orientation tag 1, normal).
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import { correctedDimensions } from '../helpers/exif-utils';
import * as path from 'path';
import * as fs from 'fs';

const SSIM_THRESHOLD = 0.90;

test.describe('EXIF Orientation', () => {
  // -----------------------------------------------------------------------
  // OR-01 through OR-08: All 8 orientation tags display correctly
  // -----------------------------------------------------------------------
  for (let tag = 1; tag <= 8; tag++) {
    test(`OR-0${tag}: Orientation ${tag} displays correctly`, async ({
      api,
      imageCompare,
      testAlbumUri,
      referenceImagesDir,
    }) => {
      const refPath = path.join(referenceImagesDir, `orientation-${tag}.jpg`);
      const groundTruthPath = path.join(referenceImagesDir, 'orientation-reference.jpg');
      if (!fs.existsSync(refPath)) { test.skip(); return; }

      const upload = await api.uploadImage(refPath, testAlbumUri, {
        title: `OR-0${tag} Orientation ${tag}`,
      });
      const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

      // Fetch the L tier (post-processing, orientation-corrected)
      const tiers = await api.getSizeDetails(imageKey);
      const tier = tiers.find((t) => t.label === 'L');
      expect(tier, `No L tier for orientation-${tag} image`).toBeTruthy();

      const tierBuffer = await api.downloadBuffer(tier!.url);

      // Compare against ground truth at same dimensions
      const groundTruth = fs.readFileSync(groundTruthPath);
      const sharp = require('sharp');
      const resizedGroundTruth = await sharp(groundTruth)
        .resize(tier!.width, tier!.height, { fit: 'fill' })
        .jpeg()
        .toBuffer();

      const ssim = await imageCompare.computeSSIM(resizedGroundTruth, tierBuffer, SSIM_THRESHOLD);
      expect(
        ssim.passed,
        `Orientation ${tag}: SSIM=${ssim.score.toFixed(4)} below ${SSIM_THRESHOLD} — image may not be rotated/flipped correctly`,
      ).toBe(true);
    });
  }

  // -----------------------------------------------------------------------
  // OR-09: Orientation correction updates dimensions
  // -----------------------------------------------------------------------
  test('OR-09: Orientation 6 swaps reported dimensions to portrait', async ({
    api,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    // orientation-6.jpg has raw pixels in landscape (e.g., 6000×4000)
    // but EXIF tag 6 means it should display as portrait (4000×6000)
    const refPath = path.join(referenceImagesDir, 'orientation-6.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'OR-09 Dimension Swap',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    // After orientation correction, width < height (portrait)
    expect(
      imageData.OriginalWidth,
      `Expected portrait after orientation correction: width=${imageData.OriginalWidth} should be < height=${imageData.OriginalHeight}`,
    ).toBeLessThan(imageData.OriginalHeight);
  });

  // -----------------------------------------------------------------------
  // OR-10: Orientation corrected across all size tiers
  // -----------------------------------------------------------------------
  test('OR-10: Orientation corrected consistently across all size tiers', async ({
    api,
    imageCompare,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'orientation-6.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'OR-10 All Tiers',
    });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const tiers = await api.getSizeDetails(imageKey);

    for (const tier of tiers) {
      const tierBuffer = await api.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      // Every tier should be portrait (height > width) after orientation correction
      expect(
        dims.height,
        `Tier ${tier.label} (${dims.width}×${dims.height}) should be portrait`,
      ).toBeGreaterThan(dims.width);
    }
  });

  // -----------------------------------------------------------------------
  // OR-11: Orientation corrected in Lightbox (UI test)
  // -----------------------------------------------------------------------
  test('OR-11: Orientation corrected in Lightbox', async ({
    page,
    api,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'orientation-6.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'OR-11 Lightbox',
    });

    // Navigate to the image's web page and open Lightbox
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);
    await page.goto(imageData.WebUri);

    // TODO: Click the image to open Lightbox — selector depends on gallery style
    // await page.locator('[data-testid="gallery-image"]').first().click();

    // Take a screenshot of the Lightbox image
    // const lightboxImage = page.locator('.sm-lightbox-image img, .sm-lightbox img');
    // await lightboxImage.waitFor({ state: 'visible', timeout: 10_000 });
    // const screenshot = await lightboxImage.screenshot();

    // Verify the screenshot is portrait-oriented
    // const dims = await imageCompare.getDimensions(screenshot);
    // expect(dims.height).toBeGreaterThan(dims.width);

    // NOTE: Uncomment and adjust selectors once Lightbox DOM structure is confirmed.
    // For now, this test serves as a scaffold.
    test.skip();
  });

  // -----------------------------------------------------------------------
  // OR-12: Orientation corrected in Organize thumbnails (UI test)
  // -----------------------------------------------------------------------
  test('OR-12: Orientation corrected in Organize thumbnails', async ({
    page,
    api,
    testAlbumUri,
    testAlbumKey,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'orientation-6.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    // Upload the image
    await api.uploadImage(refPath, testAlbumUri, {
      title: 'OR-12 Organize Thumb',
    });

    // Navigate to the Organize view for this album
    // TODO: Replace with actual gallery path
    // await page.goto(`/app/organize/.../${testAlbumKey}`);

    // Find the thumbnail and verify it's portrait
    // const thumb = page.locator('.sm-photo-tile img').last();
    // await thumb.waitFor({ state: 'visible', timeout: 10_000 });
    // const box = await thumb.boundingBox();
    // expect(box).toBeTruthy();
    // expect(box!.height).toBeGreaterThan(box!.width);

    // NOTE: Uncomment and adjust once Organize DOM structure is confirmed.
    test.skip();
  });
});
