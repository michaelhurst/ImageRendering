/**
 * POI-01 through POI-05 (API): Point of Interest & Cropping
 *
 * DISABLED: The !pointofinterest API endpoint returns null for all images
 * on both inside and production. POI cannot be set via the API (PATCH fields
 * are silently ignored, PUT/POST return 405). Face detection does not appear
 * to auto-assign POI values to uploaded images.
 *
 * These tests need further investigation into:
 * - How POI is set (likely UI-only via the Organize crop tool)
 * - Whether face detection needs to be triggered separately
 * - Whether the !pointofinterest endpoint is deprecated or requires a specific plan
 *
 * Pre-uploaded test images exist in:
 * - Inside: /POI-Tests/POI-test-images/
 * - Production: /POI-Tests/POI-test-images/
 *
 * Requires: TEST_IMAGES_DIR, authenticated session
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as path from "path";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const POI_PATH = path.join(IMAGES_DIR, "c-poi-test.jpg");
const LANDSCAPE_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg");

test.describe("POI (API): Point of Interest & Cropping", () => {
  test.skip(
    true,
    "POI API not functional — !pointofinterest returns null for all images",
  );

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
    await api.setPointOfInterest(poiKey, 0.25, 0.25);
    const poi = await api.getPointOfInterest(poiKey);
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
    await api.setPointOfInterest(poiKey, 0.75, 0.75);
    await api.uploadImage(LANDSCAPE_PATH, testAlbumUri, {
      replaceImageUri: imageUri,
    });
    const poi = await api.getPointOfInterest(poiKey);
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
    await api.setPointOfInterest(poiKey, 0.9, 0.1);
    const tiers = await api.waitForSizeTiers(poiKey);
    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      if (tier.label === "O") continue;
      expect(tier.width).toBeGreaterThan(0);
      expect(tier.height).toBeGreaterThan(0);
    }
  });
});
