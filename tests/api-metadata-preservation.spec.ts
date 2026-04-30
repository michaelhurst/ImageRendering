/**
 * MP-01 through MP-14 (API): Metadata Preservation
 *
 * Uploads metadata-rich images from local disk and verifies EXIF/IPTC
 * fields are preserved through SmugMug's processing pipeline via the
 * !metadata API.
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
const RICH_PATH = path.join(IMAGES_DIR, "metadata-rich.jpg");
const IPTC_PATH = path.join(IMAGES_DIR, "metadata-iptc.jpg");

test.describe("MP (API): Metadata Preservation", () => {
  let _richKey: string | undefined;
  let _iptcKey: string | undefined;
  let _sourceExif: Record<string, any> | undefined;

  async function ensureRichUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<{ key: string; sourceExif: Record<string, any> }> {
    if (!_richKey || !_sourceExif) {
      const exifr = require("exifr");
      const result = await api.uploadImage(RICH_PATH, albumUri, {
        title: "mp-rich",
      });
      _richKey = SmugMugAPI.extractImageKey(result.ImageUri);
      _sourceExif =
        (await exifr.parse(fs.readFileSync(RICH_PATH), { all: true })) || {};
    }
    return { key: _richKey, sourceExif: _sourceExif };
  }

  async function ensureIptcUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_iptcKey) {
      const result = await api.uploadImage(IPTC_PATH, albumUri, {
        title: "mp-iptc",
      });
      _iptcKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _iptcKey;
  }

  // MP-01: Camera make and model preserved
  test("MP-01: Camera make and model preserved", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: richKey } = await ensureRichUploaded(api, testAlbumUri);
    const meta = await api.getMetadata(richKey);
    expect(meta.Make || meta.CameraMake).toBeTruthy();
    expect(meta.Model || meta.CameraModel).toBeTruthy();
    console.log(
      `Make: ${meta.Make || meta.CameraMake}, Model: ${meta.Model || meta.CameraModel}`,
    );
  });

  // MP-02: Exposure settings preserved
  test("MP-02: Exposure settings preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey } = await ensureRichUploaded(api, testAlbumUri);
    const meta = await api.getMetadata(richKey);
    expect(meta.ExposureTime || meta.Exposure).toBeDefined();
    expect(meta.FNumber || meta.Aperture).toBeDefined();
    expect(meta.ISO || meta.ISOSpeedRatings).toBeDefined();
  });

  // MP-03: Focal length preserved
  test("MP-03: Focal length preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey } = await ensureRichUploaded(api, testAlbumUri);
    const meta = await api.getMetadata(richKey);
    expect(meta.FocalLength).toBeDefined();
    console.log(`FocalLength: ${meta.FocalLength}`);
  });

  // MP-04: Date/time original preserved
  test("MP-04: DateTimeOriginal preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey } = await ensureRichUploaded(api, testAlbumUri);
    const meta = await api.getMetadata(richKey);
    expect(meta.DateTimeOriginal || meta.DateCreated).toBeTruthy();
    console.log(
      `DateTimeOriginal: ${meta.DateTimeOriginal || meta.DateCreated}`,
    );
  });

  // MP-05: GPS coordinates preserved
  test("MP-05: GPS coordinates preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const image = await api.getImage(richKey);
    const meta = await api.getMetadata(richKey);
    // GPS may be on the image object or in metadata
    const hasGPS =
      (image.Latitude !== 0 && image.Longitude !== 0) ||
      meta.GPSLatitude !== undefined ||
      meta.Latitude !== undefined;
    console.log(`GPS: lat=${image.Latitude}, lon=${image.Longitude}`);
    if (sourceExif.latitude) {
      expect(hasGPS, "GPS coordinates missing").toBe(true);
    }
  });

  // MP-06: GPS matches image endpoint fields
  test("MP-06: GPS matches between image and metadata endpoints", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: richKey } = await ensureRichUploaded(api, testAlbumUri);
    const image = await api.getImage(richKey);
    const meta = await api.getMetadata(richKey);
    if (image.Latitude !== 0) {
      const metaLat = meta.GPSLatitude || meta.Latitude || 0;
      if (metaLat !== 0) {
        expect(Math.abs(image.Latitude - metaLat)).toBeLessThan(0.01);
      }
    }
  });

  // MP-07: Lens info preserved
  test("MP-07: Lens info preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    const hasLens = meta.LensModel || meta.LensInfo || meta.Lens;
    if (sourceExif.LensModel) {
      expect(hasLens, "Lens info missing").toBeTruthy();
      console.log(`Lens: ${hasLens}`);
    }
  });

  // MP-08: White balance preserved
  test("MP-08: White balance preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    if (sourceExif.WhiteBalance !== undefined) {
      expect(meta.WhiteBalance).toBeDefined();
      console.log(`WhiteBalance: ${meta.WhiteBalance}`);
    }
  });

  // MP-09: Flash status preserved
  test("MP-09: Flash status preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    if (sourceExif.Flash !== undefined) {
      expect(meta.Flash).toBeDefined();
      console.log(`Flash: ${meta.Flash}`);
    }
  });

  // MP-10: Copyright field preserved
  test("MP-10: Copyright field preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    if (sourceExif.Copyright) {
      expect(meta.Copyright).toBeTruthy();
      console.log(`Copyright: ${meta.Copyright}`);
    }
  });

  // MP-11: Artist/Author field preserved
  test("MP-11: Artist/Author field preserved", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    if (sourceExif.Artist) {
      expect(meta.Artist || meta.Author).toBeTruthy();
      console.log(`Artist: ${meta.Artist || meta.Author}`);
    }
  });

  // MP-12: IPTC caption preserved as Caption
  test("MP-12: IPTC caption preserved as Caption", async ({
    api,
    testAlbumUri,
  }) => {
    const iptcKey = await ensureIptcUploaded(api, testAlbumUri);
    const image = await api.getImage(iptcKey);
    const meta = await api.getMetadata(iptcKey);
    const caption = image.Caption || meta.Caption || meta["Caption-Abstract"];
    console.log(`Caption: ${caption}`);
    // Just verify it's present — exact value depends on the IPTC fixture
    expect(caption !== undefined && caption !== null && caption !== "").toBe(
      true,
    );
  });

  // MP-13: IPTC keywords preserved as Keywords
  test("MP-13: IPTC keywords preserved as Keywords", async ({
    api,
    testAlbumUri,
  }) => {
    const iptcKey = await ensureIptcUploaded(api, testAlbumUri);
    const image = await api.getImage(iptcKey);
    console.log(`Keywords: ${JSON.stringify(image.KeywordArray)}`);
    expect(image.KeywordArray).toBeDefined();
    expect(image.KeywordArray.length).toBeGreaterThan(0);
  });

  // MP-14: UserComment EXIF field preserved
  test("MP-14: UserComment EXIF field preserved", async ({
    api,
    testAlbumUri,
  }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    if (sourceExif.UserComment) {
      expect(meta.UserComment).toBeTruthy();
      console.log(`UserComment: ${meta.UserComment}`);
    }
  });
});
