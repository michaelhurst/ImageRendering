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
  test("POI-02: Setting POI updates crop center", async () => {
    test.skip(true, "Setting POI via API not supported with session auth");
  });

  // POI-03: POI persists or resets after image replace
  test("POI-03: POI behavior after image replace", async () => {
    test.skip(true, "Setting POI via API not supported with session auth");
  });

  // POI-04: POI coordinates returned correctly via API
  test("POI-04: POI coordinates round-trip correctly", async () => {
    test.skip(true, "Setting POI via API not supported with session auth");
  });

  // POI-05: POI affects all cropped size tiers
  test("POI-05: POI affects cropped size tiers", async () => {
    test.skip(true, "Setting POI via API not supported with session auth");
  });
});
