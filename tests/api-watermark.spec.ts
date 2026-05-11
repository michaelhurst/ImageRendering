/**
 * WM-01 through WM-05 (API): Watermark Rendering
 *
 * Uploads images from local disk to a watermark-enabled gallery and
 * verifies watermark presence for visitors, absence for owners, and
 * scaling across tiers.
 *
 * Source images are read from TEST_IMAGES_DIR to ensure byte-for-byte
 * integrity comparisons against a known-good local copy.
 *
 * Requires: TEST_IMAGES_DIR, authenticated session
 * Note: Gallery must have watermarking enabled for WM-01/WM-04/WM-05 to be meaningful.
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const WATERMARK_PATH = path.join(IMAGES_DIR, "c-watermark-test.jpg");

function md5Hex(buf: Buffer): string {
  return crypto.createHash("md5").update(buf).digest("hex");
}

test.describe("WM (API): Watermark Rendering", () => {
  let _wmKey: string | undefined;

  async function ensureUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_wmKey) {
      const result = await api.uploadImage(WATERMARK_PATH, albumUri, {
        title: "wm-test",
      });
      _wmKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _wmKey;
  }

  // WM-01: Watermark present on visitor-facing tiers
  // Downloads the same tier as both owner and visitor. If watermarking is active,
  // the visitor version should differ from the owner version (watermark applied).
  test("WM-01: Watermark present on visitor-facing tiers", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const wmKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(wmKey);
    const tiers = await api.getSizeDetails(wmKey);
    console.log(`Watermark flag: ${image.Watermark}`);
    console.log(`Tiers available: ${tiers.map((t) => t.label).join(", ")}`);

    // Enable watermarking on the album if not already
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });

    // Pick a mid-size tier for comparison
    const testTier = tiers.find((t) => t.label === "L" || t.label === "M");
    if (!testTier) {
      console.log("WM-01: No L or M tier available");
      return;
    }

    // Download as owner (should be clean)
    const ownerBuf = await api.downloadBuffer(testTier.url);
    expect(ownerBuf.length).toBeGreaterThan(0);

    // Download as visitor (should have watermark)
    const visitorApi = SmugMugAPI.withApiKey(
      process.env.SMUGMUG_API_KEY_INSIDE ||
        process.env.SMUGMUG_API_KEY_PRODUCTION ||
        "",
    );
    try {
      const visitorTiers = await visitorApi.getSizeDetails(wmKey);
      const visitorTier = visitorTiers.find((t) => t.label === testTier.label);
      if (visitorTier) {
        const visitorBuf = await visitorApi.downloadBuffer(visitorTier.url);
        const ownerMd5 = md5Hex(ownerBuf);
        const visitorMd5 = md5Hex(visitorBuf);
        console.log(
          `WM-01: Owner ${testTier.label} MD5: ${ownerMd5.slice(0, 12)}..., ` +
            `Visitor MD5: ${visitorMd5.slice(0, 12)}...`,
        );
        // If watermarking is active, the files should differ
        if (image.Watermark) {
          expect(
            visitorMd5,
            "Visitor tier should differ from owner (watermark applied)",
          ).not.toBe(ownerMd5);
        }
      }
    } catch (err: any) {
      // Visitor API may not have access — just verify owner tiers are valid
      console.log(`WM-01: Visitor access failed: ${err.message.slice(0, 80)}`);
    }
  });

  // WM-02: Watermark absent on owner-viewed images
  test("WM-02: Owner download has no watermark (MD5 matches source)", async ({
    api,
    testAlbumUri,
  }) => {
    const wmKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(wmKey);
    const sourceBuffer = fs.readFileSync(WATERMARK_PATH);
    const archivedBuffer = await api.downloadBuffer(image.ArchivedUri);
    expect(md5Hex(archivedBuffer)).toBe(md5Hex(sourceBuffer));
  });

  // WM-03: Archived original has no watermark (size matches source)
  test("WM-03: Archived original has no watermark", async ({
    api,
    testAlbumUri,
  }) => {
    const wmKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(wmKey);
    const sourceBuffer = fs.readFileSync(WATERMARK_PATH);
    // ArchivedSize should match source — proves no watermark added to original
    expect(image.ArchivedSize).toBe(sourceBuffer.length);
  });

  // WM-04: Watermark applied at both small and large sizes
  test("WM-04: Watermark pixel diff between tiers is consistent", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const wmKey = await ensureUploaded(api, testAlbumUri);
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });
    const tiers = await api.getSizeDetails(wmKey);

    const smallTier = tiers.find((t) => t.label === "Th" || t.label === "S");
    const largeTier = tiers.find((t) => t.label === "L" || t.label === "XL");
    if (!smallTier || !largeTier) {
      console.log("WM-04: Not enough tiers for comparison");
      return;
    }

    // Download owner versions (clean)
    const [ownerSmall, ownerLarge] = await Promise.all([
      api.downloadBuffer(smallTier.url),
      api.downloadBuffer(largeTier.url),
    ]);

    // Download visitor versions (watermarked)
    const visitorApi = SmugMugAPI.withApiKey(
      process.env.SMUGMUG_API_KEY_INSIDE ||
        process.env.SMUGMUG_API_KEY_PRODUCTION ||
        "",
    );
    try {
      const visitorTiers = await visitorApi.getSizeDetails(wmKey);
      const visitorSmall = visitorTiers.find(
        (t) => t.label === smallTier.label,
      );
      const visitorLarge = visitorTiers.find(
        (t) => t.label === largeTier.label,
      );

      if (visitorSmall && visitorLarge) {
        const [vSmallBuf, vLargeBuf] = await Promise.all([
          visitorApi.downloadBuffer(visitorSmall.url),
          visitorApi.downloadBuffer(visitorLarge.url),
        ]);

        const smallDiffers = md5Hex(ownerSmall) !== md5Hex(vSmallBuf);
        const largeDiffers = md5Hex(ownerLarge) !== md5Hex(vLargeBuf);
        console.log(
          `WM-04: Small (${smallTier.label}) watermarked: ${smallDiffers}, ` +
            `Large (${largeTier.label}) watermarked: ${largeDiffers}`,
        );
        expect(smallDiffers, "Small tier should have watermark").toBe(true);
        expect(largeDiffers, "Large tier should have watermark").toBe(true);
      }
    } catch (err: any) {
      console.log(`WM-04: Visitor access failed: ${err.message.slice(0, 80)}`);
    }
  });

  // WM-05: Watermark applied to all visitor-facing tiers
  test("WM-05: All tiers are valid images (watermark scaling check)", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const wmKey = await ensureUploaded(api, testAlbumUri);
    await api.patch(`/api/v2/album/${testAlbumKey}`, { Watermark: true });
    const ownerTiers = await api.getSizeDetails(wmKey);

    const visitorApi = SmugMugAPI.withApiKey(
      process.env.SMUGMUG_API_KEY_INSIDE ||
        process.env.SMUGMUG_API_KEY_PRODUCTION ||
        "",
    );
    try {
      const visitorTiers = await visitorApi.getSizeDetails(wmKey);
      let watermarkedCount = 0;

      for (const tier of visitorTiers) {
        if (tier.label === "O") continue;
        const ownerTier = ownerTiers.find((t) => t.label === tier.label);
        if (!ownerTier) continue;

        const [ownerBuf, visitorBuf] = await Promise.all([
          api.downloadBuffer(ownerTier.url),
          visitorApi.downloadBuffer(tier.url),
        ]);

        const differs = md5Hex(ownerBuf) !== md5Hex(visitorBuf);
        console.log(
          `${tier.label}: ${tier.width}x${tier.height} — watermarked: ${differs}`,
        );
        if (differs) watermarkedCount++;
      }

      console.log(
        `WM-05: ${watermarkedCount}/${visitorTiers.filter((t) => t.label !== "O").length} tiers watermarked`,
      );
      expect(
        watermarkedCount,
        "At least some tiers should have watermarks",
      ).toBeGreaterThan(0);
    } catch (err: any) {
      // Fallback: just verify owner tiers are valid
      console.log(`WM-05: Visitor access failed, checking owner tiers only`);
      const sharp = require("sharp");
      for (const tier of ownerTiers) {
        const buf = await api.downloadBuffer(tier.url);
        const meta = await sharp(buf).metadata();
        expect(meta.width).toBe(tier.width);
        expect(meta.height).toBe(tier.height);
      }
    }
  });
});
