/**
 * Shared Playwright test fixtures for image display tests.
 *
 * Extends the base Playwright test with:
 *   - `api`: A SmugMugAPI instance authenticated via browser session
 *   - `imageCompare`: Quick access to image-comparison helpers
 *   - `testAlbumKey`: The album key for uploading test images
 *   - `testNickname`: The test account nickname (`automated-render-testing`)
 *   - `baselineGalleryUrl`: The SmugMug gallery URL for baseline images (environment-aware)
 *
 * Usage in test files:
 *   import { test, expect } from '../helpers/test-fixtures';
 *
 *   test('my test', async ({ api, imageCompare }) => {
 *     const image = await api.getImage('abc123');
 *     // ...
 *   });
 */

import { test as base, expect } from "@playwright/test";
import { SmugMugAPI } from "./smugmug-api";
import { loginAndSaveState, getAuthStatePath } from "./auth";
import * as imageCompare from "./image-comparison";
import * as exifUtils from "./exif-utils";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Baseline gallery URLs per environment
// ---------------------------------------------------------------------------

const BASELINE_GALLERY_URLS: Record<string, string> = {
  production: "https://automated-render-testing.smugmug.com/Baseline-Images",
  inside: "https://automated-render-testing.inside.smugmug.net/Baseline-Images",
};

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
  baselineGalleryUrl: string;
  referenceImagesDir: string;
};

// ---------------------------------------------------------------------------
// Shared run folder — created once per worker, reused across all test files
// ---------------------------------------------------------------------------

let _runFolderPath: string | null = null;
let _runTimestamp: string | null = null;

// Per-spec-file album cache — keyed by test file path
const _albumCache: Map<string, { key: string; uri: string }> = new Map();

// ---------------------------------------------------------------------------
// Extended test with fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<ImageDisplayFixtures>({
  api: async ({ page }, use) => {
    // Log in if we don't have a saved session
    const authStatePath = getAuthStatePath();
    if (!fs.existsSync(authStatePath)) {
      console.log("[auth] No saved session found — logging in...");
      await loginAndSaveState(page);
      console.log("[auth] Login complete, session saved.");
    } else {
      // Restore saved session cookies
      const state = JSON.parse(fs.readFileSync(authStatePath, "utf8"));
      if (state.cookies?.length) {
        await page.context().addCookies(state.cookies);
        console.log("[auth] Restored saved session.");
      }
    }
    const api = new SmugMugAPI(page);
    await use(api);
  },

  imageCompare: async ({}, use) => {
    await use(imageCompare);
  },

  exifUtils: async ({}, use) => {
    await use(exifUtils);
  },

  testAlbumKey: async ({ api, testNickname }, use, testInfo) => {
    // Create the run folder once per worker
    if (!_runFolderPath) {
      _runTimestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const folderName = `Test Run ${_runTimestamp}`;
      const { folderPath } = await api.createFolder(testNickname, folderName);
      _runFolderPath = folderPath;
      console.log(`[fixtures] Created run folder: ${folderName}`);
    }

    // Create a per-test album inside the run folder, named after the test
    const testTitle = testInfo.title;
    const cached = _albumCache.get(testTitle);
    if (cached) {
      await use(cached.key);
      return;
    }

    const { albumKey, albumUri } = await api.createAlbumInFolder(
      _runFolderPath,
      testTitle,
    );
    _albumCache.set(testTitle, { key: albumKey, uri: albumUri });
    console.log(`[fixtures] Created album: ${testTitle} (key: ${albumKey})`);
    await use(albumKey);
  },

  testAlbumUri: async ({ testAlbumKey }, use, testInfo) => {
    const cached = _albumCache.get(testInfo.title);
    await use(cached?.uri || `/api/v2/album/${testAlbumKey}`);
  },

  testNickname: async ({}, use) => {
    await use("automated-render-testing");
  },

  baselineGalleryUrl: async ({}, use) => {
    const env = process.env.ENVIRONMENT || "inside";
    const url = BASELINE_GALLERY_URLS[env];
    if (!url)
      throw new Error(
        `No baseline gallery URL configured for ENVIRONMENT="${env}"`,
      );
    await use(url);
  },

  referenceImagesDir: async ({}, use) => {
    await use(path.resolve(__dirname, "../reference-images"));
  },
});

export { expect };
