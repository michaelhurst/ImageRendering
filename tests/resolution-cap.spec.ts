/**
 * RC-01 through RC-04: Display Resolution Cap (Photo Protection)
 *
 * Verifies that the photo protection display resolution cap limits
 * the maximum image size served to visitors while preserving full
 * resolution for the gallery owner.
 *
 * Prerequisites:
 *   - A test gallery with photo protection enabled and display
 *     resolution capped (e.g., to Medium — 600px longest edge)
 *   - Both authenticated (owner) and unauthenticated API access
 *
 * Reference images required in /reference-images/:
 *   - resolution-cap-test.jpg — A high-resolution image (e.g., 6000×4000)
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

// Album with resolution cap enabled — set in .env or here
const CAPPED_ALBUM_KEY = process.env.TEST_CAPPED_ALBUM_KEY || '';
const CAPPED_ALBUM_URI = CAPPED_ALBUM_KEY ? `/api/v2/album/${CAPPED_ALBUM_KEY}` : '';

// The expected maximum longest edge for the configured cap
// (e.g., 600 for "Medium", 800 for "Large", 1024 for "XLarge")
const EXPECTED_MAX_EDGE = parseInt(process.env.TEST_RESOLUTION_CAP_MAX || '600', 10);

test.describe('Display Resolution Cap (Photo Protection)', () => {
  test.beforeEach(() => {
    if (!CAPPED_ALBUM_KEY) {
      test.skip();
    }
  });

  // -----------------------------------------------------------------------
  // RC-01: Capped resolution limits max served size
  // -----------------------------------------------------------------------
  test('RC-01: Capped resolution limits maximum served size for visitors', async ({
    imageCompare,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'resolution-cap-test.jpg');
    const apiKey = process.env.SMUGMUG_API_KEY || '';
    const publicApi = SmugMugAPI.withApiKey(apiKey);

    // Upload as owner
    // NOTE: Upload requires auth — this test assumes image is pre-uploaded
    // or uses the authenticated api fixture for upload, then public for fetch.

    // For a pre-uploaded image, get album images
    const { images } = await publicApi.getAlbumImages(CAPPED_ALBUM_KEY, 1, 1);
    if (images.length === 0) { test.skip(); return; }

    const imageKey = images[0].ImageKey || SmugMugAPI.extractImageKey(images[0].Uris?.Image?.Uri || '');
    const tiers = await publicApi.getSizeDetails(imageKey);

    for (const tier of tiers) {
      if (tier.label === 'O') continue; // Original shouldn't be accessible
      const tierBuffer = await publicApi.downloadBuffer(tier.url);
      const dims = await imageCompare.getDimensions(tierBuffer);
      const longestEdge = Math.max(dims.width, dims.height);

      expect(
        longestEdge,
        `Tier ${tier.label} (${dims.width}×${dims.height}) exceeds cap of ${EXPECTED_MAX_EDGE}px`,
      ).toBeLessThanOrEqual(EXPECTED_MAX_EDGE);
    }
  });

  // -----------------------------------------------------------------------
  // RC-02: Capped resolution doesn't affect owner's view
  // -----------------------------------------------------------------------
  test('RC-02: Owner can still access full resolution', async ({
    api,
    imageCompare,
    referenceImagesDir,
  }) => {
    const { images } = await api.getAlbumImages(CAPPED_ALBUM_KEY, 1, 1);
    if (images.length === 0) { test.skip(); return; }

    const imageKey = images[0].ImageKey || SmugMugAPI.extractImageKey(images[0].Uris?.Image?.Uri || '');
    const tiers = await api.getSizeDetails(imageKey);

    // Owner should have access to tiers beyond the cap
    const largeTiers = tiers.filter((t) => {
      if (t.label === 'O') return false;
      return Math.max(t.width, t.height) > EXPECTED_MAX_EDGE;
    });

    expect(
      largeTiers.length,
      'Owner should have access to tiers larger than the resolution cap',
    ).toBeGreaterThan(0);

    // Verify the large tier is actually downloadable
    const largest = largeTiers.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const buffer = await api.downloadBuffer(largest.url);
    const dims = await imageCompare.getDimensions(buffer);
    expect(Math.max(dims.width, dims.height)).toBeGreaterThan(EXPECTED_MAX_EDGE);
  });

  // -----------------------------------------------------------------------
  // RC-03: Owner can download full-resolution original
  // -----------------------------------------------------------------------
  test('RC-03: Owner archived download is full resolution', async ({
    api,
    imageCompare,
  }) => {
    const { images } = await api.getAlbumImages(CAPPED_ALBUM_KEY, 1, 1);
    if (images.length === 0) { test.skip(); return; }

    const imageKey = images[0].ImageKey || SmugMugAPI.extractImageKey(images[0].Uris?.Image?.Uri || '');
    const imageData = await api.getImage(imageKey);

    const downloadedBuffer = await api.downloadBuffer(imageData.ArchivedUri);
    const dims = await imageCompare.getDimensions(downloadedBuffer);

    // Original should be much larger than the cap
    expect(Math.max(dims.width, dims.height)).toBeGreaterThan(EXPECTED_MAX_EDGE);
    expect(dims.width).toBe(imageData.OriginalWidth);
    expect(dims.height).toBe(imageData.OriginalHeight);
  });

  // -----------------------------------------------------------------------
  // RC-04: Lightbox respects resolution cap for visitors (UI test)
  // -----------------------------------------------------------------------
  test('RC-04: Lightbox respects resolution cap for visitors', async ({
    page,
    imageCompare,
  }) => {
    // This test requires visiting the gallery as an unauthenticated user
    // and inspecting the image source loaded in Lightbox.

    // TODO: Navigate to the capped gallery's public URL (no auth)
    // TODO: Open Lightbox on an image
    // TODO: Inspect the img src URL or use page.evaluate to get naturalWidth/naturalHeight
    // TODO: Verify dimensions don't exceed the cap

    // Example approach:
    // await page.goto('https://inside.smugmug.net/...gallery-url...');
    // await page.locator('[data-testid="gallery-image"]').first().click();
    // const imgSrc = await page.locator('.sm-lightbox img').getAttribute('src');
    // const naturalDims = await page.evaluate(() => {
    //   const img = document.querySelector('.sm-lightbox img') as HTMLImageElement;
    //   return { width: img.naturalWidth, height: img.naturalHeight };
    // });
    // const longestEdge = Math.max(naturalDims.width, naturalDims.height);
    // expect(longestEdge).toBeLessThanOrEqual(EXPECTED_MAX_EDGE);

    test.skip(); // Implement after selector discovery
  });
});
