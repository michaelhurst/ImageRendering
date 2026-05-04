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
 * Architecture:
 *   - ONE folder is created per test run (shared across all workers/tests)
 *   - Each test gets its own album (gallery) inside that single folder
 *   - The folder path is persisted to disk so it survives worker restarts
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
// Run folder persistence
// ---------------------------------------------------------------------------

const RUN_FOLDER_STATE_PATH = path.resolve(
  __dirname,
  "../test-results/.run-folder.json",
);

interface RunFolderState {
  folderPath: string;
  timestamp: string;
  environment: string;
}

function loadRunFolderState(): RunFolderState | null {
  try {
    if (fs.existsSync(RUN_FOLDER_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(RUN_FOLDER_STATE_PATH, "utf8"));
    }
  } catch {}
  return null;
}

function saveRunFolderState(state: RunFolderState): void {
  const dir = path.dirname(RUN_FOLDER_STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RUN_FOLDER_STATE_PATH, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// In-memory caches (shared within a single worker process)
// ---------------------------------------------------------------------------

let _runFolderPath: string | null = null;

// Per-test album cache — keyed by test title
const _albumCache: Map<string, { key: string; uri: string }> = new Map();

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
    // Ensure the single run folder exists
    if (!_runFolderPath) {
      // Check if another worker already created it (persisted to disk)
      const env = process.env.ENVIRONMENT || "inside";
      const saved = loadRunFolderState();
      if (saved && saved.environment === env) {
        _runFolderPath = saved.folderPath;
        console.log(
          `[fixtures] Reusing run folder from disk: ${saved.folderPath}`,
        );
      } else {
        // Create the single run folder for this entire test run
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const folderName = `Test Run ${timestamp}`;
        const { folderPath } = await api.createFolder(testNickname, folderName);
        _runFolderPath = folderPath;
        saveRunFolderState({
          folderPath,
          timestamp,
          environment: env,
        });
        console.log(`[fixtures] Created run folder: ${folderName}`);
      }
    }

    // Create a per-test album inside the shared run folder
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
