/**
 * EXIF and metadata utilities for test automation.
 *
 * Provides:
 *   - Read EXIF from local files (for reference comparisons)
 *   - Orientation tag interpretation
 *   - Expected dimension calculation after orientation correction
 *   - ICC profile detection
 *
 * Dependencies: exifr, sharp
 */

import exifr from 'exifr';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExifData {
  Make?: string;
  Model?: string;
  ExposureTime?: number;
  FNumber?: number;
  ISO?: number;
  FocalLength?: number;
  FocalLengthIn35mmFormat?: number;
  DateTimeOriginal?: string | Date;
  GPSLatitude?: number;
  GPSLongitude?: number;
  GPSAltitude?: number;
  LensModel?: string;
  WhiteBalance?: number | string;
  Flash?: number | string;
  Copyright?: string;
  Artist?: string;
  Software?: string;
  Orientation?: number;
  ImageDescription?: string;
  UserComment?: string;
}

export interface OrientationInfo {
  tag: number;
  description: string;
  /** Whether width and height swap after correction */
  swapsDimensions: boolean;
  /** Whether the image is mirrored */
  mirrored: boolean;
  /** Rotation in degrees CW to correct */
  rotationCW: number;
}

// ---------------------------------------------------------------------------
// Orientation lookup
// ---------------------------------------------------------------------------

const ORIENTATIONS: Record<number, OrientationInfo> = {
  1: { tag: 1, description: 'Normal', swapsDimensions: false, mirrored: false, rotationCW: 0 },
  2: { tag: 2, description: 'Mirrored horizontal', swapsDimensions: false, mirrored: true, rotationCW: 0 },
  3: { tag: 3, description: 'Rotated 180°', swapsDimensions: false, mirrored: false, rotationCW: 180 },
  4: { tag: 4, description: 'Mirrored vertical', swapsDimensions: false, mirrored: true, rotationCW: 180 },
  5: { tag: 5, description: 'Mirrored + 90° CW', swapsDimensions: true, mirrored: true, rotationCW: 90 },
  6: { tag: 6, description: 'Rotated 90° CW', swapsDimensions: true, mirrored: false, rotationCW: 90 },
  7: { tag: 7, description: 'Mirrored + 90° CCW', swapsDimensions: true, mirrored: true, rotationCW: 270 },
  8: { tag: 8, description: 'Rotated 90° CCW', swapsDimensions: true, mirrored: false, rotationCW: 270 },
};

/** Get orientation info for a given EXIF orientation tag (1–8). */
export function getOrientationInfo(tag: number): OrientationInfo {
  return ORIENTATIONS[tag] || ORIENTATIONS[1];
}

/**
 * Given raw pixel dimensions and an EXIF orientation tag,
 * return the expected display dimensions after correction.
 */
export function correctedDimensions(
  rawWidth: number,
  rawHeight: number,
  orientationTag: number,
): { width: number; height: number } {
  const info = getOrientationInfo(orientationTag);
  if (info.swapsDimensions) {
    return { width: rawHeight, height: rawWidth };
  }
  return { width: rawWidth, height: rawHeight };
}

// ---------------------------------------------------------------------------
// EXIF reading (from local reference files)
// ---------------------------------------------------------------------------

/** Read EXIF data from a local file. Returns normalized fields. */
export async function readExif(filePath: string): Promise<ExifData> {
  const data = await exifr.parse(filePath, {
    // Request all standard tags
    tiff: true,
    exif: true,
    gps: true,
    icc: true,
    iptc: true,
    xmp: true,
  });

  if (!data) return {};

  return {
    Make: data.Make,
    Model: data.Model,
    ExposureTime: data.ExposureTime,
    FNumber: data.FNumber,
    ISO: data.ISO,
    FocalLength: data.FocalLength,
    FocalLengthIn35mmFormat: data.FocalLengthIn35mmFormat,
    DateTimeOriginal: data.DateTimeOriginal,
    GPSLatitude: data.latitude,
    GPSLongitude: data.longitude,
    GPSAltitude: data.GPSAltitude,
    LensModel: data.LensModel,
    WhiteBalance: data.WhiteBalance,
    Flash: data.Flash,
    Copyright: data.Copyright,
    Artist: data.Artist,
    Software: data.Software,
    Orientation: data.Orientation,
    ImageDescription: data.ImageDescription,
    UserComment: data.UserComment,
  };
}

