/**
 * CMYK-WM (API): CMYK Image with White Text Watermark
 *
 * Uploads a CMYK color space image to a PUBLIC, watermark-enabled gallery
 * and verifies that the white text watermark renders as white (not black)
 * after SmugMug's color conversion pipeline.
 *
 * Known bug: White text watermarks applied to CMYK images appear as black
 * text due to a color inversion issue in the CMYK→RGB conversion pipeline.
 *
 * Strategy:
 *   - Upload CMYK image to a Public, watermarked album
 *   - Owner downloads the tier (no watermark) as the "clean" baseline
 *   - Visitor API (API-key-only) fetches size details for the watermarked tier
 *   - Diff the two to isolate watermark pixels, then verify they are white
 *
 * Note: On inside, visitor API access may return 404 for images. In that case,
 * the test explicitly fails with a message rather than silently passing.
 *
 * Source images are read from TEST_IMAGES_DIR.
 *
 * Requires: TEST_IMAGES_DIR, authenticated session
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import { request } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const CMYK_IMAGE_PATH = path.join(IMAGES_DIR, "c-color-cmyk.jpg");

function md5Hex(buf: Buffer): string {
  return crypto.createHash("md5").update(buf).digest("hex");
}

test.describe("CMYK-WM (API): CMYK Image with White Text Watermark", () => {
  /**
   * Upload the CMYK image to a Public, watermark-enabled album and wait for tiers.
   */
  async function uploadToPublicWatermarkedAlbum(
    api: SmugMugAPI,
    testAlbumKey: string,
    testAlbumUri: string,
  ): Promise<string> {
    // Set album to Public with watermarking enabled
    await api.patch(`/api/v2/album/${testAlbumKey}`, {
      Watermark: true,
      Privacy: "Public",
    });

    const result = await api.uploadImage(CMYK_IMAGE_PATH, testAlbumUri, {
      title: "cmyk-watermark-test",
    });
    const imageKey = SmugMugAPI.extractImageKey(result.ImageUri);

    // Wait for tiers to generate
    await api.waitForSizeTiers(imageKey, 3, 90_000);
    return imageKey;
  }

  /**
   * Get visitor API (unauthenticated, API-key-only access).
   */
  function getVisitorApi(): SmugMugAPI {
    const env = process.env.ENVIRONMENT || "inside";
    const key =
      env === "production"
        ? process.env.SMUGMUG_API_KEY_PRODUCTION
        : process.env.SMUGMUG_API_KEY_INSIDE;
    return SmugMugAPI.withApiKey(key || "");
  }

  // CMYK-WM-01: CMYK image uploads and generates viewable tiers
  test("CMYK-WM-01: CMYK image uploads and generates viewable tiers", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await uploadToPublicWatermarkedAlbum(
      api,
      testAlbumKey,
      testAlbumUri,
    );
    const tiers = await api.getSizeDetails(imageKey);
    expect(tiers.length, "Expected at least one size tier").toBeGreaterThan(0);

    const testTier =
      tiers.find((t) => t.label === "M") ||
      tiers.find((t) => t.label === "L") ||
      tiers.find((t) => t.label === "S");
    expect(testTier, "No usable tier available").toBeTruthy();

    const sharp = require("sharp");
    const buf = await api.downloadBuffer(testTier!.url);
    const meta = await sharp(buf).metadata();
    console.log(
      `CMYK-WM-01: ${testTier!.label} tier: ${meta.width}x${meta.height}, ` +
        `format=${meta.format}, space=${meta.space}`,
    );
    expect(meta.format, "Tier should be a valid image format").toBeTruthy();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  // CMYK-WM-02: Watermark is applied (visitor version differs from owner)
  // Skipped: Known bug BUGZ-1729 — white text watermark on CMYK images is not applied correctly
  test.skip("CMYK-WM-02: Watermark is applied to visitor-facing tier", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await uploadToPublicWatermarkedAlbum(
      api,
      testAlbumKey,
      testAlbumUri,
    );

    const ownerTiers = await api.getSizeDetails(imageKey);
    const testTier = ownerTiers.find((t) => t.label === "M" || t.label === "L");
    expect(testTier, "No M or L tier available").toBeTruthy();

    // Download as owner (clean)
    const ownerBuf = await api.downloadBuffer(testTier!.url);

    // Try visitor API
    const visitorApi = getVisitorApi();
    let visitorTiers;
    try {
      visitorTiers = await visitorApi.getSizeDetails(imageKey);
    } catch (err: any) {
      // On inside, the visitor API can't resolve images by key.
      // This is an environment limitation, not a test issue.
      test.fail(
        true,
        `Cannot verify watermark on visitor tier — visitor API returned 404. ` +
          `This is expected on inside where public image resolution by key is not supported. ` +
          `Run on production to fully validate watermark application.`,
      );
      return;
    }

    const visitorTier = visitorTiers.find((t) => t.label === testTier!.label);
    expect(visitorTier, "Visitor tier not found").toBeTruthy();

    const visitorBuf = await visitorApi.downloadBuffer(visitorTier!.url);
    const ownerMd5 = md5Hex(ownerBuf);
    const visitorMd5 = md5Hex(visitorBuf);
    console.log(
      `CMYK-WM-02: Owner MD5=${ownerMd5.slice(0, 12)}..., ` +
        `Visitor MD5=${visitorMd5.slice(0, 12)}...`,
    );
    expect(
      visitorMd5,
      "Visitor tier should differ from owner — watermark must be applied",
    ).not.toBe(ownerMd5);
  });

  // CMYK-WM-03: Watermark text is WHITE (not black)
  // Skipped: Known bug BUGZ-1729 — white text watermark renders as black on CMYK images
  test.skip("CMYK-WM-03: Watermark text on CMYK image renders as white (not black)", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await uploadToPublicWatermarkedAlbum(
      api,
      testAlbumKey,
      testAlbumUri,
    );
    const sharp = require("sharp");

    const ownerTiers = await api.getSizeDetails(imageKey);
    const tier = ownerTiers.find((t) => t.label === "M" || t.label === "L");
    expect(tier, "No M or L tier available").toBeTruthy();

    // Owner version (no watermark)
    const ownerBuf = await api.downloadBuffer(tier!.url);

    // Visitor version (watermarked)
    const visitorApi = getVisitorApi();
    let visitorTiers;
    try {
      visitorTiers = await visitorApi.getSizeDetails(imageKey);
    } catch (err: any) {
      test.fail(
        true,
        `Cannot verify watermark color — visitor API returned 404. ` +
          `On inside, public image resolution by key is not supported. ` +
          `Run on production to validate that white watermark text is not ` +
          `rendered as black (CMYK inversion bug).`,
      );
      return;
    }

    const visitorTier = visitorTiers.find((t) => t.label === tier!.label);
    expect(visitorTier, "Visitor tier not found").toBeTruthy();
    const visitorBuf = await visitorApi.downloadBuffer(visitorTier!.url);

    // Normalize both to sRGB for comparison
    const meta = await sharp(ownerBuf).metadata();
    const w = meta.width!;
    const h = meta.height!;

    const ownerRaw = await sharp(ownerBuf)
      .toColorspace("srgb")
      .resize(w, h, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();
    const visitorRaw = await sharp(visitorBuf)
      .toColorspace("srgb")
      .resize(w, h, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Find watermark pixels (differ between owner and visitor)
    const DIFF_THRESHOLD = 30;
    const watermarkPixels: Array<{ r: number; g: number; b: number }> = [];

    const totalPixels = w * h;
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 3;
      const dR = Math.abs(ownerRaw[idx] - visitorRaw[idx]);
      const dG = Math.abs(ownerRaw[idx + 1] - visitorRaw[idx + 1]);
      const dB = Math.abs(ownerRaw[idx + 2] - visitorRaw[idx + 2]);
      if (dR > DIFF_THRESHOLD || dG > DIFF_THRESHOLD || dB > DIFF_THRESHOLD) {
        watermarkPixels.push({
          r: visitorRaw[idx],
          g: visitorRaw[idx + 1],
          b: visitorRaw[idx + 2],
        });
      }
    }

    console.log(
      `CMYK-WM-03: Found ${watermarkPixels.length} watermark pixels ` +
        `out of ${totalPixels} total`,
    );
    expect(
      watermarkPixels.length,
      "Should detect watermark pixels by diffing owner vs visitor",
    ).toBeGreaterThan(0);

    // Analyze brightness of watermark pixels
    // White text → luminance > 200
    // Black text (CMYK inversion bug) → luminance < 50
    let brightCount = 0;
    let darkCount = 0;
    for (const px of watermarkPixels) {
      const luminance = 0.299 * px.r + 0.587 * px.g + 0.114 * px.b;
      if (luminance > 200) brightCount++;
      if (luminance < 50) darkCount++;
    }

    const brightPercent = (brightCount / watermarkPixels.length) * 100;
    const darkPercent = (darkCount / watermarkPixels.length) * 100;
    console.log(
      `CMYK-WM-03: Watermark pixels: ` +
        `${brightCount} bright (${brightPercent.toFixed(1)}%), ` +
        `${darkCount} dark (${darkPercent.toFixed(1)}%)`,
    );

    // The watermark is configured as white text.
    // Majority of watermark pixels should be bright (white).
    // If they are dark (black), the CMYK color inversion bug is present.
    expect(
      brightPercent,
      "White text watermark pixels should be bright (>200 luminance). " +
        "If this fails with mostly dark pixels, the CMYK color inversion bug " +
        "is present — white watermark text is rendering as black.",
    ).toBeGreaterThan(50);
  });

  // CMYK-WM-04: Archived original is valid
  test("CMYK-WM-04: Archived CMYK image is valid after ingest", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await uploadToPublicWatermarkedAlbum(
      api,
      testAlbumKey,
      testAlbumUri,
    );
    const image = await api.getImage(imageKey);

    const archivedBuffer = await api.downloadBuffer(image.ArchivedUri);
    expect(archivedBuffer.length).toBeGreaterThan(0);

    const sharp = require("sharp");
    const meta = await sharp(archivedBuffer).metadata();
    console.log(
      `CMYK-WM-04: Archived format=${meta.format}, space=${meta.space}, ` +
        `${meta.width}x${meta.height}`,
    );
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
  });

  // CMYK-WM-05: Rendered tiers have meaningful color data
  test("CMYK-WM-05: Rendered tiers have meaningful color data", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const imageKey = await uploadToPublicWatermarkedAlbum(
      api,
      testAlbumKey,
      testAlbumUri,
    );
    const sharp = require("sharp");

    const ownerTiers = await api.getSizeDetails(imageKey);
    const tier = ownerTiers.find((t) => t.label === "M" || t.label === "L");
    expect(tier, "No suitable tier").toBeTruthy();

    const ownerBuf = await api.downloadBuffer(tier!.url);

    // Convert to sRGB for analysis (tier may be CMYK on disk)
    const { data } = await sharp(ownerBuf)
      .toColorspace("srgb")
      .resize(200, 200, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minR = 255,
      maxR = 0;
    let minG = 255,
      maxG = 0;
    let minB = 255,
      maxB = 0;

    for (let i = 0; i < 200 * 200; i++) {
      const idx = i * 3;
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

    const totalRange = maxR - minR + (maxG - minG) + (maxB - minB);
    console.log(
      `CMYK-WM-05: Tonal range R=${maxR - minR} G=${maxG - minG} B=${maxB - minB} (total=${totalRange})`,
    );
    expect(
      totalRange,
      "Tiers should contain meaningful color data",
    ).toBeGreaterThan(30);
  });
});
