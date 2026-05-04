/**
 * Global setup for Playwright test runs.
 *
 * Clears the run folder state file so each `pnpm test:*` invocation
 * creates a fresh folder rather than reusing one from a previous run.
 */

import * as fs from "fs";
import * as path from "path";

const RUN_FOLDER_STATE_PATH = path.resolve(
  __dirname,
  "../test-results/.run-folder.json",
);

export default function globalSetup() {
  // Remove stale run folder state so a fresh folder is created
  if (fs.existsSync(RUN_FOLDER_STATE_PATH)) {
    fs.unlinkSync(RUN_FOLDER_STATE_PATH);
    console.log("[global-setup] Cleared previous run folder state.");
  }
}
