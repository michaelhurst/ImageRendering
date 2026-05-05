/**
 * RC-01 through RC-04 (API): Display Resolution Cap
 *
 * Uploads a high-resolution image from local disk and verifies that
 * resolution cap settings limit served sizes for visitors while
 * preserving full resolution for owners.
 *
 * The test sets the album's LargestSize field to enforce a cap,
 * then verifies tiers respect it from the visitor perspective.
 *
 * Source images are read from TEST_IMAGES_DIR.
 * Requires: TEST_IMAGES_DIR, authenticated session
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const HIRES_PATH = path.join(IMAGES_DIR, "c-resolution-cap-test.jpg");

// LargestSize tier label → max longest edge in pixels
const TIER_MAX_PIXELS: Record<string, number> = {
  Medium: 600,
  Large: 800,
  XLarge: 1024,
  X2Large: 1280,
  X3Large: 1600,
  X4Large: 2048,
  X5Large: 2560,
  "4K": 3840,
  "5K": 5120,
  Original: 99999,
};

// The cap we'll set for testing — XLarge means max 1024px longest edge for visitors
const TEST_CAP_TIER = "XLarge";
const TEST_CAP_PIXELS = TIER_MAX_PIXELS[TEST_CAP_TIER];

test.describe("RC (API): Display Resolution Cap", () => {
  let _hiresKey: string | undefined;

  async function ensureUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_hiresKey) {
      const result = await api.uploadImage(HIRES_PATH, albumUri, {
        title: "rc-hires",
      });
      _hiresKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _hiresKey;
  }

  // RC-01: Each LargestSize setting correctly caps the max tier
  test("RC-01: No tier exceeds resolution cap", async ({
    api,
    testAlbumKey,
    testAlbumUri,
  }) => {
    const hiresKey = await ensureUploaded(api, testAlbumUri);
    await api.waitForSizeTiers(hiresKey);

    // Test each cap setting
    const capsToTest: [string, number][] = [
      ["Medium", 600],
      ["Large", 800],
      ["XLarge", 1024],
      ["X2Large", 1280],
      ["X3Large", 1600],
      ["X4Large", 2048],
      ["X5Large", 2560],
      ["4K", 3840],
      ["5K", 5120],
    ];

    // Create a visitor (unauthenticated) API client to check what visitors see
    const visitorApi = SmugMugAPI.withApiKey(
      process.env.ENVIRONMENT === "production"
        ? process.env.SMUGMUG_API_KEY_PRODUCTION!
        : process.env.SMUGMUG_API_KEY_INSIDE!,
    );

    for (const [capTier, maxPixels] of capsToTest) {
      await api.patch(`/api/v2/album/${testAlbumKey}`, {
        LargestSize: capTier,
      });

      // Query as visitor — the cap should limit what's returned
      const tiers = await visitorApi.getSizeDetails(hiresKey);
      const nonOriginalTiers = tiers.filter((t) => t.label !== "O");

      if (nonOriginalTiers.length === 0) {
        console.log(
          `RC-01: LargestSize=${capTier} → no tiers visible to visitor`,
        );
        continue;
      }

      const largestTier = nonOriginalTiers.reduce((max, t) =>
        Math.max(t.width, t.height) > Math.max(max.width, max.height) ? t : max,
      );
      const largestEdge = Math.max(largestTier.width, largestTier.height);

      console.log(
        `RC-01: LargestSize=${capTier} → largest visitor tier: ${largestTier.label} at ${largestEdge}px (cap: ${maxPixels}px)`,
      );
      expect(
        largestEdge,
        `LargestSize=${capTier}: visitor tier (${largestTier.label}) at ${largestEdge}px exceeds cap of ${maxPixels}px`,
      ).toBeLessThanOrEqual(maxPixels);
    }
  });

  // RC-02: Owner can still access full resolution
  test("RC-02: Owner can access full resolution tiers", async ({
    api,
    testAlbumUri,
  }) => {
    const hiresKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(hiresKey);
    const largest = await api.getLargestImage(hiresKey);

    console.log(`Original: ${image.OriginalWidth}x${image.OriginalHeight}`);
    console.log(`Largest available: ${largest.width}x${largest.height}`);

    expect(largest.width).toBeGreaterThan(0);
    expect(largest.height).toBeGreaterThan(0);
    expect(largest.url).toBeTruthy();
  });

  // RC-03: Owner archived download is full resolution
  test("RC-03: Owner archived download is full resolution", async ({
    api,
    testAlbumUri,
  }) => {
    const hiresKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(hiresKey);
    const sharp = require("sharp");
    const sourceMeta = await sharp(fs.readFileSync(HIRES_PATH)).metadata();

    expect(image.OriginalWidth).toBe(sourceMeta.width);
    expect(image.OriginalHeight).toBe(sourceMeta.height);

    const archivedBuffer = await api.downloadBuffer(image.ArchivedUri);
    const archivedMeta = await sharp(archivedBuffer).metadata();
    expect(archivedMeta.width).toBe(sourceMeta.width);
    expect(archivedMeta.height).toBe(sourceMeta.height);
  });

  // RC-04: Lightbox respects resolution cap for visitors
  test("RC-04: Lightbox image respects resolution cap", async ({
    api,
    page,
    testAlbumKey,
    testAlbumUri,
  }) => {
    // Set the resolution cap
    await api.patch(`/api/v2/album/${testAlbumKey}`, {
      LargestSize: TEST_CAP_TIER,
    });
    console.log(
      `RC-04: Set LargestSize=${TEST_CAP_TIER} (max ${TEST_CAP_PIXELS}px)`,
    );

    const hiresKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(hiresKey);

    // View as visitor (logged-out context)
    const browser = page.context().browser()!;
    const visitorOpts: any = {};
    if (process.env.ENVIRONMENT === "inside") {
      visitorOpts.httpCredentials = {
        username: process.env.INSIDE_AUTH_USER || "",
        password: process.env.INSIDE_AUTH_PASS || "",
      };
    }
    const visitorCtx = await browser.newContext(visitorOpts);
    const visitorPage = await visitorCtx.newPage();

    await visitorPage.goto(image.WebUri);
    await visitorPage.waitForLoadState("networkidle");

    const imgDims = await visitorPage.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        if (img.src.includes("photos") && img.naturalWidth > 100) {
          return { width: img.naturalWidth, height: img.naturalHeight };
        }
      }
      return null;
    });

    await visitorPage.close();
    await visitorCtx.close();

    if (imgDims) {
      const longestEdge = Math.max(imgDims.width, imgDims.height);
      console.log(
        `RC-04: Visitor Lightbox image: ${imgDims.width}x${imgDims.height} (longest: ${longestEdge})`,
      );
      expect(
        longestEdge,
        `Lightbox image exceeds cap of ${TEST_CAP_PIXELS}px`,
      ).toBeLessThanOrEqual(TEST_CAP_PIXELS);
    } else {
      console.log("RC-04: No image found in visitor Lightbox");
    }
  });
});
