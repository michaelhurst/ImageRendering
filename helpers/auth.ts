/**
 * SmugMug authentication helpers for Playwright tests.
 *
 * Handles:
 *   - Cookie consent banner dismissal
 *   - Login via email/password form
 *   - Session reuse via storage state
 */

import { type Page, type BrowserContext } from '@playwright/test';
import * as path from 'path';

const AUTH_STATE_PATH = path.resolve(__dirname, '../fixtures/auth-state.json');

/**
 * Log into SmugMug and save the session state for reuse.
 * Call this once in a globalSetup or beforeAll block.
 */
export async function loginAndSaveState(page: Page): Promise<void> {
  const baseUrl =
    process.env.ENVIRONMENT === 'production'
      ? 'https://www.smugmug.com'
      : 'https://inside.smugmug.net';

  // Step 1: Hit the base URL to trigger cookie consent
  await page.goto(baseUrl);
  const allowButton = page.getByRole('button', { name: /allow/i });
  if (await allowButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allowButton.click();
  }

  // Step 2: Navigate to login
  await page.goto(`${baseUrl}/auth/login`);

  // Step 3: Fill credentials
  const username = process.env.SMUGMUG_QA_USERNAME;
  const password = process.env.SMUGMUG_QA_PASSWORD;
  if (!username || !password) {
    throw new Error('SMUGMUG_QA_USERNAME and SMUGMUG_QA_PASSWORD must be set in .env');
  }

  await page.getByLabel(/email/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();

  // Step 4: Wait for post-login landing page
  await page.waitForURL(/\/(app\/dashboard|app\/organize)/, { timeout: 30_000 });

  // Step 5: Save session state
  await page.context().storageState({ path: AUTH_STATE_PATH });
}

/** Get the path to the saved auth state file. */
export function getAuthStatePath(): string {
  return AUTH_STATE_PATH;
}

/**
 * Apply saved auth state to a browser context.
 * Use this in test fixtures or beforeEach blocks.
 */
export async function applyAuthState(context: BrowserContext): Promise<void> {
  await context.addCookies(
    require(AUTH_STATE_PATH).cookies || [],
  );
}
