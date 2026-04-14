/**
 * MP-01 through MP-14: Metadata Preservation
 *
 * Verifies that SmugMug preserves EXIF, IPTC, and XMP metadata fields
 * after upload. Compares local file EXIF against API !metadata responses.
 *
 * Reference images required in /reference-images/:
 *   - metadata-rich.jpg — JPEG with comprehensive EXIF: Make, Model, exposure,
 *     focal length, GPS, lens, white balance, flash, copyright, artist,
 *     UserComment, DateTimeOriginal, Software
 *   - metadata-iptc.jpg — JPEG with IPTC caption, keywords, and title
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import { readExif, readIPTC } from '../helpers/exif-utils';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Metadata Preservation', () => {
  let imageKey: string;
  let localExif: Awaited<ReturnType<typeof readExif>>;
  let apiMetadata: Record<string, any>;

  test.beforeAll(async ({ browser }) => {
    // This hook uploads the rich-metadata image once and shares it across tests.
    // NOTE: If running tests in isolation, each test should upload its own.
  });

  // Helper: upload and get metadata (called by first test, cached for subsequent)
  async function ensureUploaded(
    api: SmugMugAPI,
    testAlbumUri: string,
    referenceImagesDir: string,
  ) {
    if (imageKey) return;

    const refPath = path.join(referenceImagesDir, 'metadata-rich.jpg');
    localExif = await readExif(refPath);

    const upload = await api.uploadImage(refPath, testAlbumUri, {
      title: 'Metadata Preservation Test',
    });
    imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    apiMetadata = await api.getMetadata(imageKey);
  }

  // -----------------------------------------------------------------------
  // MP-01: Camera make and model
  // -----------------------------------------------------------------------
  test('MP-01: Camera make and model preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    expect(apiMetadata.Make).toBe(localExif.Make);
    expect(apiMetadata.Model).toBe(localExif.Model);
  });

  // -----------------------------------------------------------------------
  // MP-02: Exposure settings
  // -----------------------------------------------------------------------
  test('MP-02: Exposure settings preserved (shutter, aperture, ISO)', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);

    if (localExif.ExposureTime !== undefined) {
      expect(apiMetadata.ExposureTime).toBeCloseTo(localExif.ExposureTime, 5);
    }
    if (localExif.FNumber !== undefined) {
      expect(apiMetadata.FNumber).toBeCloseTo(localExif.FNumber, 2);
    }
    if (localExif.ISO !== undefined) {
      // SmugMug may store as ISOSpeedRatings or ISO
      const apiISO = apiMetadata.ISOSpeedRatings || apiMetadata.ISO;
      expect(apiISO).toBe(localExif.ISO);
    }
  });

  // -----------------------------------------------------------------------
  // MP-03: Focal length
  // -----------------------------------------------------------------------
  test('MP-03: Focal length preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.FocalLength !== undefined) {
      expect(apiMetadata.FocalLength).toBeCloseTo(localExif.FocalLength, 1);
    }
    if (localExif.FocalLengthIn35mmFormat !== undefined) {
      const api35 = apiMetadata.FocalLengthIn35mmFilm || apiMetadata.FocalLengthIn35mmFormat;
      expect(api35).toBe(localExif.FocalLengthIn35mmFormat);
    }
  });

  // -----------------------------------------------------------------------
  // MP-04: DateTimeOriginal
  // -----------------------------------------------------------------------
  test('MP-04: DateTimeOriginal preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    expect(apiMetadata.DateTimeOriginal).toBeDefined();
    // Dates may be formatted differently — compare as strings or timestamps
    const localDate = localExif.DateTimeOriginal
      ? new Date(localExif.DateTimeOriginal).toISOString().slice(0, 19)
      : undefined;
    if (localDate) {
      const apiDate = new Date(apiMetadata.DateTimeOriginal).toISOString().slice(0, 19);
      expect(apiDate).toBe(localDate);
    }
  });

  // -----------------------------------------------------------------------
  // MP-05: GPS coordinates
  // -----------------------------------------------------------------------
  test('MP-05: GPS coordinates preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    const imgData = await api.getImage(imageKey);

    if (localExif.GPSLatitude !== undefined) {
      expect(imgData.Latitude).toBeCloseTo(localExif.GPSLatitude, 4);
    }
    if (localExif.GPSLongitude !== undefined) {
      expect(imgData.Longitude).toBeCloseTo(localExif.GPSLongitude, 4);
    }
    if (localExif.GPSAltitude !== undefined) {
      expect(imgData.Altitude).toBeCloseTo(localExif.GPSAltitude, 1);
    }
  });

  // -----------------------------------------------------------------------
  // MP-06: GPS matches between image endpoint and !metadata
  // -----------------------------------------------------------------------
  test('MP-06: GPS matches between image endpoint and !metadata', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    const imgData = await api.getImage(imageKey);

    if (apiMetadata.GPSLatitude !== undefined) {
      expect(imgData.Latitude).toBeCloseTo(apiMetadata.GPSLatitude, 4);
    }
    if (apiMetadata.GPSLongitude !== undefined) {
      expect(imgData.Longitude).toBeCloseTo(apiMetadata.GPSLongitude, 4);
    }
  });

  // -----------------------------------------------------------------------
  // MP-07: Lens info
  // -----------------------------------------------------------------------
  test('MP-07: Lens info preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.LensModel) {
      const apiLens = apiMetadata.LensModel || apiMetadata.LensInfo;
      expect(apiLens).toBeDefined();
      expect(apiLens).toContain(localExif.LensModel);
    }
  });

  // -----------------------------------------------------------------------
  // MP-08: White balance
  // -----------------------------------------------------------------------
  test('MP-08: White balance preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.WhiteBalance !== undefined) {
      expect(apiMetadata.WhiteBalance).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // MP-09: Flash status
  // -----------------------------------------------------------------------
  test('MP-09: Flash status preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.Flash !== undefined) {
      expect(apiMetadata.Flash).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // MP-10: Copyright field
  // -----------------------------------------------------------------------
  test('MP-10: Copyright field preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.Copyright) {
      expect(apiMetadata.Copyright).toBe(localExif.Copyright);
    }
  });

  // -----------------------------------------------------------------------
  // MP-11: Artist/Author field
  // -----------------------------------------------------------------------
  test('MP-11: Artist/Author field preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.Artist) {
      expect(apiMetadata.Artist).toBe(localExif.Artist);
    }
  });

  // -----------------------------------------------------------------------
  // MP-12: IPTC caption preserved as Caption
  // -----------------------------------------------------------------------
  test('MP-12: IPTC caption preserved as image Caption', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-iptc.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const iptc = await readIPTC(refPath);
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MP-12 IPTC Caption' });
    const key = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imgData = await api.getImage(key);

    if (iptc.caption) {
      expect(imgData.Caption).toBe(iptc.caption);
    }
  });

  // -----------------------------------------------------------------------
  // MP-13: IPTC keywords preserved as Keywords
  // -----------------------------------------------------------------------
  test('MP-13: IPTC keywords preserved as image Keywords', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-iptc.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const iptc = await readIPTC(refPath);
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MP-13 IPTC Keywords' });
    const key = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imgData = await api.getImage(key);

    if (iptc.keywords && iptc.keywords.length > 0) {
      for (const kw of iptc.keywords) {
        expect(imgData.KeywordArray, `Missing keyword: ${kw}`).toContain(kw);
      }
    }
  });

  // -----------------------------------------------------------------------
  // MP-14: UserComment EXIF field
  // -----------------------------------------------------------------------
  test('MP-14: UserComment EXIF field preserved', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    await ensureUploaded(api, testAlbumUri, referenceImagesDir);
    if (localExif.UserComment) {
      expect(apiMetadata.UserComment).toBeDefined();
      expect(apiMetadata.UserComment).toBe(localExif.UserComment);
    }
  });
});
