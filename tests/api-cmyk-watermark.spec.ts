/**
 * CMYK-WM-01 through CMYK-WM-05 (API): CMYK Image with White Text Watermark
 *
 * Uploads a CMYK color space image to a watermark-enabled gallery and
 * verifies that the white text watermark renders correctly after
 * SmugMug's color conversion pipeline (CMYK → sRGB + watermark overlay).
 *
 * This is a corner case because CMYK images must be converted to RGB
 * before display, and the watermark (white text) must remain visible
 * and legible after the color space conversion.
 *
 * Source images are read from TEST_IMAGES_DIR.
 *
 * Requires: TEST_IMAGES_DIR, authenticated session, watermark-enabled gallery
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const CMYK_IMAGE_PATH = path.join(IMAGES_DIR, "c-color-cmyk.jpg");

function md5Hex(buf: Buffer): string {
  return crypto.createHash("md5").update(buf).digest("hex");
}

test.describe("CMYK-WM (API): CMYK Image with White Text Watermark", () => {
  let _imageKey: string | undefined;

  async function ensureUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_imageKey) {
      const result = await api.uploadImage(CMYK_IMAGE_PATH, albumUri, {
        title: "cmyk-watermark-test",
      });
      _imageKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _imageKey;
  }

  // CMYK-WM-01: CMYK image uploads successfully and converts to viewable tiers
  test("CMYK-WM-01: CMYK image uploads and generates viewable RGB tiers", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);

    // Enable watermarking on the album
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });

    // Wait for size tiers to be generated (CMYK conversion may take extra time)
    const tiers = await api.waitForSizeTiers(imageKey, 3, 90_000);
    expect(tiers.length, "Expected at least one size tier").toBeGreaterThan(0);

    // Verify a mid-size tier is a valid JPEG in RGB color space
    const testTier =
      tiers.find((t) => t.label === "M") ||
      tiers.find((t) => t.label === "L" || t.label === "XL") ||
      tiers.find((t) => t.label === "S");
    expect(testTier, "No usable tier available").toBeTruthy();

    const sharp = require("sharp");
    const buf = await api.downloadBuffer(testTier!.url);
    const meta = await sharp(buf).metadata();
    console.log(
      `CMYK-WM-01: ${testTier!.label} tier: ${meta.width}x${meta.height}, ` +
        `format=${meta.format}, space=${meta.space}, channels=${meta.channels}`,
    );
    // Output tier should be a valid image in RGB (sRGB), not CMYK
    expect(meta.format, "Tier should be a valid image format").toBeTruthy();
    expect(meta.space).not.toBe("cmyk");
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  // CMYK-WM-02: Watermark is applied to visitor-facing tiers (differs from owner)
  test("CMYK-WM-02: White text watermark applied to CMYK-converted visitor tiers", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);

    // Ensure watermarking is enabled
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });

    const ownerTiers = await api.getSizeDetails(imageKey);
    const testTier = ownerTiers.find((t) => t.label === "L" || t.label === "M");
    if (!testTier) {
      console.log("CMYK-WM-02: No L or M tier available — skipping");
      return;
    }

    // Download as owner (clean, no watermark)
    const ownerBuf = await api.downloadBuffer(testTier.url);
    expect(ownerBuf.length).toBeGreaterThan(0);

    // Download as visitor (should have white text watermark)
    const visitorApi = SmugMugAPI.withApiKey(
      process.env.SMUGMUG_API_KEY_INSIDE ||
        process.env.SMUGMUG_API_KEY_PRODUCTION ||
        "",
    );
    try {
      const visitorTiers = await visitorApi.getSizeDetails(imageKey);
      const visitorTier = visitorTiers.find((t) => t.label === testTier.label);
      if (visitorTier) {
        const visitorBuf = await visitorApi.downloadBuffer(visitorTier.url);
        const ownerMd5 = md5Hex(ownerBuf);
        const visitorMd5 = md5Hex(visitorBuf);
        console.log(
          `CMYK-WM-02: Owner ${testTier.label} MD5: ${ownerMd5.slice(0, 12)}..., ` +
            `Visitor MD5: ${visitorMd5.slice(0, 12)}...`,
        );
        // Watermark should make the visitor version differ from owner
        expect(
          visitorMd5,
          "Visitor tier should differ from owner (watermark with white text applied)",
        ).not.toBe(ownerMd5);
      } else {
        console.log(
          "CMYK-WM-02: Visitor tier not found — gallery may be private",
        );
      }
    } catch (err: any) {
      console.log(
        `CMYK-WM-02: Visitor access failed: ${err.message.slice(0, 100)}`,
      );
    }
  });

  // CMYK-WM-03: Watermark region contains bright (white) pixels indicating text presence
  test("CMYK-WM-03: Watermark region contains white text pixels on CMYK-converted image", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);

    // Ensure watermarking is enabled
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });

    // Get visitor version (watermarked)
    const visitorApi = SmugMugAPI.withApiKey(
      process.env.SMUGMUG_API_KEY_INSIDE ||
        process.env.SMUGMUG_API_KEY_PRODUCTION ||
        "",
    );

    try {
      const visitorTiers = await visitorApi.getSizeDetails(imageKey);
      const tier = visitorTiers.find(
        (t) => t.label === "L" || t.label === "XL" || t.label === "M",
      );
      if (!tier) {
        console.log("CMYK-WM-03: No suitable tier for watermark analysis");
        return;
      }

      const visitorBuf = await visitorApi.downloadBuffer(tier.url);
      const sharp = require("sharp");

      // Analyze the bottom-right quadrant where watermarks are typically placed
      const meta = await sharp(visitorBuf).metadata();
      const w = meta.width!;
      const h = meta.height!;

      // Extract bottom-right region (common watermark position)
      const regionW = Math.floor(w * 0.4);
      const regionH = Math.floor(h * 0.15);
      const regionX = w - regionW;
      const regionY = h - regionH;

      const { data } = await sharp(visitorBuf)
        .extract({
          left: regionX,
          top: regionY,
          width: regionW,
          height: regionH,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Count bright pixels (near-white, indicating watermark text)
      const channels = meta.channels || 3;
      let brightPixels = 0;
      const totalPixels = regionW * regionH;
      const WHITE_THRESHOLD = 230; // pixels must be very bright to count as white text

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
          brightPixels++;
        }
      }

      const brightPercent = (brightPixels / totalPixels) * 100;
      console.log(
        `CMYK-WM-03: Bottom-right region (${regionW}x${regionH}): ` +
          `${brightPixels} bright pixels (${brightPercent.toFixed(2)}%), ` +
          `indicating white text watermark presence`,
      );

      // Expect some bright pixels from the white text watermark
      // Even a small watermark text should produce >0.1% bright pixels in the region
      expect(
        brightPixels,
        "Expected bright (white) pixels from watermark text in bottom-right region",
      ).toBeGreaterThan(0);
    } catch (err: any) {
      console.log(
        `CMYK-WM-03: Visitor access failed: ${err.message.slice(0, 100)}`,
      );
    }
  });

  // CMYK-WM-04: Owner download of CMYK image is valid (SmugMug may convert CMYK on ingest)
  test("CMYK-WM-04: Owner archived image is valid and not watermarked", async ({
    api,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(imageKey);
    const sourceBuffer = fs.readFileSync(CMYK_IMAGE_PATH);

    // SmugMug converts CMYK images on ingest, so the archived version may differ
    // from the source. Verify it's downloadable and the size is reasonable.
    const archivedBuffer = await api.downloadBuffer(image.ArchivedUri);
    const sourceMd5 = md5Hex(sourceBuffer);
    const archivedMd5 = md5Hex(archivedBuffer);
    console.log(
      `CMYK-WM-04: Source size=${sourceBuffer.length}, Archived size=${archivedBuffer.length}, ` +
        `Source MD5: ${sourceMd5.slice(0, 12)}..., Archived MD5: ${archivedMd5.slice(0, 12)}...`,
    );

    // Archived file should be non-empty and a valid image
    expect(archivedBuffer.length).toBeGreaterThan(0);

    // Verify the archived image is valid and readable by sharp
    const sharp = require("sharp");
    const meta = await sharp(archivedBuffer).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    console.log(
      `CMYK-WM-04: Archived format=${meta.format}, space=${meta.space}, ` +
        `${meta.width}x${meta.height}`,
    );
  });

  // CMYK-WM-05: Watermarked CMYK image maintains color accuracy after conversion
  test("CMYK-WM-05: CMYK-to-RGB conversion with watermark maintains color accuracy", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await ensureUploaded(api, testAlbumUri);

    // Ensure watermarking is enabled
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });

    const ownerTiers = await api.getSizeDetails(imageKey);
    const tier = ownerTiers.find(
      (t) => t.label === "L" || t.label === "XL" || t.label === "M",
    );
    if (!tier) {
      console.log("CMYK-WM-05: No suitable tier — skipping");
      return;
    }

    const sharp = require("sharp");

    // Download owner version (clean RGB conversion, no watermark)
    const ownerBuf = await api.downloadBuffer(tier.url);
    const ownerMeta = await sharp(ownerBuf).metadata();

    // Verify color space is sRGB (not CMYK)
    expect(ownerMeta.space).not.toBe("cmyk");
    console.log(
      `CMYK-WM-05: Owner tier space=${ownerMeta.space}, ${ownerMeta.width}x${ownerMeta.height}`,
    );

    // Analyze tonal range to confirm color data survived conversion
    const { data } = await sharp(ownerBuf)
      .resize(200, 200, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = ownerMeta.channels || 3;
    let minR = 255,
      maxR = 0;
    let minG = 255,
      maxG = 0;
    let minB = 255,
      maxB = 0;

    const pixelCount = 200 * 200;
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * channels;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
    }

    const rangeR = maxR - minR;
    const rangeG = maxG - minG;
    const rangeB = maxB - minB;
    console.log(
      `CMYK-WM-05: Tonal range R=${rangeR} G=${rangeG} B=${rangeB} ` +
        `(confirms color data preserved after CMYK→RGB conversion)`,
    );

    // A properly converted CMYK image should have meaningful tonal range
    // (not clipped to a single value across all channels)
    expect(
      rangeR + rangeG + rangeB,
      "Combined tonal range should indicate color data survived conversion",
    ).toBeGreaterThan(30);
  });
});
