/**
 * MD-01 through MD-09: Metadata Display (UI Tests)
 *
 * Verifies that EXIF metadata is correctly displayed in the Lightbox
 * info panel, and that privacy settings (Geography, EXIF toggle)
 * properly hide metadata from visitors.
 *
 * These tests require browser authentication and gallery navigation.
 *
 * Reference images required in /reference-images/:
 *   - metadata-rich.jpg  — JPEG with full EXIF (used across metadata tests)
 *   - metadata-stripped.jpg — JPEG with all EXIF removed
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

/**
 * NOTE ON SELECTORS:
 * The selectors below are placeholders. Before running these tests,
 * use `npx playwright codegen` against the target environment to
 * discover the actual DOM structure of the Lightbox info panel.
 *
 * Key elements to identify:
 *   - Lightbox container
 *   - Info panel trigger (I key or info button)
 *   - Camera make/model text
 *   - Exposure settings text
 *   - Focal length text
 *   - Date taken text
 *   - GPS/location section
 */

// Placeholder selectors — replace after codegen discovery
const SELECTORS = {
  lightboxImage: '.sm-lightbox img, [data-testid="lightbox-image"]',
  infoPanel: '.sm-lightbox-info, [data-testid="image-info-panel"]',
  cameraMakeModel: '[data-testid="camera-info"], .sm-image-info-camera',
  exposureSettings: '[data-testid="exposure-info"], .sm-image-info-exposure',
  focalLength: '[data-testid="focal-length"], .sm-image-info-focal',
  dateTaken: '[data-testid="date-taken"], .sm-image-info-date',
  gpsLocation: '[data-testid="gps-location"], .sm-image-info-location',
};

test.describe('Metadata Display — Lightbox Info Panel', () => {
  // Helper: navigate to an image and open the Lightbox info panel
  async function openLightboxInfo(page: any, webUri: string) {
    await page.goto(webUri);
    // TODO: Click image to open Lightbox (depends on gallery style)
    // await page.locator('[data-testid="gallery-image"]').first().click();
    // await page.locator(SELECTORS.lightboxImage).waitFor({ state: 'visible' });

    // Press I to open info panel
    await page.keyboard.press('i');
    // await page.locator(SELECTORS.infoPanel).waitFor({ state: 'visible', timeout: 5_000 });
  }

  // -----------------------------------------------------------------------
  // MD-01: Camera make/model displayed
  // -----------------------------------------------------------------------
  test('MD-01: Lightbox info panel shows camera make and model', async ({
    page,
    api,
    testAlbumUri,
    referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-rich.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MD-01 Camera Info' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);
    const metadata = await api.getMetadata(imageKey);

    await openLightboxInfo(page, imageData.WebUri);

    // TODO: Uncomment after selector discovery
    // const cameraText = await page.locator(SELECTORS.cameraMakeModel).textContent();
    // expect(cameraText).toContain(metadata.Make);
    // expect(cameraText).toContain(metadata.Model);

    test.skip(); // Remove after implementing selectors
  });

  // -----------------------------------------------------------------------
  // MD-02: Exposure settings displayed
  // -----------------------------------------------------------------------
  test('MD-02: Lightbox info panel shows exposure settings', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // TODO: Same pattern as MD-01
    // Verify shutter speed, aperture, and ISO are visible
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-03: Focal length displayed
  // -----------------------------------------------------------------------
  test('MD-03: Lightbox info panel shows focal length', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // TODO: Verify focal length text matches metadata
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-04: Date taken displayed
  // -----------------------------------------------------------------------
  test('MD-04: Lightbox info panel shows date taken', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // TODO: Verify date matches DateTimeOriginal
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-05: GPS shown when Geography enabled
  // -----------------------------------------------------------------------
  test('MD-05: Lightbox shows GPS/location when Geography enabled', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // Precondition: Gallery has Geography setting enabled
    // TODO: Verify location/map element is visible in the info panel
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-06: GPS hidden when Geography disabled
  // -----------------------------------------------------------------------
  test('MD-06: Lightbox hides GPS when Geography disabled', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // Precondition: Gallery has Geography setting disabled
    // TODO: Verify location element is NOT present in the info panel
    // await expect(page.locator(SELECTORS.gpsLocation)).not.toBeVisible();
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-07: GPS hidden when site-level GPS data is off
  // -----------------------------------------------------------------------
  test('MD-07: Lightbox hides GPS when site-level GPS is off', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // Precondition: Site Settings > Privacy > Image Analysis GPS is disabled
    // TODO: Upload geotagged image, verify no location in info panel
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-08: EXIF hidden when gallery EXIF setting is off
  // -----------------------------------------------------------------------
  test('MD-08: EXIF hidden when gallery EXIF setting is off', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    // Precondition: Album EXIF display setting is disabled
    // TODO: Verify info panel doesn't show camera/exposure/focal data
    test.skip();
  });

  // -----------------------------------------------------------------------
  // MD-09: Image without EXIF renders info panel gracefully
  // -----------------------------------------------------------------------
  test('MD-09: No EXIF image shows clean info panel without errors', async ({
    page, api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-stripped.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MD-09 No EXIF' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    await openLightboxInfo(page, imageData.WebUri);

    // TODO: Verify:
    // - No "undefined" or "null" text visible
    // - No JavaScript errors in console
    // - Info panel renders without broken layout
    // const panelText = await page.locator(SELECTORS.infoPanel).textContent();
    // expect(panelText).not.toContain('undefined');
    // expect(panelText).not.toContain('null');

    test.skip(); // Remove after implementing selectors
  });
});
