/**
 * TO-01 through TO-05 (API): Text Over Image (HEIC Corner Case)
 *
 * Uploads a HEIC image with text overlaid on a photo and verifies
 * SmugMug's pipeline converts it to a viewable JPEG while preserving
 * text sharpness and correct dimensions.
 *
 * Requires: TEST_ALBUM_KEY, TEST_IMAGES_DIR, authenticated session
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const TEXT_OVERLAY_PATH = path.join(IMAGES_DIR, "text-over-image.heic");

test.describe("TO (API): Text Over Image — HEIC Corner Case", () => {
  let _imageKey: string | undefined;

  async function ensureUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_imageKey) {
      const result = await api.uploadImage(TEXT_OVERLAY_PATH, albumUri, {
        title: "to-text-overlay",
      });
      _imageKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _imageKey;
  }

  // TO-01: HEIC with text overlay uploads and converts to viewable JPEG
  test("TO-01: HEIC with text overlay converts to viewable JPEG tiers", async ({
    api,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(imageKey);
    expect(tiers.length).toBeGreaterThan(0);

    const largeTier = tiers.find((t) => t.label === "L" || t.label === "XL");
    expect(largeTier, "No L or XL tier generated").toBeTruthy();

    const buf = await api.downloadBuffer(largeTier!.url);
    // Should be a valid JPEG
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);

    const sharp = require("sharp");
    const meta = await sharp(buf).metadata();
    console.log(
      `TO-01: ${largeTier!.label} tier: ${meta.width}x${meta.height} ${meta.format}`,
    );
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  // TO-02: Converted image preserves portrait orientation
  test("TO-02: Converted image preserves portrait orientation", async ({
    api,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(imageKey);
    console.log(
      `TO-02: API dimensions: ${image.OriginalWidth}x${image.OriginalHeight}`,
    );
    // Source is 3024x4032 (portrait) — should stay portrait after conversion
    expect(image.OriginalHeight).toBeGreaterThan(image.OriginalWidth);
  });

  // TO-03: All size tiers maintain portrait aspect ratio
  test("TO-03: All size tiers maintain portrait aspect ratio", async ({
    api,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(imageKey);
    for (const tier of tiers) {
      if (tier.label === "O") continue;
      console.log(`${tier.label}: ${tier.width}x${tier.height}`);
      expect(
        tier.height,
        `${tier.label} should be portrait`,
      ).toBeGreaterThanOrEqual(tier.width);
    }
  });

  // TO-04: Text sharpness preserved in L tier (Laplacian variance)
  test("TO-04: Text sharpness preserved in converted L tier", async ({
    api,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(imageKey);
    const largeTier = tiers.find((t) => t.label === "L" || t.label === "XL");
    if (!largeTier) return;

    const sharp = require("sharp");
    const buf = await api.downloadBuffer(largeTier.url);
    const { data, info } = await sharp(buf)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;

    // Laplacian variance — text edges produce high variance
    let sum = 0,
      sumSq = 0,
      count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const lap =
          -data[idx - width] -
          data[idx - 1] +
          4 * data[idx] -
          data[idx + 1] -
          data[idx + width];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    console.log(`TO-04: Laplacian variance: ${variance.toFixed(1)}`);
    // Text overlay images should have high edge contrast
    expect(variance).toBeGreaterThan(50);
  });

  // TO-05: Archived original preserves source file
  test("TO-05: Archived original matches source file", async ({
    api,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(imageKey);
    const sourceSize = fs.statSync(TEXT_OVERLAY_PATH).size;
    expect(image.ArchivedSize).toBe(sourceSize);

    const archivedBuf = await api.downloadBuffer(image.ArchivedUri);
    expect(archivedBuf.length).toBe(sourceSize);
  });
});
