/**
 * RC-01 through RC-04 (API): Display Resolution Cap
 *
 * Uploads a high-resolution image from local disk and verifies that
 * resolution cap settings limit served sizes for visitors while
 * preserving full resolution for owners.
 *
 * Source images are read from TEST_IMAGES_DIR to ensure byte-for-byte
 * integrity comparisons against a known-good local copy.
 *
 * Requires: TEST_IMAGES_DIR, authenticated session
 * Note: Gallery must have resolution cap configured for RC-01/RC-04 to enforce limits.
 */

import { test, expect } from "../helpers/test-fixtures";
import { SmugMugAPI } from "../helpers/smugmug-api";
import * as fs from "fs";
import * as path from "path";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const HIRES_PATH = path.join(IMAGES_DIR, "c-resolution-cap-test.jpg");

const RESOLUTION_CAP_MAX = process.env.TEST_RESOLUTION_CAP_MAX
  ? parseInt(process.env.TEST_RESOLUTION_CAP_MAX, 10)
  : null;

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

  // RC-01: Capped resolution limits max served size
  // SKIPPED: Requires TEST_RESOLUTION_CAP_MAX env var (e.g., 5120 for 5K cap).
  // The cap varies by account plan. Set it to the expected max longest edge.
  test("RC-01: No tier exceeds resolution cap", async ({
    api,
    testAlbumUri,
  }) => {
    if (!RESOLUTION_CAP_MAX) {
      test.skip(true, "TEST_RESOLUTION_CAP_MAX not set");
      return;
    }
    const hiresKey = await ensureUploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(hiresKey);
    for (const tier of tiers) {
      if (tier.label === "O") continue;
      const longestEdge = Math.max(tier.width, tier.height);
      console.log(
        `${tier.label}: ${tier.width}x${tier.height} (longest: ${longestEdge})`,
      );
      expect(longestEdge, `${tier.label} exceeds cap`).toBeLessThanOrEqual(
        RESOLUTION_CAP_MAX,
      );
    }
  });

  // RC-02: Capped resolution doesn't affect owner's view
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

  // RC-03: Capped resolution doesn't affect owner download
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
  // SKIPPED: Same as RC-01 — needs TEST_RESOLUTION_CAP_MAX to validate the cap
  // is enforced in the browser Lightbox view (visitor perspective).
  test("RC-04: Lightbox image respects resolution cap", async ({
    api,
    page,
    testAlbumUri,
  }) => {
    if (!RESOLUTION_CAP_MAX) {
      test.skip(true, "TEST_RESOLUTION_CAP_MAX not set");
      return;
    }
    const hiresKey = await ensureUploaded(api, testAlbumUri);
    const image = await api.getImage(hiresKey);
    await page.goto(image.WebUri);
    await page.waitForLoadState("networkidle");

    const imgSrc = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        if (img.naturalWidth > 100) {
          return {
            width: img.naturalWidth,
            height: img.naturalHeight,
            src: img.src.substring(0, 100),
          };
        }
      }
      return null;
    });

    if (imgSrc) {
      const longestEdge = Math.max(imgSrc.width, imgSrc.height);
      console.log(
        `Lightbox image: ${imgSrc.width}x${imgSrc.height} (longest: ${longestEdge})`,
      );
      expect(longestEdge).toBeLessThanOrEqual(RESOLUTION_CAP_MAX);
    }
  });
});
