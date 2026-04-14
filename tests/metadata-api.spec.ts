/**
 * MA-01 through MA-07: Metadata API Accuracy
 *
 * Verifies that the SmugMug API accurately returns metadata fields,
 * handles edge cases (stripped EXIF), and supports round-trip writes.
 *
 * Reference images required in /reference-images/:
 *   - metadata-rich.jpg      — Rich EXIF content
 *   - metadata-stripped.jpg   — All EXIF removed
 *   - metadata-xmp-regions.jpg — Contains XMP face regions
 */

import { test, expect } from '../helpers/test-fixtures';
import { SmugMugAPI } from '../helpers/smugmug-api';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Metadata API Accuracy', () => {
  // -----------------------------------------------------------------------
  // MA-01: !metadata returns key EXIF fields
  // -----------------------------------------------------------------------
  test('MA-01: !metadata returns superset of key EXIF fields', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-rich.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MA-01 EXIF Fields' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const metadata = await api.getMetadata(imageKey);

    // Verify all expected fields are present
    const requiredFields = [
      'Make', 'Model', 'ExposureTime', 'FNumber',
      'FocalLength', 'DateTimeOriginal',
    ];
    for (const field of requiredFields) {
      expect(metadata[field], `Missing metadata field: ${field}`).toBeDefined();
    }

    // ISO might be stored under different keys
    const hasISO = metadata.ISOSpeedRatings !== undefined || metadata.ISO !== undefined;
    expect(hasISO, 'Missing ISO field (ISOSpeedRatings or ISO)').toBe(true);
  });

  // -----------------------------------------------------------------------
  // MA-02: !metadata for stripped image returns minimal set
  // -----------------------------------------------------------------------
  test('MA-02: !metadata for stripped image returns empty/minimal set', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-stripped.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MA-02 Stripped' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    // Should not throw — just return empty/minimal data
    const metadata = await api.getMetadata(imageKey);
    expect(metadata).toBeDefined();

    // Camera fields should be absent
    expect(metadata.Make).toBeUndefined();
    expect(metadata.Model).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // MA-03: Format field matches actual file format
  // -----------------------------------------------------------------------
  test('MA-03: Format field matches uploaded file format', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const testCases = [
      { file: 'metadata-rich.jpg', expected: 'JPG' },
      { file: 'quality-reference.png', expected: 'PNG' },
      { file: 'quality-reference.gif', expected: 'GIF' },
    ];

    for (const tc of testCases) {
      const refPath = path.join(referenceImagesDir, tc.file);
      if (!fs.existsSync(refPath)) continue;

      const upload = await api.uploadImage(refPath, testAlbumUri, { title: `MA-03 ${tc.expected}` });
      const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
      const imageData = await api.getImage(imageKey);

      expect(
        imageData.Format.toUpperCase(),
        `${tc.file} format mismatch`,
      ).toBe(tc.expected.toUpperCase());
    }
  });

  // -----------------------------------------------------------------------
  // MA-04: FileName preserves original filename
  // -----------------------------------------------------------------------
  test('MA-04: FileName preserves original filename', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-rich.jpg');
    const expectedName = 'metadata-rich.jpg';

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MA-04 FileName' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const imageData = await api.getImage(imageKey);

    expect(imageData.FileName).toBe(expectedName);
  });

  // -----------------------------------------------------------------------
  // MA-05: KeywordArray round-trips correctly
  // -----------------------------------------------------------------------
  test('MA-05: KeywordArray round-trips correctly', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-rich.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MA-05 Keywords' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    const keywords = ['sunset', 'ocean', 'HDR'];
    await api.patch(`/api/v2/image/${imageKey}-0`, { KeywordArray: keywords });

    const updated = await api.getImage(imageKey);
    expect(updated.KeywordArray).toEqual(keywords);
  });

  // -----------------------------------------------------------------------
  // MA-06: Title/Caption round-trip with special characters
  // -----------------------------------------------------------------------
  test('MA-06: Title and Caption round-trip with special characters', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-rich.jpg');
    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MA-06 Special Chars' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);

    const title = "André's — \"Best\" Photo ñ 日本語";
    const caption = "A caption with <em>HTML</em>, ampersand & symbols, and emoji 📸";

    await api.patch(`/api/v2/image/${imageKey}-0`, { Title: title, Caption: caption });

    const updated = await api.getImage(imageKey);
    expect(updated.Title).toBe(title);
    expect(updated.Caption).toBe(caption);
  });

  // -----------------------------------------------------------------------
  // MA-07: !regions returns face/object regions
  // -----------------------------------------------------------------------
  test('MA-07: !regions returns face/object regions when present', async ({
    api, testAlbumUri, referenceImagesDir,
  }) => {
    const refPath = path.join(referenceImagesDir, 'metadata-xmp-regions.jpg');
    if (!fs.existsSync(refPath)) { test.skip(); return; }

    const upload = await api.uploadImage(refPath, testAlbumUri, { title: 'MA-07 Regions' });
    const imageKey = SmugMugAPI.extractImageKey(upload.ImageUri);
    const regions = await api.getRegions(imageKey);

    expect(regions.length).toBeGreaterThan(0);
    // Each region should have coordinate data
    for (const region of regions) {
      expect(region).toHaveProperty('X');
      expect(region).toHaveProperty('Y');
    }
  });
});
