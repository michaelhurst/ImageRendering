/**
 * SmugMug authentication helpers for Playwright tests.
 *
 * Handles:
 *   - Cookie consent banner dismissal
 *   - Login via email/password form
 *   - Session reuse via storage state
 */

import { type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_STATE_PATH = path.resolve(__dirname, "../fixtures/auth-state.json");

// The cookies that actually authorize write operations for the SmugMug
// session (folder/album creation, uploads, metadata PATCHes). The API key and
// HTTP Basic Auth only cover reads, so if any of these is missing or expired,
// a restored session can read but not write — surfacing as a confusing 404 on
// the first write. Treat such a session as invalid and re-login.
const REQUIRED_AUTH_COOKIES = ["ae", "ah", "au", "__Secure-mercury-inside"];

/**
 * Returns true only if a saved auth state exists, still contains all the
 * essential session cookies, and none of them has expired. Persistent cookies
 * with an `expires` timestamp in the past are treated as dead; session cookies
 * (expires <= 0) are accepted since their lifetime isn't encoded in the state.
 */
export function isAuthSessionValid(
  authStatePath: string = AUTH_STATE_PATH,
): boolean {
  try {
    if (!fs.existsSync(authStatePath)) return false;
    const state = JSON.parse(fs.readFileSync(authStatePath, "utf8"));
    const cookies: Array<{ name: string; expires?: number }> =
      state.cookies || [];
    const nowSec = Date.now() / 1000;
    const byName = new Map(cookies.map((c) => [c.name, c]));

    for (const name of REQUIRED_AUTH_COOKIES) {
      const cookie = byName.get(name);
      if (!cookie) {
        console.log(`[auth] Session check: required cookie "${name}" missing.`);
        return false;
      }
      if (
        typeof cookie.expires === "number" &&
        cookie.expires > 0 &&
        cookie.expires < nowSec
      ) {
        console.log(
          `[auth] Session check: cookie "${name}" expired at ` +
            `${new Date(cookie.expires * 1000).toISOString()}.`,
        );
        return false;
      }
    }
    return true;
  } catch (err: any) {
    console.log(`[auth] Session check failed to parse state: ${err.message}`);
    return false;
  }
}

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
