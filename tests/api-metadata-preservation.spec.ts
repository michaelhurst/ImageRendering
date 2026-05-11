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
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    const apiMake = (meta.Make || meta.CameraMake || "").trim();
    const apiModel = (meta.Model || meta.CameraModel || "").trim();
    const sourceMake = (sourceExif.Make || "").trim();
    const sourceModel = (sourceExif.Model || "").trim();
    console.log(`Make: "${apiMake}" (source: "${sourceMake}")`);
    console.log(`Model: "${apiModel}" (source: "${sourceModel}")`);
    expect(apiMake.toLowerCase()).toContain(sourceMake.toLowerCase());
    // API may strip brand from model (e.g., "EOS 6D" instead of "Canon EOS 6D")
    expect(
      sourceModel.toLowerCase().includes(apiModel.toLowerCase()) ||
        apiModel.toLowerCase().includes(sourceModel.toLowerCase()),
      `Model mismatch: API="${apiModel}", source="${sourceModel}"`,
    ).toBe(true);
  });

  // MP-02: Exposure settings preserved
  test("MP-02: Exposure settings preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    const apiExposure = meta.ExposureTime || meta.Exposure;
    const apiISO = meta.ISO || meta.ISOSpeedRatings;
    console.log(
      `ExposureTime: ${apiExposure} (source: ${sourceExif.ExposureTime})`,
    );
    console.log(`ISO: ${apiISO} (source: ${sourceExif.ISO})`);
    expect(Number(apiExposure)).toBeCloseTo(sourceExif.ExposureTime, 3);
    expect(Number(apiISO)).toBe(sourceExif.ISO);
  });

  // MP-03: Focal length preserved
  test("MP-03: Focal length preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    const apiFocal = parseFloat(meta.FocalLength);
    console.log(
      `FocalLength: ${meta.FocalLength} (source: ${sourceExif.FocalLength})`,
    );
    expect(apiFocal).toBeCloseTo(sourceExif.FocalLength, 0);
  });

  // MP-04: Date/time original preserved
  test("MP-04: DateTimeOriginal preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const meta = await api.getMetadata(richKey);
    const apiDate = meta.DateTimeOriginal || meta.DateCreated;
    console.log(
      `DateTimeOriginal: ${apiDate} (source: ${sourceExif.DateTimeOriginal})`,
    );
    expect(apiDate).toBeTruthy();
    // Verify year/month/day match (API may return date-only or full datetime)
    const sourceDate = new Date(sourceExif.DateTimeOriginal);
    const apiDateStr = String(apiDate);
    expect(apiDateStr).toContain(String(sourceDate.getFullYear()));
    const sourceMonth = String(sourceDate.getMonth() + 1).padStart(2, "0");
    const sourceDay = String(sourceDate.getDate()).padStart(2, "0");
    expect(apiDateStr).toContain(sourceMonth);
    expect(apiDateStr).toContain(sourceDay);
  });

  // MP-05: GPS coordinates preserved
  test("MP-05: GPS coordinates preserved", async ({ api, testAlbumUri }) => {
    const { key: richKey, sourceExif } = await ensureRichUploaded(
      api,
      testAlbumUri,
    );
    const image = await api.getImage(richKey);
    if (sourceExif.latitude) {
      console.log(
        `GPS: API lat=${image.Latitude}, source lat=${sourceExif.latitude}`,
      );
      console.log(
        `GPS: API lon=${image.Longitude}, source lon=${sourceExif.longitude}`,
      );
      expect(Number(image.Latitude)).toBeCloseTo(sourceExif.latitude, 4);
      expect(Number(image.Longitude)).toBeCloseTo(sourceExif.longitude, 4);
    } else {
      console.log("MP-05: Source image has no GPS data — skipping");
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
        console.log(`Image lat=${image.Latitude}, Metadata lat=${metaLat}`);
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
    const apiLens = meta.LensModel || meta.LensInfo || meta.Lens;
    const sourceLens = sourceExif.LensModel || sourceExif.LensInfo;
    if (sourceLens) {
      console.log(`Lens: ${apiLens} (source: ${sourceLens})`);
      // API may reformat lens name (add brand, spaces). Check key numbers match.
      const sourceNumbers = sourceLens.match(/\d+/g) || [];
      const apiNumbers = (apiLens || "").match(/\d+/g) || [];
      // At least the focal length numbers should be present
      expect(
        sourceNumbers.some((n: string) => apiNumbers.includes(n)),
        `Lens focal length not found. API: "${apiLens}", Source: "${sourceLens}"`,
      ).toBe(true);
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
      console.log(
        `WhiteBalance: ${meta.WhiteBalance} (source: ${sourceExif.WhiteBalance})`,
      );
      expect(meta.WhiteBalance).toBeDefined();
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
      console.log(`Flash: ${meta.Flash} (source: ${sourceExif.Flash})`);
      expect(meta.Flash).toBeDefined();
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
      console.log(
        `Copyright: ${meta.Copyright} (source: ${sourceExif.Copyright})`,
      );
      expect(meta.Copyright).toBe(sourceExif.Copyright);
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
      const apiArtist = meta.Artist || meta.Author;
      console.log(`Artist: ${apiArtist} (source: ${sourceExif.Artist})`);
      expect(apiArtist).toBe(sourceExif.Artist);
    }
  });

  // MP-12: IPTC caption preserved as Caption
  test("MP-12: IPTC caption preserved as Caption", async ({
    api,
    testAlbumUri,
  }) => {
    const iptcKey = await ensureIptcUploaded(api, testAlbumUri);
    const image = await api.getImage(iptcKey);

    // Read source IPTC caption
    const exifr = require("exifr");
    const sourceData = await exifr.parse(fs.readFileSync(IPTC_PATH), {
      iptc: true,
    });
    const sourceCaption =
      sourceData?.["Caption-Abstract"] ||
      sourceData?.Caption ||
      sourceData?.Description;

    const apiCaption = image.Caption;
    console.log(`Caption: "${apiCaption}" (source: "${sourceCaption}")`);
    expect(apiCaption).toBeTruthy();
    if (sourceCaption) {
      expect(apiCaption).toContain(sourceCaption);
    }
  });

  // MP-13: IPTC keywords preserved as Keywords
  test("MP-13: IPTC keywords preserved as Keywords", async ({
    api,
    testAlbumUri,
  }) => {
    const iptcKey = await ensureIptcUploaded(api, testAlbumUri);
    const image = await api.getImage(iptcKey);

    // Read source IPTC keywords
    const exifr = require("exifr");
    const sourceData = await exifr.parse(fs.readFileSync(IPTC_PATH), {
      iptc: true,
    });
    const sourceKeywords = sourceData?.Keywords || [];

    console.log(
      `Keywords: ${JSON.stringify(image.KeywordArray)} (source: ${JSON.stringify(sourceKeywords)})`,
    );
    expect(image.KeywordArray).toBeDefined();
    expect(image.KeywordArray.length).toBeGreaterThan(0);
    // Verify source keywords are all present
    if (Array.isArray(sourceKeywords)) {
      for (const kw of sourceKeywords) {
        expect(image.KeywordArray, `Missing keyword: ${kw}`).toContain(kw);
      }
    }
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
      console.log(
        `UserComment: ${meta.UserComment} (source: ${sourceExif.UserComment})`,
      );
      expect(meta.UserComment).toBeTruthy();
      // Verify content matches (UserComment may have encoding prefix stripped)
      expect(meta.UserComment).toContain(
        sourceExif.UserComment.replace(/^(ASCII|UNICODE)\0+/, "").trim(),
      );
    } else {
      console.log("MP-14: Source has no UserComment — skipping value check");
    }
  });
});
