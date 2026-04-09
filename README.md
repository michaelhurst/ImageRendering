# Image Rendering Tests

Playwright tests that compare image rendering between `photos.smugmug.com` (baseline) and `photos.inside.smugmug.net` (candidate) across multiple viewport sizes.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browser:
   ```bash
   npx playwright install chromium
   ```

## Running the tests

Run headless:
```bash
npm test
```

Run with browser visible:
```bash
npx playwright test --headed
```

> The first run captures baseline screenshots from `smugmug.com` and saves them to `tests/baselines/`. Run the tests a second time to do the actual comparison against the `inside.smugmug.net` candidate images.

## Updating baselines

If you need to regenerate the baselines (e.g. the source image has changed):
```bash
rm -rf tests/baselines tests/image-render.spec.js-snapshots
npx playwright test --headed
```

Then run again to verify:
```bash
npx playwright test --headed
```

## What the tests check

For each of the 13 viewport sizes:
- `image renders and is visible` — confirms the candidate image loads without errors
- `candidate matches baseline` — compares a screenshot of the candidate against the saved baseline screenshot pixel-by-pixel
