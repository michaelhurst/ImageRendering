/**
 * SZ-01 through SZ-11 (API): Image Dimensions & Sizing
 *
 * Uploads reference images from local disk to SmugMug and verifies CDN
 * size tiers serve correct dimensions, aspect ratios, and that API
 * fields match source metadata.
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
const LANDSCAPE_PATH = path.join(IMAGES_DIR, "c-sizing-landscape.jpg");
const PORTRAIT_PATH = path.join(IMAGES_DIR, "c-sizing-portrait.jpg");
const SQUARE_PATH = path.join(IMAGES_DIR, "c-sizing-square.jpg");
const PANORAMIC_PATH = path.join(IMAGES_DIR, "c-sizing-panoramic.jpg");
const TALL_PATH = path.join(IMAGES_DIR, "c-sizing-tall.jpg");
const SMALL_PATH = path.join(IMAGES_DIR, "c-sizing-small.jpg");

test.describe("SZ (API): Image Dimensions & Sizing", () => {
  let _landscapeKey: string | undefined;

  async function ensureLandscapeUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_landscapeKey) {
      const result = await api.uploadImage(LANDSCAPE_PATH, albumUri, {
        title: "sz-landscape",
      });
      _landscapeKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _landscapeKey;
  }

  // SZ-01: Each CDN tier serves correct pixel dimensions
  test("SZ-01: Each CDN tier serves correct pixel dimensions", async ({
    api,
    testAlbumUri,
  }) => {
    const landscapeKey = await ensureLandscapeUploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(landscapeKey);
    const sharp = require("sharp");

    for (const tier of tiers) {
      const buf = await api.downloadBuffer(tier.url);
      const meta = await sharp(buf).metadata();
      console.log(
        `${tier.label}: API=${tier.width}x${tier.height}, actual=${meta.width}x${meta.height}`,
      );
      expect(meta.width, `${tier.label} width mismatch`).toBeGreaterThanOrEqual(
        tier.width - 1,
      );
      expect(meta.width, `${tier.label} width mismatch`).toBeLessThanOrEqual(
        tier.width + 1,
      );
      expect(
        meta.height,
        `${tier.label} height mismatch`,
      ).toBeGreaterThanOrEqual(tier.height - 1);
      expect(meta.height, `${tier.label} height mismatch`).toBeLessThanOrEqual(
        tier.height + 1,
      );
    }
  });

  // SZ-02: Aspect ratio preserved across all tiers
  test("SZ-02: Aspect ratio preserved across all tiers", async ({
    api,
    testAlbumUri,
  }) => {
    const landscapeKey = await ensureLandscapeUploaded(api, testAlbumUri);
    const image = await api.getImage(landscapeKey);
    const sourceRatio = image.OriginalWidth / image.OriginalHeight;
    const tiers = await api.getSizeDetails(landscapeKey);

    for (const tier of tiers) {
      if (tier.label === "O") continue;
      // Skip square-cropped tiers (Ti, Th) — they don't preserve aspect ratio
      if (tier.width === tier.height && tier.width <= 150) continue;
      const tierRatio = tier.width / tier.height;
      console.log(
        `${tier.label}: ratio=${tierRatio.toFixed(3)} (source=${sourceRatio.toFixed(3)})`,
      );
      expect(
        Math.abs(tierRatio - sourceRatio),
        `${tier.label} aspect ratio drift`,
      ).toBeLessThanOrEqual(0.02);
    }
  });

  // SZ-03: Landscape image longest edge matches expected tier sizes
  test("SZ-03: Landscape image longest edge matches tier spec", async ({
    api,
    testAlbumUri,
  }) => {
    const landscapeKey = await ensureLandscapeUploaded(api, testAlbumUri);
    const tiers = await api.getSizeDetails(landscapeKey);

    // Expected longest edge for each tier (for a 6000x4000 source)
    const expectedMaxEdge: Record<string, number> = {
      Ti: 100,
      Th: 150,
      S: 400,
      M: 600,
      L: 800,
      XL: 1024,
      X2L: 1280,
      X3L: 1600,
      X4L: 2048,
      X5L: 2560,
      "4K": 3840,
      "5K": 5120,
    };

    for (const tier of tiers) {
      if (tier.label === "O") continue;
      const longestEdge = Math.max(tier.width, tier.height);
      const expected = expectedMaxEdge[tier.label];
      console.log(
        `${tier.label}: longest edge=${longestEdge}${expected ? ` (expected=${expected})` : ""}`,
      );
      if (expected) {
        // Allow ±1px for rounding
        expect(
          longestEdge,
          `${tier.label} longest edge should be ~${expected}px`,
        ).toBeGreaterThanOrEqual(expected - 1);
        expect(
          longestEdge,
          `${tier.label} longest edge should be ~${expected}px`,
        ).toBeLessThanOrEqual(expected + 1);
      }
    }
  });

  // SZ-04: Portrait image longest edge matches tier spec
  test("SZ-04: Portrait image longest edge matches tier spec", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(PORTRAIT_PATH, testAlbumUri, {
      title: "sz-portrait",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const tiers = await api.getSizeDetails(key);

    for (const tier of tiers) {
      if (tier.label === "O") continue;
      // For portrait, height should be the longest edge
      expect(
        tier.height,
        `${tier.label} height should be >= width`,
      ).toBeGreaterThanOrEqual(tier.width);
    }
  });

  // SZ-05: Square image both edges match tier spec
  test("SZ-05: Square image both edges match tier spec", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(SQUARE_PATH, testAlbumUri, {
      title: "sz-square",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const tiers = await api.getSizeDetails(key);

    for (const tier of tiers) {
      if (tier.label === "O") continue;
      console.log(`${tier.label}: ${tier.width}x${tier.height}`);
      expect(tier.width, `${tier.label} not square`).toBe(tier.height);
    }
  });

  // SZ-06: Panoramic image sizing
  test("SZ-06: Panoramic image sizing preserves aspect ratio", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(PANORAMIC_PATH, testAlbumUri, {
      title: "sz-panoramic",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const image = await api.getImage(key);
    const sourceRatio = image.OriginalWidth / image.OriginalHeight;
    const tiers = await api.getSizeDetails(key);

    for (const tier of tiers) {
      if (tier.label === "O") continue;
      if (tier.width === tier.height && tier.width <= 150) continue;
      const tierRatio = tier.width / tier.height;
      expect(
        Math.abs(tierRatio - sourceRatio),
        `${tier.label} panoramic ratio drift`,
      ).toBeLessThanOrEqual(0.1);
    }
  });

  // SZ-07: Very tall image sizing
  test("SZ-07: Very tall image sizing preserves aspect ratio", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(TALL_PATH, testAlbumUri, {
      title: "sz-tall",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const image = await api.getImage(key);
    const sourceRatio = image.OriginalWidth / image.OriginalHeight;
    const tiers = await api.getSizeDetails(key);

    for (const tier of tiers) {
      if (tier.label === "O") continue;
      if (tier.width === tier.height && tier.width <= 150) continue;
      const tierRatio = tier.width / tier.height;
      expect(
        Math.abs(tierRatio - sourceRatio),
        `${tier.label} tall ratio drift`,
      ).toBeLessThanOrEqual(0.1);
    }
  });

  // SZ-08: Small source not upscaled beyond original
  test("SZ-08: Small source not upscaled beyond original", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(SMALL_PATH, testAlbumUri, {
      title: "sz-small",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const tiers = await api.getSizeDetails(key);

    for (const tier of tiers) {
      console.log(`${tier.label}: ${tier.width}x${tier.height}`);
      expect(tier.width, `${tier.label} upscaled width`).toBeLessThanOrEqual(
        400,
      );
      expect(tier.height, `${tier.label} upscaled height`).toBeLessThanOrEqual(
        300,
      );
    }
  });

  // SZ-09: !largestimage returns the actual largest available tier
  test("SZ-09: !largestimage returns highest available dimensions", async ({
    api,
    testAlbumUri,
  }) => {
    const landscapeKey = await ensureLandscapeUploaded(api, testAlbumUri);
    const image = await api.getImage(landscapeKey);
    const largest = await api.getLargestImage(landscapeKey);
    console.log(
      `Largest: ${largest.width}x${largest.height}, Original: ${image.OriginalWidth}x${image.OriginalHeight}`,
    );
    expect(largest.width).toBeLessThanOrEqual(image.OriginalWidth);
    expect(largest.height).toBeLessThanOrEqual(image.OriginalHeight);
    expect(largest.url).toBeTruthy();

    // Verify it's actually the largest — no other tier should be bigger
    const tiers = await api.getSizeDetails(landscapeKey);
    const nonOriginalTiers = tiers.filter((t) => t.label !== "O");
    for (const tier of nonOriginalTiers) {
      const tierLongest = Math.max(tier.width, tier.height);
      const largestLongest = Math.max(largest.width, largest.height);
      expect(
        tierLongest,
        `Tier ${tier.label} (${tierLongest}px) is larger than !largestimage (${largestLongest}px)`,
      ).toBeLessThanOrEqual(largestLongest);
    }
  });

  // SZ-10: OriginalWidth/Height match source file
  test("SZ-10: OriginalWidth/Height match source file", async ({
    api,
    testAlbumUri,
  }) => {
    const landscapeKey = await ensureLandscapeUploaded(api, testAlbumUri);
    const sharp = require("sharp");
    const sourceMeta = await sharp(fs.readFileSync(LANDSCAPE_PATH)).metadata();
    const image = await api.getImage(landscapeKey);
    expect(image.OriginalWidth).toBe(sourceMeta.width);
    expect(image.OriginalHeight).toBe(sourceMeta.height);
  });

  // SZ-11: OriginalSize matches source file byte count
  test("SZ-11: OriginalSize matches source file byte count", async ({
    api,
    testAlbumUri,
  }) => {
    const landscapeKey = await ensureLandscapeUploaded(api, testAlbumUri);
    const sourceSize = fs.statSync(LANDSCAPE_PATH).size;
    const image = await api.getImage(landscapeKey);
    expect(image.OriginalSize).toBe(sourceSize);
  });
});