/** Read EXIF from a Buffer (e.g., from an API download). */
export async function readExifFromBuffer(buffer: Buffer): Promise<ExifData> {
  const data = await exifr.parse(buffer, {
    tiff: true,
    exif: true,
    gps: true,
    iptc: true,
    xmp: true,
  });

  if (!data) return {};

  return {
    Make: data.Make,
    Model: data.Model,
    ExposureTime: data.ExposureTime,
    FNumber: data.FNumber,
    ISO: data.ISO,
    FocalLength: data.FocalLength,
    FocalLengthIn35mmFormat: data.FocalLengthIn35mmFormat,
    DateTimeOriginal: data.DateTimeOriginal,
    GPSLatitude: data.latitude,
    GPSLongitude: data.longitude,
    GPSAltitude: data.GPSAltitude,
    LensModel: data.LensModel,
    WhiteBalance: data.WhiteBalance,
    Flash: data.Flash,
    Copyright: data.Copyright,
    Artist: data.Artist,
    Software: data.Software,
    Orientation: data.Orientation,
  };
}

// ---------------------------------------------------------------------------
// ICC Profile detection
// ---------------------------------------------------------------------------

/** Detect the ICC profile name embedded in an image. Returns null if none. */
export async function getICCProfileName(buffer: Buffer): Promise<string | null> {
  const metadata = await sharp(buffer).metadata();
  if (metadata.icc) {
    // The ICC profile buffer contains the profile name near the start
    const iccBuffer = metadata.icc;
    // Profile description tag is at offset 128+
    // For a simple approach, just check if an ICC profile exists
    return metadata.space || 'unknown';
  }
  return null;
}

/** Check if an image is in sRGB color space. */
export async function isSRGB(buffer: Buffer): Promise<boolean> {
  const metadata = await sharp(buffer).metadata();
  return metadata.space === 'srgb';
}

// ---------------------------------------------------------------------------
// IPTC reading
// ---------------------------------------------------------------------------

/** Read IPTC data from a local file. */
export async function readIPTC(
  filePath: string,
): Promise<{ caption?: string; keywords?: string[]; title?: string }> {
  const data = await exifr.parse(filePath, { iptc: true });
  if (!data) return {};

  return {
    caption: data.Caption || data['Caption-Abstract'],
    keywords: data.Keywords ? (Array.isArray(data.Keywords) ? data.Keywords : [data.Keywords]) : undefined,
    title: data.ObjectName || data.Headline,
  };
}

// ---------------------------------------------------------------------------
// XMP Regions (face/object detection boxes)
// ---------------------------------------------------------------------------

/** Read XMP face regions from a file. Returns array of region descriptors. */
export async function readXMPRegions(
  filePath: string,
): Promise<Array<{ name?: string; x: number; y: number; w: number; h: number }>> {
  const data = await exifr.parse(filePath, { xmp: true });
  if (!data || !data.RegionList) return [];

  // XMP region format varies; normalize to a common shape
  const regions = Array.isArray(data.RegionList) ? data.RegionList : [data.RegionList];
  return regions.map((r: any) => ({
    name: r.Name || r.PersonDisplayName,
    x: parseFloat(r.Area?.X || r.X || 0),
    y: parseFloat(r.Area?.Y || r.Y || 0),
    w: parseFloat(r.Area?.W || r.W || 0),
    h: parseFloat(r.Area?.H || r.H || 0),
  }));
}
