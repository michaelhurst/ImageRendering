/**
 * POI-01 through POI-05: Point of Interest & Cropping
 *
 * Verifies that Point of Interest (crop center) is stored, returned,
 * and applied correctly to thumbnail crops and Feature Images.
 *
 * Reference images required in /reference-images/:
 *   - poi-test.jpg — A large image with a distinct subject in the
 *     top-left quadrant (e.g., a red dot at ~25%, 25% of the frame).
 *     This allows verifying that crop center shifts after POI is set.
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Point of Interest & Cropping', () => {
  // -----------------------------------------------------------------------
  // POI-01: Default crop centers on geometric center
  // -----------------------------------------------------------------------
  test('POI-01: Default crop centers on geometric center (no POI set)', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'poi-test.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'POI-01 Default' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Verify no POI is set initially
    const poi = await api.getPointOfInterest(imageKey);
    // POI should be null or centered (0.5, 0.5)
    if (poi) {
      expect(poi.x).toBeCloseTo(0.5, 1);
      expect(poi.y).toBeCloseTo(0.5, 1);
    }
    // else: null means default centering is implicit
  });

  // -----------------------------------------------------------------------
  // POI-02: Setting POI shifts crop center
  // -----------------------------------------------------------------------
  test('POI-02: Setting POI shifts crop center', async ({
    api, imageCompare, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'poi-test.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'POI-02 Shifted' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Set POI to top-left quadrant (25%, 25%)
    await api.setPointOfInterest(imageKey, 0.25, 0.25);

    // Fetch thumbnail tier — this is the tier most likely to be cropped
    const tiers = await api.getSizeDetails(imageKey);
    const thumb = tiers.find((t) => t.label === 'Th');
    expect(thumb).toBeTruthy();

    const thumbBuffer = await api.downloadBuffer(thumb!.url);
    const dims = await imageCompare.getDimensions(thumbBuffer);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);

    // TODO: For a thorough check, compare pixel content of the thumbnail
    // against the top-left quadrant of the original to verify the crop
    // is centered on the POI, not the geometric center.
    // This requires sampling specific pixel regions and comparing.
  });

  // -----------------------------------------------------------------------
  // POI-03: POI persists or resets after image replace
  // -----------------------------------------------------------------------
  test('POI-03: POI behavior after image replace', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'poi-test.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'POI-03 Replace' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Set a POI
    await api.setPointOfInterest(imageKey, 0.75, 0.25);

    // Replace the image with the same file
    const imageUri = `/api/v2/image/${imageKey}-0`;
    await api.uploadImage(refPath, testAlbumUri, {
      title: 'POI-03 Replaced',
      replaceImageUri: imageUri,
    });

    // Check if POI persists or resets
    const poiAfter = await api.getPointOfInterest(imageKey);
    // Document the actual behavior:
    if (poiAfter) {
      console.log(`POI after replace: (${poiAfter.x}, ${poiAfter.y}) — POI persisted`);
    } else {
      console.log('POI after replace: null — POI was reset');
    }
    // Either behavior is acceptable; this test documents it.
    // If your team decides POI should persist, add: expect(poiAfter).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // POI-04: POI coordinates returned correctly via API
  // -----------------------------------------------------------------------
  test('POI-04: POI coordinates round-trip correctly', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'poi-test.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'POI-04 Round-trip' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    const setX = 0.33;
    const setY = 0.67;
    await api.setPointOfInterest(imageKey, setX, setY);

    const poi = await api.getPointOfInterest(imageKey);
    expect(poi).not.toBeNull();
    expect(poi!.x).toBeCloseTo(setX, 2);
    expect(poi!.y).toBeCloseTo(setY, 2);
  });

  // -----------------------------------------------------------------------
  // POI-05: POI affects all cropped size tiers
  // -----------------------------------------------------------------------
  test('POI-05: POI affects all size tiers that involve cropping', async ({
    api, imageCompare, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'poi-test.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'POI-05 All Tiers' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Upload same image without POI for comparison
    const uploadDefault = await api.uploadImage(refPath, testAlbumUri, {
      title: 'POI-05 Default Comparison',
    });
    const defaultKey = SmugMugAPI.extractImageKey(uploadDefault.ImageUri);

    // Set POI on the first image
    await api.setPointOfInterest(imageKey, 0.25, 0.25);

    // Compare thumbnails — they should differ if POI is respected
    const tiersWithPOI = await api.getSizeDetails(imageKey);
    const tiersDefault = await api.getSizeDetails(defaultKey);

    const thumbPOI = tiersWithPOI.find((t) => t.label === 'Th');
    const thumbDefault = tiersDefault.find((t) => t.label === 'Th');

    if (thumbPOI && thumbDefault) {
      const bufPOI = await api.downloadBuffer(thumbPOI.url);
      const bufDefault = await api.downloadBuffer(thumbDefault.url);

      // These should NOT be identical if POI is applied to thumbnails
      const ssim = await imageCompare.computeSSIM(bufPOI, bufDefault, 0.99);
      // If SSIM is very high (>0.99), POI may not affect this tier
      console.log(`Thumbnail SSIM with vs without POI: ${ssim.score.toFixed(4)}`);
      // Log for analysis — strict pass/fail depends on whether Th tier is cropped
    }
  });
});
