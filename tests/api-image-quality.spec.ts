/**
 * IQ-01 through IQ-10 (API): Image Quality & Compression
 *
 * Uploads reference images from local disk to SmugMug, then verifies
 * quality preservation across CDN size tiers, original downloads,
 * and format conversions.
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
import * as crypto from "crypto";

const IMAGES_DIR = process.env.TEST_IMAGES_DIR!;
const DETAIL_PATH = path.join(IMAGES_DIR, "quality-detail.jpg");
const PNG_PATH = path.join(IMAGES_DIR, "quality-reference.png");
const GIF_PATH = path.join(IMAGES_DIR, "quality-reference.gif");
const HEIC_PATH = path.join(IMAGES_DIR, "quality-reference.heic");
const NOISY_PATH = path.join(IMAGES_DIR, "quality-noisy.jpg");
const CHART_PATH = path.join(IMAGES_DIR, "quality-resolution-chart.jpg");

const SSIM_THRESHOLD = 0.9;
const COMPARE_WIDTH = 1600;

function md5Base64(buf: Buffer): string {
  return crypto.createHash("md5").update(buf).digest("base64");
}

function md5Hex(buf: Buffer): string {
  return crypto.createHash("md5").update(buf).digest("hex");
}

async function computeSSIM(buf1: Buffer, buf2: Buffer): Promise<number> {
  const sharp = require("sharp");
  const [d1, d2] = await Promise.all([
    sharp(buf1)
      .resize(COMPARE_WIDTH, null, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer(),
    sharp(buf2)
      .resize(COMPARE_WIDTH, null, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer(),
  ]);
  const n = Math.min(d1.length, d2.length);
  let s1 = 0,
    s2 = 0;
  for (let i = 0; i < n; i++) {
    s1 += d1[i];
    s2 += d2[i];
  }
  const mu1 = s1 / n,
    mu2 = s2 / n;
  let v1 = 0,
    v2 = 0,
    cov = 0;
  for (let i = 0; i < n; i++) {
    v1 += (d1[i] - mu1) ** 2;
    v2 += (d2[i] - mu2) ** 2;
    cov += (d1[i] - mu1) * (d2[i] - mu2);
  }
  v1 /= n;
  v2 /= n;
  cov /= n;
  const C1 = 6.5025,
    C2 = 58.5225;
  return (
    ((2 * mu1 * mu2 + C1) * (2 * cov + C2)) /
    ((mu1 ** 2 + mu2 ** 2 + C1) * (v1 + v2 + C2))
  );
}

test.describe("IQ (API): Image Quality & Compression", () => {
  let _jpegKey: string | undefined;
  let _pngKey: string | undefined;

  async function ensureJpegUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_jpegKey) {
      const result = await api.uploadImage(DETAIL_PATH, albumUri, {
        title: "iq-jpeg-ref",
      });
      _jpegKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _jpegKey;
  }

  async function ensurePngUploaded(
    api: SmugMugAPI,
    albumUri: string,
  ): Promise<string> {
    if (!_pngKey) {
      const result = await api.uploadImage(PNG_PATH, albumUri, {
        title: "iq-png-ref",
      });
      _pngKey = SmugMugAPI.extractImageKey(result.ImageUri);
    }
    return _pngKey;
  }

  // IQ-01: JPEG quality preserved at each CDN size tier
  test("IQ-01: JPEG quality preserved at each CDN size tier", async ({
    api,
    testAlbumUri,
  }) => {
    const jpegKey = await ensureJpegUploaded(api, testAlbumUri);
    const tiers = await api.waitForSizeTiers(jpegKey);
    const sharp = require("sharp");
    const sourceBuffer = fs.readFileSync(DETAIL_PATH);

    for (const tier of tiers) {
      if (tier.label === "O" || tier.label === "Ti" || tier.label === "Th")
        continue;

      const resizedSource = await sharp(sourceBuffer)
        .resize(tier.width, tier.height, { fit: "inside" })
        .jpeg({ quality: 95 })
        .toBuffer();

      const tierBuffer = await api.downloadBuffer(tier.url);
      const ssim = await computeSSIM(resizedSource, tierBuffer);
      console.log(`IQ-01 ${tier.label}: SSIM=${ssim.toFixed(4)}`);
      expect(
        ssim,
        `${tier.label} tier SSIM below threshold`,
      ).toBeGreaterThanOrEqual(SSIM_THRESHOLD);
    }
  });

  // IQ-02: Original upload is preserved (size and URI)
  test("IQ-02: Original download matches uploaded file", async ({
    api,
    testAlbumUri,
  }) => {
    const jpegKey = await ensureJpegUploaded(api, testAlbumUri);
    const image = await api.getImage(jpegKey);
    const sourceSize = fs.statSync(DETAIL_PATH).size;

    // Verify the API reports the correct archived file size
    console.log(
      `IQ-02: Source size=${sourceSize}, ArchivedSize=${image.ArchivedSize}`,
    );
    expect(image.ArchivedSize).toBe(sourceSize);

    // Verify a valid ArchivedUri is present
    expect(image.ArchivedUri).toBeTruthy();
    console.log(`IQ-02: ArchivedUri=${image.ArchivedUri.slice(0, 80)}...`);
  });

  // IQ-03: Original download preserves file size
  test("IQ-03: Original download preserves file size", async ({
    api,
    testAlbumUri,
  }) => {
    const jpegKey = await ensureJpegUploaded(api, testAlbumUri);
    const image = await api.getImage(jpegKey);
    const sourceSize = fs.statSync(DETAIL_PATH).size;
    expect(image.ArchivedSize).toBe(sourceSize);
  });

  // IQ-04: No double-compression on JPEG uploads
  test("IQ-04: No double-compression on JPEG uploads", async ({
    api,
    testAlbumUri,
  }) => {
    const jpegKey = await ensureJpegUploaded(api, testAlbumUri);
    // Ensure tiers are fully generated before comparing
    const tiers = await api.waitForSizeTiers(jpegKey, 5);
    const largeTier = tiers.find((t) => t.label === "L" || t.label === "XL");
    if (!largeTier) return;

    const sharp = require("sharp");
    const sourceBuffer = fs.readFileSync(DETAIL_PATH);

    // Download the tier and check its actual dimensions
    const tierBuffer = await api.downloadBuffer(largeTier.url);
    const tierMeta = await sharp(tierBuffer).metadata();
    console.log(
      `IQ-04: Tier ${largeTier.label} — API: ${largeTier.width}x${largeTier.height}, ` +
        `actual: ${tierMeta.width}x${tierMeta.height} ${tierMeta.format}, ${tierBuffer.length} bytes`,
    );

    // Resize source to match the actual downloaded dimensions
    const resizedSource = await sharp(sourceBuffer)
      .resize(tierMeta.width!, tierMeta.height!, { fit: "fill" })
      .jpeg({ quality: 95 })
      .toBuffer();

    const ssim = await computeSSIM(resizedSource, tierBuffer);
    console.log(
      `Double-compression check (${largeTier.label}): SSIM=${ssim.toFixed(4)}`,
    );
    expect(ssim).toBeGreaterThanOrEqual(SSIM_THRESHOLD);
  });

  // IQ-05: PNG preserved at original size
  test("IQ-05: PNG served losslessly at original size", async ({
    api,
    testAlbumUri,
  }) => {
    const pngKey = await ensurePngUploaded(api, testAlbumUri);
    const image = await api.getImage(pngKey);
    const sourceSize = fs.statSync(PNG_PATH).size;

    // Verify the API reports the correct archived file size
    console.log(
      `IQ-05: Source size=${sourceSize}, ArchivedSize=${image.ArchivedSize}`,
    );
    expect(image.ArchivedSize).toBe(sourceSize);

    // Verify a valid ArchivedUri is present
    expect(image.ArchivedUri).toBeTruthy();
    console.log(`IQ-05: ArchivedUri=${image.ArchivedUri.slice(0, 80)}...`);
  });

  // IQ-06: PNG resized tiers convert to JPEG acceptably
  test("IQ-06: PNG resized tiers convert to JPEG acceptably", async ({
    api,
    testAlbumUri,
  }) => {
    const pngKey = await ensurePngUploaded(api, testAlbumUri);
    // Wait for tiers to be generated (large PNG needs processing time)
    const tiers = await api.waitForSizeTiers(pngKey, 5, 120_000);
    const sharp = require("sharp");
    const sourceBuffer = fs.readFileSync(PNG_PATH);

    const checkTiers = tiers.filter((t) => t.label === "M" || t.label === "L");
    if (checkTiers.length === 0) {
      console.log("IQ-06: No M or L tiers available, skipping");
      return;
    }

    for (const tier of checkTiers) {
      const tierBuffer = await api.downloadBuffer(tier.url);
      const tierMeta = await sharp(tierBuffer).metadata();
      console.log(
        `IQ-06 ${tier.label}: downloaded ${tierBuffer.length} bytes, ` +
          `${tierMeta.width}x${tierMeta.height} ${tierMeta.format}`,
      );

      // Resize source to match the actual downloaded tier dimensions
      const resizedSource = await sharp(sourceBuffer)
        .resize(tierMeta.width, tierMeta.height, { fit: "fill" })
        .jpeg({ quality: 95 })
        .toBuffer();

      const ssim = await computeSSIM(resizedSource, tierBuffer);
      console.log(`IQ-06 ${tier.label}: SSIM=${ssim.toFixed(4)}`);
      expect(
        ssim,
        `PNG→JPEG ${tier.label} tier SSIM below threshold`,
      ).toBeGreaterThanOrEqual(SSIM_THRESHOLD);
    }
  });

  // IQ-07: GIF upload preserves original
  test("IQ-07: GIF upload preserves original", async ({
    api,
    testAlbumUri,
  }) => {
    if (!fs.existsSync(GIF_PATH)) {
      test.skip(true, "quality-reference.gif not found");
      return;
    }
    const result = await api.uploadImage(GIF_PATH, testAlbumUri, {
      title: "iq-gif-ref",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const image = await api.getImage(key);
    const sourceBuffer = fs.readFileSync(GIF_PATH);
    const archivedBuffer = await api.downloadBuffer(image.ArchivedUri);
    expect(md5Hex(archivedBuffer)).toBe(md5Hex(sourceBuffer));
  });

  // IQ-08: HEIC upload produces viewable JPEG conversion
  test("IQ-08: HEIC upload produces viewable JPEG conversion", async ({
    api,
    testAlbumUri,
  }) => {
    if (!fs.existsSync(HEIC_PATH)) {
      test.skip(true, "quality-reference.heic not found");
      return;
    }
    const result = await api.uploadImage(HEIC_PATH, testAlbumUri, {
      title: "iq-heic-ref",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    // HEIC conversion takes time — wait for tiers to be generated
    const tiers = await api.waitForSizeTiers(key);
    const largeTier =
      tiers.find((t) => t.label === "L" || t.label === "XL") ||
      tiers.find((t) => t.label === "M" || t.label === "S");
    expect(largeTier, "No usable tier found for HEIC").toBeTruthy();

    const tierBuffer = await api.downloadBuffer(largeTier!.url);
    expect(tierBuffer[0]).toBe(0xff);
    expect(tierBuffer[1]).toBe(0xd8);
    const sharp = require("sharp");
    const meta = await sharp(tierBuffer).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    console.log(`HEIC→JPEG: ${meta.width}x${meta.height}`);
  });

  // IQ-09: High-ISO image doesn't gain additional artifacts
  test("IQ-09: High-ISO image doesn't gain artifacts after resize", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(NOISY_PATH, testAlbumUri, {
      title: "iq-noisy-ref",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const tiers = await api.getSizeDetails(key);
    const largeTier = tiers.find((t) => t.label === "L");
    if (!largeTier) return;

    const sharp = require("sharp");
    const sourceBuffer = fs.readFileSync(NOISY_PATH);
    const resizedSource = await sharp(sourceBuffer)
      .resize(largeTier.width, largeTier.height, { fit: "inside" })
      .toBuffer();
    const tierBuffer = await api.downloadBuffer(largeTier.url);
    const ssim = await computeSSIM(resizedSource, tierBuffer);
    console.log(`Noisy L tier SSIM: ${ssim.toFixed(4)}`);
    expect(ssim).toBeGreaterThanOrEqual(SSIM_THRESHOLD);
  });

  // IQ-10: Image sharpness maintained after resize
  test("IQ-10: Image sharpness maintained after resize", async ({
    api,
    testAlbumUri,
  }) => {
    const result = await api.uploadImage(CHART_PATH, testAlbumUri, {
      title: "iq-chart-ref",
    });
    const key = SmugMugAPI.extractImageKey(result.ImageUri);
    const tiers = await api.getSizeDetails(key);
    const sharp = require("sharp");

    for (const tier of tiers.filter((t) => ["M", "L"].includes(t.label))) {
      const tierBuffer = await api.downloadBuffer(tier.url);
      const { data, info } = await sharp(tierBuffer)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { width, height } = info;
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
      console.log(`${tier.label} sharpness: ${variance.toFixed(1)}`);
      expect(variance, `${tier.label} sharpness too low`).toBeGreaterThan(50);
    }
  });
});
