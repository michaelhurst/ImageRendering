/**
 * OR-01 through OR-12 (API): EXIF Orientation
 *
 * Uploads orientation-tagged images from local disk to SmugMug and
 * verifies the pipeline corrects orientation in served images, updates
 * API dimensions, and renders correctly in Lightbox.
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
const ORIENT6_HIRES_PATH = path.join(
  IMAGES_DIR,
  "c-Landscape_6-Rotated-90-CW-6000x4000.jpg",
);

const ORIENTATION_IMAGES: [number, string][] = [
  [1, "Landscape_1-Normal.jpg"],
  [2, "Landscape_2-Mirrored-horizontal.jpg"],
  [3, "Landscape_3-Rotated-180.jpg"],
  [4, "Landscape_4-Mirrored-vertical.jpg"],
  [5, "Landscape_5-Mirrored-horizontal-rotated-270-CW.jpg"],
  [6, "Landscape_6-Rotated-90-CW.jpg"],
  [7, "Landscape_7-Mirrored-horizontal-rotated-90-CW.jpg"],
  [8, "Landscape_8-Rotated-270-CW.jpg"],
];

test.describe("OR (API): EXIF Orientation", () => {
  const _uploadedKeys: Map<number, string> = new Map();
  let _orient6Key: string | undefined;

  async function ensureOrientationUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<Map<number, string>> {
    if (_uploadedKeys.size === 0) {
      for (const [tag, filename] of ORIENTATION_IMAGES) {
        const result = await api.uploadImage(
          path.join(IMAGES_DIR, filename),
          albumUri,
          {
            title: `or-${tag}`,
          },
        );
        _uploadedKeys.set(tag, SmugMugAPI.extractImageKey(result.ImageUri));
      }
    }
    return _uploadedKeys;
  }

  async function ensureOrient6Uploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_orient6Key) {
      const result = await api.uploadImage(ORIENT6_HIRES_PATH, albumUri, {
        title: "or-6-6000x4000",
      });
      _orient6Key = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _orient6Key;
  }

  // OR-01 through OR-08: Each orientation displays correctly after correction
  // Source images are all landscape (400x300 raw pixels).
  // Tags 1-4: no dimension swap → served image should be landscape (width > height)
  // Tags 5-8: 90°/270° rotation swaps dimensions → served image should be portrait (height > width)
  for (const [tag, filename] of ORIENTATION_IMAGES) {
    test(`OR-0${tag}: Orientation ${tag} (${filename}) served image is corrected`, async ({
      api,
      testAlbumUri,
    }) => {
      const uploadedKeys = await ensureOrientationUploaded(api, testAlbumUri);
      const tiers = await api.waitForSizeTiers(uploadedKeys.get(tag)!);
      const largeTier =
        tiers.find((t) => t.label === "L" || t.label === "XL") ||
        tiers.find((t) => t.label === "M" || t.label === "S");
      expect(largeTier, `No usable tier for orientation ${tag}`).toBeTruthy();

      const tierBuffer = await api.downloadBuffer(largeTier!.url);
      const sharp = require("sharp");
      const meta = await sharp(tierBuffer).metadata();
      console.log(`OR-0${tag}: served ${meta.width}x${meta.height}`);

      if (tag <= 4) {
        // Orientations 1-4: no dimension swap, image stays landscape
        expect(
          meta.width,
          `Orientation ${tag} should be landscape (width > height) but got ${meta.width}x${meta.height}`,
        ).toBeGreaterThan(meta.height!);
      } else {
        // Orientations 5-8: 90°/270° rotation, image becomes portrait
        expect(
          meta.height,
          `Orientation ${tag} should be portrait (height > width) but got ${meta.width}x${meta.height}`,
        ).toBeGreaterThan(meta.width!);
      }
    });
  }

  // OR-09: Orientation correction updates API dimensions
  test("OR-09: Orientation 6 updates API dimensions to display-corrected", async ({
    api,
    testAlbumUri,
  }) => {
    const orient6Key = await ensureOrient6Uploaded(api, testAlbumUri);
    const image = await api.getImage(orient6Key);
    console.log(
      `OR-09: API reports ${image.OriginalWidth}x${image.OriginalHeight}`,
    );
    // Raw pixels are 6000x4000 (landscape), but orientation 6 means display is portrait (4000x6000)
    // SmugMug should report display-corrected dimensions
    expect(image.OriginalWidth).toBeLessThanOrEqual(image.OriginalHeight);
  });

  // OR-10: Orientation corrected across all size tiers
  test("OR-10: Orientation 6 is portrait across all size tiers", async ({
    api,
    testAlbumUri,
  }) => {
    const orient6Key = await ensureOrient6Uploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(orient6Key);
    for (const tier of tiers) {
      if (tier.label === "O") continue;
      console.log(`${tier.label}: ${tier.width}x${tier.height}`);
      // All tiers should be portrait (height >= width)
      expect(
        tier.height,
        `${tier.label} should be portrait`,
      ).toBeGreaterThanOrEqual(tier.width);
    }
  });

  // OR-11: Orientation corrected in Lightbox
  test("OR-11: Orientation 6 renders as portrait in Lightbox", async ({
    api,
    page,
    testNickname,
    testAlbumUri,
  }) => {
    // Upload directly into this test's album
    const result = await api.uploadImage(ORIENT6_HIRES_PATH, testAlbumUri, {
      title: "or-6-lightbox",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const image = await api.getImage(key);
    await page.goto(image.WebUri);
    await page.waitForLoadState("networkidle");

    // The Lightbox renders the image as a hidden <img> with class "sm-image".
    // Check naturalWidth/naturalHeight directly instead of waiting for visibility.
    const dims = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        if (img.src.includes("photos") && img.naturalWidth > 0) {
          return { width: img.naturalWidth, height: img.naturalHeight };
        }
      }
      return null;
    });

    if (!dims) {
      // Fallback: wait a bit and retry
      await page.waitForTimeout(5000);
      const retry = await page.evaluate(() => {
        const imgs = document.querySelectorAll("img");
        for (const img of imgs) {
          if (img.src.includes("photos") && img.naturalWidth > 0) {
            return { width: img.naturalWidth, height: img.naturalHeight };
          }
        }
        return null;
      });
      expect(retry, "No loaded image found in Lightbox").toBeTruthy();
      console.log(`Lightbox image: ${retry!.width}x${retry!.height}`);
      expect(retry!.height).toBeGreaterThan(retry!.width);
    } else {
      console.log(`Lightbox image: ${dims.width}x${dims.height}`);
      expect(dims.height).toBeGreaterThan(dims.width);
    }
  });

  // OR-12: Orientation corrected in gallery thumbnails
  test("OR-12: Orientation 6 thumbnail is portrait in gallery", async ({
    api,
    page,
    testAlbumKey,
    testAlbumUri,
  }) => {
    // Upload orientation-6 image into this test's album
    const result = await api.uploadImage(ORIENT6_HIRES_PATH, testAlbumUri, {
      title: "or-6-gallery-thumb",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);

    // Wait for size tiers to generate (needed for thumbnails)
    await api.waitForSizeTiers(key);

    // Get the album's web URL from the API
    const albumData = await api.get(`/api/v2/album/${testAlbumKey}`);
    const albumWebUri = albumData.Response.Album.WebUri;
    const albumUrl = albumWebUri.startsWith("http")
      ? albumWebUri
      : `${process.env.ENVIRONMENT === "production" ? "https://www.smugmug.com" : "https://inside.smugmug.net"}${albumWebUri}`;

    console.log(`OR-12: Navigating to album: ${albumUrl}`);
    await page.goto(albumUrl, { waitUntil: "networkidle", timeout: 30_000 });

    // Wait for thumbnail images to load
    await page.waitForTimeout(3000);

    // Find thumbnail images that reference the photos CDN
    const thumbDims = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        if (
          img.src.includes("photos") &&
          img.naturalWidth > 0 &&
          img.naturalHeight > 0
        ) {
          return { width: img.naturalWidth, height: img.naturalHeight };
        }
      }
      return null;
    });

    if (!thumbDims) {
      // Retry after more time for lazy-loaded thumbnails
      await page.waitForTimeout(5000);
      const retry = await page.evaluate(() => {
        const imgs = document.querySelectorAll("img");
        for (const img of imgs) {
          if (
            img.src.includes("photos") &&
            img.naturalWidth > 0 &&
            img.naturalHeight > 0
          ) {
            return { width: img.naturalWidth, height: img.naturalHeight };
          }
        }
        return null;
      });
      expect(retry, "No thumbnail image found in gallery").toBeTruthy();
      console.log(`OR-12: Thumbnail ${retry!.width}x${retry!.height}`);
      expect(
        retry!.height,
        "Thumbnail should be portrait (height > width)",
      ).toBeGreaterThan(retry!.width);
    } else {
      console.log(`OR-12: Thumbnail ${thumbDims.width}x${thumbDims.height}`);
      expect(
        thumbDims.height,
        "Thumbnail should be portrait (height > width)",
      ).toBeGreaterThan(thumbDims.width);
    }
  });
});
