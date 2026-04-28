/**
 * Image comparison and quality analysis utilities.
 *
 * Provides:
 *   - SSIM (Structural Similarity Index) comparison
 *   - Pixel sampling at known coordinates
 *   - Delta-E color difference calculation (CIE76)
 *   - Dimension and aspect ratio verification
 *   - Laplacian variance (sharpness) measurement
 *   - MD5 hash comparison
 *   - Watermark detection (diff-based)
 *
 * All functions accept Buffers (from API downloads) so they integrate
 * directly with SmugMugAPI.downloadBuffer().
 *
 * Dependencies: sharp, pixelmatch, pngjs
 */

import sharp from 'sharp';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PixelSample {
  x: number;
  y: number;
  expected: RGB;
  actual: RGB;
  deltaE: number;
}

export interface SSIMResult {
  score: number; // 0.0–1.0, where 1.0 = identical
  passed: boolean;
}

export interface SharpnessResult {
  laplacianVariance: number;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Dimensions & Aspect Ratio
// ---------------------------------------------------------------------------

/** Get pixel dimensions from an image buffer. */
export async function getDimensions(imageBuffer: Buffer): Promise<ImageDimensions> {
  const metadata = await sharp(imageBuffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}

/** Check whether two dimensions share the same aspect ratio within tolerance. */
export function aspectRatiosMatch(
  a: ImageDimensions,
  b: ImageDimensions,
  tolerance = 0.01,
): boolean {
  const ratioA = a.width / a.height;
  const ratioB = b.width / b.height;
  return Math.abs(ratioA - ratioB) <= tolerance;
}

/** Verify that the longest edge does not exceed a maximum. */
export function longestEdgeWithin(dims: ImageDimensions, maxEdge: number): boolean {
  return Math.max(dims.width, dims.height) <= maxEdge;
}

// ---------------------------------------------------------------------------
// MD5 Hashing
// ---------------------------------------------------------------------------

/** Compute MD5 hash of a buffer, returned as hex string. */
export function md5Hex(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/** Compute MD5 hash of a buffer, returned as base64 string (matches SmugMug's ArchivedMD5). */
export function md5Base64(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('base64');
}

// ---------------------------------------------------------------------------
// Pixel Sampling & Color
// ---------------------------------------------------------------------------

/**
 * Sample pixel RGB value at a given (x, y) coordinate.
 * Coordinates are 0-indexed from top-left.
 */
export async function samplePixel(imageBuffer: Buffer, x: number, y: number): Promise<RGB> {
  const { data, info } = await sharp(imageBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const idx = (y * info.width + x) * channels;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
}

/**
 * Sample multiple pixels and compare against expected values.
 * Returns per-pixel Delta-E results.
 */
export async function sampleAndCompare(
  imageBuffer: Buffer,
  referencePoints: Array<{ x: number; y: number; expected: RGB }>,
): Promise<PixelSample[]> {
  const results: PixelSample[] = [];
  for (const point of referencePoints) {
    const actual = await samplePixel(imageBuffer, point.x, point.y);
    const deltaE = calculateDeltaE(point.expected, actual);
    results.push({ ...point, actual, deltaE });
  }
  return results;
}

/**
 * CIE76 Delta-E color difference.
 * Values < 1: imperceptible, 1–3: barely perceptible, 3–10: noticeable, >10: large.
 *
 * NOTE: This is a simplified sRGB approximation. For production-grade tests,
 * consider converting to CIELAB first using a proper color library.
 */
export function calculateDeltaE(a: RGB, b: RGB): number {
  // Convert sRGB to approximate Lab-like values for a rough Delta-E
  // For a simple implementation, use Euclidean distance in sRGB space
  // weighted by perceptual importance. For strict accuracy, integrate
  // a proper sRGB→Lab conversion.
  const dR = a.r - b.r;
  const dG = a.g - b.g;
  const dB = a.b - b.b;

  // Perceptual weighting (rough approximation)
  const rmean = (a.r + b.r) / 2;
  const weightR = 2 + rmean / 256;
  const weightG = 4.0;
  const weightB = 2 + (255 - rmean) / 256;

  return Math.sqrt(weightR * dR * dR + weightG * dG * dG + weightB * dB * dB);
}

/** Check that all pixel samples have Delta-E below a threshold. */
export function allSamplesWithinThreshold(samples: PixelSample[], maxDeltaE: number): boolean {
  return samples.every((s) => s.deltaE <= maxDeltaE);
}

// ---------------------------------------------------------------------------
// SSIM (Structural Similarity)
// ---------------------------------------------------------------------------

/**
 * Compute a simplified SSIM-like score between two image buffers.
 *
 * Both images are resized to the same dimensions (the smaller of the two)
 * and converted to grayscale before comparison.
 *
 * Returns a score from 0.0 to 1.0.
 */
export async function computeSSIM(
  bufferA: Buffer,
  bufferB: Buffer,
  threshold = 0.95,
): Promise<SSIMResult> {
  // Normalize both to same dimensions
  const metaA = await sharp(bufferA).metadata();
  const metaB = await sharp(bufferB).metadata();
  const w = Math.min(metaA.width || 100, metaB.width || 100);
  const h = Math.min(metaA.height || 100, metaB.height || 100);

  const grayA = await sharp(bufferA).resize(w, h, { fit: 'fill' }).grayscale().raw().toBuffer();
  const grayB = await sharp(bufferB).resize(w, h, { fit: 'fill' }).grayscale().raw().toBuffer();

  // Compute mean
  let sumA = 0, sumB = 0;
  const n = grayA.length;
  for (let i = 0; i < n; i++) {
    sumA += grayA[i];
    sumB += grayB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  // Compute variance and covariance
  let varA = 0, varB = 0, covAB = 0;
  for (let i = 0; i < n; i++) {
    const dA = grayA[i] - meanA;
    const dB = grayB[i] - meanB;
    varA += dA * dA;
    varB += dB * dB;
    covAB += dA * dB;
  }
  varA /= n;
  varB /= n;
  covAB /= n;

  // SSIM formula constants
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;

  const numerator = (2 * meanA * meanB + C1) * (2 * covAB + C2);
  const denominator = (meanA ** 2 + meanB ** 2 + C1) * (varA + varB + C2);
  const score = numerator / denominator;

  return { score, passed: score >= threshold };
}

// ---------------------------------------------------------------------------
// Sharpness (Laplacian Variance)
// ---------------------------------------------------------------------------

/**
 * Estimate image sharpness using Laplacian variance.
 * Higher values = sharper image. Typical thresholds: >100 for sharp images.
 */
export async function measureSharpness(
  imageBuffer: Buffer,
  minVariance = 100,
): Promise<SharpnessResult> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  const grayData = await sharp(imageBuffer).grayscale().raw().toBuffer();

  // Apply 3×3 Laplacian kernel: [0,1,0; 1,-4,1; 0,1,0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const center = grayData[y * w + x];
      const top = grayData[(y - 1) * w + x];
      const bottom = grayData[(y + 1) * w + x];
      const left = grayData[y * w + (x - 1)];
      const right = grayData[y * w + (x + 1)];
      const laplacian = top + bottom + left + right - 4 * center;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  return { laplacianVariance: variance, passed: variance >= minVariance };
}

// ---------------------------------------------------------------------------
// Watermark Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a watermark is present by comparing a potentially-watermarked
 * image against a known unwatermarked version.
 *
 * Returns the percentage of pixels that differ beyond a threshold.
 * If diffPercentage > minDiffPercent, a watermark is likely present.
 */
export async function detectWatermarkDiff(
  watermarkedBuffer: Buffer,
  cleanBuffer: Buffer,
  pixelDiffThreshold = 30,
  minDiffPercent = 1.0,
): Promise<{ diffPercent: number; hasWatermark: boolean }> {
  const meta = await sharp(cleanBuffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  const rawClean = await sharp(cleanBuffer).resize(w, h, { fit: 'fill' }).raw().toBuffer();
  const rawMarked = await sharp(watermarkedBuffer)
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer();

  const channels = 3;
  let diffPixels = 0;
  const totalPixels = w * h;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * channels;
    const dR = Math.abs(rawClean[idx] - rawMarked[idx]);
    const dG = Math.abs(rawClean[idx + 1] - rawMarked[idx + 1]);
    const dB = Math.abs(rawClean[idx + 2] - rawMarked[idx + 2]);
    if (dR > pixelDiffThreshold || dG > pixelDiffThreshold || dB > pixelDiffThreshold) {
      diffPixels++;
    }
  }

  const diffPercent = (diffPixels / totalPixels) * 100;
  return { diffPercent, hasWatermark: diffPercent >= minDiffPercent };
}

// ---------------------------------------------------------------------------
// Gradient Smoothness (for banding detection)
// ---------------------------------------------------------------------------

/**
 * Measure gradient smoothness by looking at adjacent pixel differences.
 * A smooth gradient has small, consistent step sizes.
 * Banding produces large step sizes at regular intervals.
 *
 * Returns the standard deviation of adjacent-pixel luminance differences.
 * Lower = smoother. High values suggest banding.
 */
export async function measureGradientSmoothness(
  imageBuffer: Buffer,
): Promise<{ stdDev: number; smooth: boolean }> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 0;
  const gray = await sharp(imageBuffer).grayscale().raw().toBuffer();

  const diffs: number[] = [];

  // Sample horizontal differences across the middle row
  const midY = Math.floor((meta.height || 0) / 2);
  for (let x = 1; x < w; x++) {
    const diff = Math.abs(gray[midY * w + x] - gray[midY * w + x - 1]);
    diffs.push(diff);
  }

  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const variance = diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / diffs.length;
  const stdDev = Math.sqrt(variance);

  // A smooth gradient typically has stdDev < 2. Banding pushes it higher.
  return { stdDev, smooth: stdDev < 3.0 };
}
