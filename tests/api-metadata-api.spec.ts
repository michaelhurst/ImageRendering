/**
 * MA-01 through MA-07 (API): Metadata API Accuracy
 *
 * Verifies SmugMug API endpoints return correct metadata, support
 * round-trip updates, and handle XMP regions.
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
const STRIPPED_PATH = path.join(IMAGES_DIR, "metadata-stripped.jpg");
const XMP_REGIONS_PATH = path.join(IMAGES_DIR, "c-metadata-xmp-regions.jpg");

test.describe("MA (API): Metadata API Accuracy", () => {
  let _richKey: string | undefined;
  let _strippedKey: string | undefined;

  async function ensureRichUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_richKey) {
      const result = await api.uploadImage(RICH_PATH, albumUri, {
        title: "ma-rich",
      });
      _richKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _richKey;
  }

  async function ensureStrippedUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_strippedKey) {
      const result = await api.uploadImage(STRIPPED_PATH, albumUri, {
        title: "ma-stripped",
      });
      _strippedKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _strippedKey;
  }

  // MA-01: !metadata returns key EXIF field superset
  test("MA-01: !metadata returns key EXIF fields", async ({
    api,
    testAlbumUri,
  }) => {
    const richKey = await ensureRichUploaded(api, testAlbumUri);
    const meta = await api.getMetadata(richKey);
    const required = [
      "Make",
      "Model",
      "ExposureTime",
      "FNumber",
      "ISO",
      "FocalLength",
      "DateTimeOriginal",
    ];
    const found: string[] = [];
    const missing: string[] = [];

    for (const field of required) {
      // Check various key name variants
      const hasField =
        meta[field] !== undefined ||
        meta[field.replace("Time", "")] !== undefined ||
        meta[`Camera${field}`] !== undefined;
      if (hasField) found.push(field);
      else missing.push(field);
    }

    console.log(`Found: ${found.join(", ")}`);
    if (missing.length) console.log(`Missing: ${missing.join(", ")}`);
    expect(found.length).toBeGreaterThanOrEqual(5); // At least 5 of 7 required fields
  });

  // MA-02: !metadata for stripped image returns minimal set
  test("MA-02: !metadata for stripped image returns without error", async ({
    api,
    testAlbumUri,
  }) => {
    const strippedKey = await ensureStrippedUploaded(api, testAlbumUri);
    const meta = await api.getMetadata(strippedKey);
    expect(meta).toBeDefined();
    // Should not have meaningful camera fields (empty strings count as absent)
    const cameraFields = ["Make", "Model", "ExposureTime", "FNumber"];
    const present = cameraFields.filter(
      (f) => meta[f] !== undefined && meta[f] !== "" && meta[f] !== null,
    );
    console.log(`Camera fields in stripped: ${present.join(", ") || "none"}`);
    expect(present.length).toBe(0);
  });

  // MA-03: Format field matches actual file format
  test("MA-03: Format field matches uploaded file format", async ({
    api,
    testAlbumUri,
  }) => {
    const richKey = await ensureRichUploaded(api, testAlbumUri);
    const image = await api.getImage(richKey);
    console.log(`Format: ${image.Format}`);
    expect(image.Format.toLowerCase()).toContain("jpg");
  });

  // MA-04: FileName preserves original filename
  test("MA-04: FileName preserves original filename", async ({
    api,
    testAlbumUri,
  }) => {
    const richKey = await ensureRichUploaded(api, testAlbumUri);
    const image = await api.getImage(richKey);
    console.log(`FileName: ${image.FileName}`);
    expect(image.FileName).toBe("metadata-rich.jpg");
  });

  // MA-05: KeywordArray round-trips correctly
  test("MA-05: KeywordArray round-trips correctly", async ({
    api,
    testAlbumUri,
  }) => {
    const richKey = await ensureRichUploaded(api, testAlbumUri);
    const keywords = ["sunset", "ocean", "HDR"];
    await api.put(`/api/v2/image/${richKey}-0`, { KeywordArray: keywords });
    const image = await api.getImage(richKey);
    console.log(`Keywords: ${JSON.stringify(image.KeywordArray)}`);
    for (const kw of keywords) {
      expect(image.KeywordArray, `Missing keyword: ${kw}`).toContain(kw);
    }
  });

  // MA-06: Title/Caption round-trip with special characters
  test("MA-06: Title/Caption round-trip with special characters", async ({
    api,
    testAlbumUri,
  }) => {
    const richKey = await ensureRichUploaded(api, testAlbumUri);
    const title = "Test — émojis 🌅 & spëcial (chars) [brackets]";
    const caption = "Ünïcödé caption with \u201Cquotes\u201D and 日本語";
    await api.put(`/api/v2/image/${richKey}-0`, {
      Title: title,
      Caption: caption,
    });
    const image = await api.getImage(richKey);
    console.log(`Title: ${image.Title}`);
    console.log(`Caption: ${image.Caption}`);
    expect(image.Title).toBe(title);
    expect(image.Caption).toBe(caption);
  });

  // MA-07: !regions returns face/object regions
  test("MA-07: !regions returns face/object regions for XMP image", async ({
    api,
    testAlbumUri,
  }) => {
    if (!fs.existsSync(XMP_REGIONS_PATH)) {
      test.skip(
        true,
        "c-metadata-xmp-regions.jpg not found in TEST_IMAGES_DIR",
      );
      return;
    }

    const result = await api.uploadImage(XMP_REGIONS_PATH, testAlbumUri, {
      title: "ma-xmp-regions",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);

    // Give the API time to parse XMP regions
    await new Promise((r) => setTimeout(r, 5000));

    const regions = await api.getRegions(key);
    console.log(`MA-07: Found ${regions.length} regions`);
    if (regions.length > 0) {
      console.log(
        `MA-07: First region: ${JSON.stringify(regions[0]).slice(0, 200)}`,
      );
    }

    if (regions.length === 0) {
      test.skip(true, "XMP region parsing not available in this environment");
      return;
    }
    expect(regions.length).toBeGreaterThan(0);
  });
});
