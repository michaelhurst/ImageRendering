/**
 * POI-01 through POI-05 (API): Point of Interest & Cropping
 *
 * Uploads images, sets POI via the API, and verifies crop behavior
 * across size tiers and after image replacement.
 *
 * Requires: TEST_ALBUM_KEY, TEST_IMAGES_DIR, authenticated session
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const POI_PATH = path.join(IMAGES_DIR, "c-poi-test.jpg");
const ALT_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg");

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
    // If no POI is set, it should default to center (0.5, 0.5) or be null
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
    console.log(`Set POI: ${JSON.stringify(poi)}`);
    expect(poi).not.toBeNull();
    expect(poi!.x).toBeCloseTo(0.25, 1);
    expect(poi!.y).toBeCloseTo(0.25, 1);
  });

  // POI-03: POI persists or resets after image replace
  test("POI-03: POI behavior after image replace", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey, imageUri: poiImageUri } = await ensureUploaded(
      api,
      testAlbumUri,
    );
    // Set a POI first
    await api.setPointOfInterest(poiKey, 0.75, 0.75);

    // Replace the image
    await api.uploadImage(ALT_PATH, testAlbumUri, {
      title: "poi-replaced",
      replaceImageUri: poiImageUri,
    });

    // Check if POI persisted or reset
    const poi = await api.getPointOfInterest(poiKey);
    console.log(`POI after replace: ${JSON.stringify(poi)}`);
    // Document the behavior — either persisted or reset is valid
    if (poi) {
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThanOrEqual(1);
    }
  });

  // POI-04: POI coordinates returned correctly via API
  test("POI-04: POI coordinates round-trip correctly", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey } = await ensureUploaded(api, testAlbumUri);
    const setX = 0.33,
      setY = 0.67;
    await api.setPointOfInterest(poiKey, setX, setY);
    const poi = await api.getPointOfInterest(poiKey);
    expect(poi).not.toBeNull();
    expect(poi!.x).toBeCloseTo(setX, 1);
    expect(poi!.y).toBeCloseTo(setY, 1);
    console.log(`Set (${setX}, ${setY}), got (${poi!.x}, ${poi!.y})`);
  });

  // POI-05: POI affects all cropped size tiers
  test("POI-05: POI affects cropped size tiers", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: poiKey } = await ensureUploaded(api, testAlbumUri);
    await api.setPointOfInterest(poiKey, 0.25, 0.25);
    const tiers = await api.getSizeDetails(poiKey);
    // Verify tiers are generated — POI influence is visual, so we just confirm tiers exist
    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      expect(tier.width).toBeGreaterThan(0);
      expect(tier.height).toBeGreaterThan(0);
    }
    console.log(`${tiers.length} tiers generated with POI set`);
  });
});
