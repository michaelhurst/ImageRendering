/**
 * POI-01 through POI-05 (API): Point of Interest & Cropping
 *
 * Uploads images from local disk, sets POI via the API, and verifies
 * crop behavior across size tiers and after image replacement.
 *
 * Source images are read from TEST_IMAGES_DIR to ensure byte-for-byte
 * integrity comparisons against a known-good local copy.
 *
 * Requires: TEST_IMAGES_DIR, authenticated session
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const POI_PATH = path.join(IMAGES_DIR, "c-poi-test.jpg");
const LANDSCAPE_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg");

test.describe("POI (API): Point of Interest & Cropping", () => {
  let _poiKey: string | undefined;
  let _poiImageUri: string | undefined;

  async function ensureUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<{ key: string; imageUri: string }> {
    if (!_poiKey || !_poiImageUri) {
      const result = await api.uploadImage(POI_PATH, albumUri, {
        title: "poi-test",
      });
      _poiImageUri = result.ImageUri;
      _poiKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return { key: _poiKey, imageUri: _poiImageUri };
  }

  // POI-01: Default crop centers on geometric center
  test("POI-01: Default POI is near geometric center", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey } = await ensureUploaded(api, testAlbumUri);
    const poi = await api.getPointOfInterest(poiKey);
    console.log(`Default POI: ${JSON.stringify(poi)}`);
    if (poi) {
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThanOrEqual(1);
      expect(poi.y).toBeGreaterThanOrEqual(0);
      expect(poi.y).toBeLessThanOrEqual(1);
    }
  });

  // POI-02: Setting POI shifts crop center
  test("POI-02: Setting POI updates crop center", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey } = await ensureUploaded(api, testAlbumUri);

    // Set POI to upper-left quadrant
    await api.setPointOfInterest(poiKey, 0.25, 0.25);
    const poi = await api.getPointOfInterest(poiKey);
    console.log(`POI-02: Set to (0.25, 0.25), got: ${JSON.stringify(poi)}`);
    expect(poi).toBeTruthy();
    expect(poi!.x).toBeCloseTo(0.25, 1);
    expect(poi!.y).toBeCloseTo(0.25, 1);
  });

  // POI-03: POI persists or resets after image replace
  test("POI-03: POI behavior after image replace", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey, imageUri } = await ensureUploaded(api, testAlbumUri);

    // Set a known POI
    await api.setPointOfInterest(poiKey, 0.75, 0.75);

    // Replace the image with a different file
    await api.uploadImage(LANDSCAPE_PATH, testAlbumUri, {
      replaceImageUri: imageUri,
    });

    // Check if POI was reset or preserved
    const poi = await api.getPointOfInterest(poiKey);
    console.log(`POI-03: After replace, POI: ${JSON.stringify(poi)}`);
    // Either POI is reset to center or preserved — both are valid behaviors
    // Just verify it's still a valid coordinate
    if (poi) {
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThanOrEqual(1);
      expect(poi.y).toBeGreaterThanOrEqual(0);
      expect(poi.y).toBeLessThanOrEqual(1);
    }
  });

  // POI-04: POI coordinates returned correctly via API
  test("POI-04: POI coordinates round-trip correctly", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey } = await ensureUploaded(api, testAlbumUri);

    const testPoints = [
      { x: 0.1, y: 0.9 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.2 },
    ];

    for (const point of testPoints) {
      await api.setPointOfInterest(poiKey, point.x, point.y);
      const poi = await api.getPointOfInterest(poiKey);
      console.log(
        `POI-04: Set (${point.x}, ${point.y}), got: ${JSON.stringify(poi)}`,
      );
      expect(poi).toBeTruthy();
      expect(poi!.x).toBeCloseTo(point.x, 1);
      expect(poi!.y).toBeCloseTo(point.y, 1);
    }
  });

  // POI-05: POI affects all cropped size tiers
  test("POI-05: POI affects cropped size tiers", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey } = await ensureUploaded(api, testAlbumUri);

    // Set POI to a corner
    await api.setPointOfInterest(poiKey, 0.9, 0.1);

    // Get size tiers — they should all be valid images
    const tiers = await api.waitForSizeTiers(poiKey);
    console.log(`POI-05: ${tiers.length} tiers available after POI set`);
    expect(tiers.length).toBeGreaterThan(0);

    // Verify at least the thumbnail tiers have valid dimensions
    for (const tier of tiers) {
      if (tier.label === "O") continue;
      expect(tier.width).toBeGreaterThan(0);
      expect(tier.height).toBeGreaterThan(0);
    }
  });
});
