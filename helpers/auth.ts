/**
 * SmugMug authentication helpers for Playwright tests.
 *
 * Handles:
 *   - Cookie consent banner dismissal
 *   - Login via email/password form
 *   - Session reuse via storage state
 */

import { type Page, type BrowserContext } from "@playwright/test";
import * as path from "path";

const AUTH_STATE_PATH = path.resolve(__dirname, "../fixtures/auth-state.json");

/**
 * Log into SmugMug and save the session state for reuse.
 * Call this once in a globalSetup or beforeAll block.
 */
export async function loginAndSaveState(page: Page): Promise<void> {
  const baseUrl =
    process.env.ENVIRONMENT === "production"
      ? "https://www.smugmug.com"
      : "https://inside.smugmug.net";

  // Step 1: Navigate to login page
  console.log(`[auth] Navigating to ${baseUrl}/login`);
  await page.goto(`${baseUrl}/login`);

  // Step 2: Dismiss cookie consent if present
  const allowButton = page.getByRole("button", { name: /allow/i });
  if (await allowButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allowButton.click();
  }

  // Step 3: Fill credentials
  const username = "automated+render-testing@smugmug.com";
  const password = process.env.SMUGMUG_QA_PASSWORD;
  if (!password) {
    throw new Error("SMUGMUG_QA_PASSWORD must be set in .env");
  }

  console.log(`[auth] Filling login form...`);
  await page.locator('input[name="email"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="password"]').press("Enter");

  // Step 4: Wait for post-login redirect
  console.log(`[auth] Waiting for post-login redirect...`);
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
  console.log(`[auth] Logged in, landed on: ${page.url()}`);

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
  await context.addCookies(require(AUTH_STATE_PATH).cookies || []);
}
