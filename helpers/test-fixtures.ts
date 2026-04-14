/**
 * Shared Playwright test fixtures for image display tests.
 *
 * Extends the base Playwright test with:
 *   - `api`: A SmugMugAPI instance authenticated via browser session
 *   - `imageCompare`: Quick access to image-comparison helpers
 *   - `testAlbumKey`: The album key for uploading test images
 *   - `testNickname`: The test account nickname
 *
 * Usage in test files:
 *   import { test, expect } from '../helpers/test-fixtures';
 *
 *   test('my test', async ({ api, imageCompare }) => {
 *     const image = await api.getImage('abc123');
 *     // ...
 *   });
 */

import { test as base, expect } from '@playwright/test';
import { SmugMugAPI } from './smugmug-api';
import * as imageCompare from './image-comparison';
import * as exifUtils from './exif-utils';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Custom fixture types
// ---------------------------------------------------------------------------

type ImageDisplayFixtures = {
  api: SmugMugAPI;
  imageCompare: typeof imageCompare;
  exifUtils: typeof exifUtils;
  testAlbumKey: string;
  testAlbumUri: string;
  testNickname: string;
  referenceImagesDir: string;
};

// ---------------------------------------------------------------------------
// Extended test with fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<ImageDisplayFixtures>({
  api: async ({ page }, use) => {
    const api = new SmugMugAPI(page);
    await use(api);
  },

  imageCompare: async ({}, use) => {
    await use(imageCompare);
  },

  exifUtils: async ({}, use) => {
    await use(exifUtils);
  },

  testAlbumKey: async ({}, use) => {
    const key = process.env.TEST_ALBUM_KEY;
    if (!key) throw new Error('TEST_ALBUM_KEY must be set in .env');
    await use(key);
  },

  testAlbumUri: async ({ testAlbumKey }, use) => {
    await use(`/api/v2/album/${testAlbumKey}`);
  },

  testNickname: async ({}, use) => {
    await use(process.env.TEST_NICKNAME || 'qa-pro');
  },

  referenceImagesDir: async ({}, use) => {
    await use(path.resolve(__dirname, '../reference-images'));
  },
});

export { expect };
