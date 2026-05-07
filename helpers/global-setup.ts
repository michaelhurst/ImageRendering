/**
 * Global setup for Playwright test runs.
 *
 * - Clears the run folder state file so each invocation creates a fresh folder.
 * - Ensures a valid login session exists (logs in if needed).
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "@playwright/test";
import { loginAndSaveState, getAuthStatePath } from "./auth";

const RUN_FOLDER_STATE_PATH = path.resolve(
  __dirname,
  "../test-results/.run-folder.json",
);

export default async function globalSetup() {
  // Remove stale run folder state so a fresh folder is created
  if (fs.existsSync(RUN_FOLDER_STATE_PATH)) {
    fs.unlinkSync(RUN_FOLDER_STATE_PATH);
    console.log("[global-setup] Cleared previous run folder state.");
  }

  // Ensure we have a valid login session
  const authStatePath = getAuthStatePath();
  if (!fs.existsSync(authStatePath)) {
    console.log("[global-setup] No auth state found — logging in...");
    const browser = await chromium.launch();
    const context = await browser.newContext({
      httpCredentials:
        process.env.ENVIRONMENT === "inside"
          ? {
              username: process.env.INSIDE_AUTH_USER || "",
              password: process.env.INSIDE_AUTH_PASS || "",
            }
          : undefined,
    });
    const page = await context.newPage();
    await loginAndSaveState(page);
    await context.close();
    await browser.close();
    console.log("[global-setup] Login complete, session saved.");
  }
}
