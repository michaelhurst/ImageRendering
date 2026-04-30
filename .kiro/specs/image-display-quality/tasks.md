# Implementation Plan

## Phase 1 — Project Setup

- [ ] 1. Initialise the project and install dependencies
  - Run `pnpm install` in the `image-display-tests/` directory
  - Run `pnpm exec playwright install chromium`
  - Confirm `sharp`, `exifr`, and `dotenv` are available
  - _Requirements: all_

- [ ] 2. Configure environment
  - Copy `.env.example` to `.env`
  - Fill in `SMUGMUG_QA_PASSWORD`, `INSIDE_AUTH_USER`, `INSIDE_AUTH_PASS`
  - _Requirements: all_

- [ ] 3. Prepare reference images
  - Create or source `quality-detail.jpg` (JPEG Q95 with fine detail)
  - Create or source `quality-reference.png`, `quality-reference.gif`
  - Create or source `quality-noisy.jpg` (high-ISO noise) and `quality-resolution-chart.jpg`
  - Create `sizing-landscape.jpg` (6000×4000), `sizing-portrait.jpg` (4000×6000), `sizing-square.jpg` (5000×5000), `sizing-small.jpg` (400×300)
  - Create or source `sizing-panoramic.jpg` (12000×2000) and `sizing-tall.jpg` (2000×10000)
  - Create `orientation-1.jpg` through `orientation-8.jpg` with identical visual content and correct EXIF tags; create `orientation-reference.jpg` as ground truth
  - Create `metadata-rich.jpg` with full EXIF (Make, Model, ExposureTime, FNumber, ISO, FocalLength, DateTimeOriginal, GPS, LensModel, WhiteBalance, Flash, Copyright, Artist, UserComment)
  - Create `metadata-iptc.jpg` with IPTC caption and keywords; `metadata-stripped.jpg` with all EXIF removed
  - Create color-checker images with companion JSON files for sRGB, Adobe RGB, grayscale ramp, black/white, and saturated patches
  - Create `poi-test.jpg`, `watermark-test.jpg`, and `resolution-cap-test.jpg`
  - _Requirements: 1, 2, 3, 4, 5, 8, 9, 10_

---

## Phase 2 — Helper Implementation

- [ ] 4. Implement SmugMugAPI client (`helpers/smugmug-api.ts`)
  - Implement `get()` and `patch()` core request methods with error handling
  - Implement `getImage()`, `getSizeDetails()`, `getLargestImage()`, `getMetadata()`
  - Implement `getPointOfInterest()`, `setPointOfInterest()`, `getRegions()`
  - Implement `getAlbumImages()` with pagination support
  - Implement `uploadImage()` with support for new uploads and image replacement
  - Implement `downloadBuffer()` for fetching CDN images as Buffers
  - Implement `SmugMugAPI.withApiKey()` static factory for unauthenticated access
  - Implement `SmugMugAPI.extractImageKey()` static utility
  - _Requirements: all_

- [ ] 5. Implement image comparison utilities (`helpers/image-comparison.ts`)
  - Implement `getDimensions()` using `sharp` metadata
  - Implement `aspectRatiosMatch()` and `longestEdgeWithin()`
  - Implement `md5Hex()` and `md5Base64()`
  - Implement `samplePixel()` and `sampleAndCompare()` using sharp raw buffer
  - Implement `calculateDeltaE()` with perceptual weighting
  - Implement `allSamplesWithinThreshold()`
  - Implement `computeSSIM()` using grayscale normalization
  - Implement `measureSharpness()` using Laplacian variance
  - Implement `detectWatermarkDiff()` using pixel-by-pixel diff
  - Implement `measureGradientSmoothness()` for banding detection
  - _Requirements: 1, 2, 3, 4, 9, 10_

- [ ] 6. Implement EXIF utilities (`helpers/exif-utils.ts`)
  - Implement `readExif()` for local files using `exifr`
  - Implement `readExifFromBuffer()` for downloaded image buffers
  - Implement `getOrientationInfo()` lookup for all 8 EXIF orientation tags
  - Implement `correctedDimensions()` for post-correction dimension calculation
  - Implement `getICCProfileName()` and `isSRGB()` using sharp metadata
  - Implement `readIPTC()` for caption and keyword extraction
  - Implement `readXMPRegions()` for face region parsing
  - _Requirements: 4, 5, 7_

- [ ] 7. Implement authentication and fixtures (`helpers/auth.ts`, `helpers/test-fixtures.ts`)
  - Implement `loginAndSaveState()`: clear cookie consent, fill login form, save storage state
  - Implement `getAuthStatePath()` and `applyAuthState()`
  - Wire `api`, `imageCompare`, `exifUtils`, `testAlbumKey`, `testAlbumUri`, `testNickname`, `referenceImagesDir` fixtures into the extended test object
  - _Requirements: all_

---

## Phase 3 — Test Implementation

- [ ] 8. Implement Image Quality tests (`tests/image-quality.spec.ts`)
  - IQ-01: Upload JPEG, fetch all tiers, compute SSIM ≥ 0.92 per tier
  - IQ-02: Upload JPEG, compare ArchivedUri MD5 and ArchivedMD5 against source
  - IQ-03: Upload JPEG, compare ArchivedSize and OriginalSize against source file size
  - IQ-04: Upload JPEG, fetch largest non-original tier, compute SSIM ≥ 0.90 against single-pass resize
  - IQ-05: Upload PNG, compare ArchivedUri MD5 against source
  - IQ-06: Upload PNG, fetch M and L tiers, compute SSIM ≥ 0.92
  - IQ-07: Upload GIF, compare ArchivedUri MD5 against source
  - IQ-08: Upload HEIC, fetch L or XL tier, verify valid dimensions
  - IQ-09: Upload noisy JPEG, fetch L tier, compute SSIM ≥ 0.88
  - IQ-10: Upload resolution chart, fetch M and L tiers, verify Laplacian variance ≥ 50
  - _Requirements: 1_

- [ ] 9. Implement Color Accuracy tests (`tests/color-accuracy.spec.ts`)
  - CL-01: Upload sRGB checker, fetch L tier, sample reference pixels, assert Delta-E < 5
  - CL-02: Upload Adobe RGB checker, fetch L tier, sample pixels, assert Delta-E < 10
  - CL-03: Upload ProPhoto RGB checker, fetch L tier, sample pixels, assert Delta-E < 10
  - CL-04: Upload custom ICC image, fetch L tier, verify ICC preserved or converted to sRGB
  - CL-05: Upload sRGB-tagged and untagged versions, compare L tiers, assert SSIM ≥ 0.98
  - CL-06: Upload CMYK JPEG, fetch L tier, verify valid RGB output (not CMYK)
  - CL-07: Upload 16-bit TIFF gradient, fetch L tier, verify gradient smoothness stdDev < 3.0
  - CL-08: Upload black/white reference, sample pixels, assert Delta-E < 8 for both
  - CL-09: Upload grayscale ramp, sample each step, verify luminance within ±5
  - CL-10: Upload saturated patches, sample each patch, assert Delta-E < 10
  - _Requirements: 2_

- [ ] 10. Implement Image Sizing tests (`tests/image-sizing.spec.ts`)
  - SZ-01: Upload landscape, fetch all tiers, assert actual pixel dims match !sizedetails
  - SZ-02: Upload landscape, fetch all tiers, assert aspect ratio within ±0.02
  - SZ-03: Upload landscape 6000×4000, verify longest edge capped per tier spec
  - SZ-04: Upload portrait 4000×6000, verify longest edge (height) capped per tier spec
  - SZ-05: Upload square 5000×5000, verify all tiers are square
  - SZ-06: Upload panoramic 12000×2000, verify aspect ratio > 4:1 preserved
  - SZ-07: Upload tall 2000×10000, verify aspect ratio > 3:1 preserved
  - SZ-08: Upload small 400×300, verify no tier exceeds source dimensions
  - SZ-09: Query !largestimage, verify dimensions > 0 and ≤ original
  - SZ-10: Upload known-dimension image, verify OriginalWidth and OriginalHeight match source
  - SZ-11: Upload known-size file, verify OriginalSize matches source byte count
  - _Requirements: 3_

- [ ] 11. Implement EXIF Orientation tests (`tests/exif-orientation.spec.ts`)
  - OR-01 through OR-08: Upload each orientation fixture, fetch L tier, compute SSIM ≥ 0.90 against ground truth (loop tags 1–8)
  - OR-09: Upload orientation-6 landscape-pixel image, verify OriginalWidth < OriginalHeight
  - OR-10: Upload orientation-6 image, fetch all tiers, verify every tier is portrait (height > width)
  - OR-11: Navigate to image WebUri, open Lightbox, screenshot and verify portrait orientation (requires selector discovery — leave as `test.skip()` initially)
  - OR-12: Navigate to Organizer, find thumbnail, verify portrait bounding box (requires selector discovery — leave as `test.skip()` initially)
  - _Requirements: 4_

- [ ] 12. Implement Metadata Preservation tests (`tests/metadata-preservation.spec.ts`)
  - Upload `metadata-rich.jpg` once in a shared setup step and cache the image key
  - MP-01: Assert Make and Model in !metadata match source EXIF
  - MP-02: Assert ExposureTime, FNumber, ISO in !metadata match source
  - MP-03: Assert FocalLength and FocalLengthIn35mmFilm in !metadata match source
  - MP-04: Assert DateTimeOriginal in !metadata matches source (compare as ISO strings)
  - MP-05: Assert Latitude, Longitude, Altitude on image endpoint match source GPS
  - MP-06: Assert GPS values consistent between image endpoint and !metadata
  - MP-07: Assert LensModel in !metadata matches source
  - MP-08: Assert WhiteBalance in !metadata is defined when present in source
  - MP-09: Assert Flash in !metadata is defined when present in source
  - MP-10: Assert Copyright in !metadata matches source
  - MP-11: Assert Artist in !metadata matches source
  - MP-12: Upload `metadata-iptc.jpg`, assert Caption matches IPTC caption
  - MP-13: Upload `metadata-iptc.jpg`, assert KeywordArray contains all IPTC keywords
  - MP-14: Assert UserComment in !metadata matches source
  - _Requirements: 5_

- [ ] 13. Implement Metadata Display tests (`tests/metadata-display.spec.ts`)
  - Run `pnpm exec playwright codegen https://inside.smugmug.net` while logged in and navigate to a gallery image in Lightbox
  - Record the actual selectors for: Lightbox container, info panel trigger, camera text, exposure text, focal length, date, GPS section
  - Update the `SELECTORS` object in the spec file with real selectors
  - MD-01 through MD-09: Remove `test.skip()` calls and implement DOM assertions using discovered selectors
  - For privacy tests (MD-06, MD-07, MD-08): confirm the gallery/album settings can be toggled via API or require manual pre-configuration; document in test preconditions
  - _Requirements: 6_

- [ ] 14. Implement Metadata API Accuracy tests (`tests/metadata-api.spec.ts`)
  - MA-01: Upload rich-EXIF image, query !metadata, assert all required fields present
  - MA-02: Upload stripped-EXIF image, query !metadata, assert no error and no spurious data
  - MA-03: Upload JPEG, PNG, GIF; assert Format field matches for each
  - MA-04: Upload with known filename, assert FileName field matches
  - MA-05: PATCH KeywordArray with ["sunset", "ocean", "HDR"], GET and assert exact match
  - MA-06: PATCH Title and Caption with unicode and special chars, GET and assert exact match
  - MA-07: Upload XMP-regions image, query !regions, assert regions returned with coordinates
  - _Requirements: 7_

- [ ] 15. Implement Point of Interest tests (`tests/point-of-interest.spec.ts`)
  - POI-01: Upload image with no POI, verify POI is null or centered at (0.5, 0.5)
  - POI-02: Set POI to (0.25, 0.25), fetch thumbnail, verify valid dimensions (full crop verification requires pixel analysis — add if feasible)
  - POI-03: Set POI, replace image via Upload API, query !pointofinterest, log and document behavior
  - POI-04: Set POI to (0.33, 0.67), query !pointofinterest, assert coordinates match within ±0.01
  - POI-05: Upload two versions of the same image (one with POI, one without), compare thumbnail SSIM, log for analysis
  - _Requirements: 8_

- [ ] 16. Implement Watermark tests (`tests/watermark.spec.ts`)
  - Set `TEST_WATERMARK_ALBUM_KEY` in `.env` for a gallery with watermarking enabled
  - WM-01: Upload image, fetch each tier as visitor (public API), compare pixel diff against owner's tier, assert > 1% diff
  - WM-02: Upload image, fetch L tier as owner, compute SSIM ≥ 0.90 against locally resized source
  - WM-03: Upload image, download ArchivedUri as owner, assert MD5 matches source
  - WM-04: Upload image, compare XL tier owner vs visitor, log diff percentage and verify 1–50% range
  - WM-05: Compare watermark diff percentage across Th, M, L, XL tiers; assert ratio < 10× between smallest and largest
  - _Requirements: 9_

- [ ] 17. Implement Resolution Cap tests (`tests/resolution-cap.spec.ts`)
  - Set `TEST_CAPPED_ALBUM_KEY` and `TEST_RESOLUTION_CAP_MAX` in `.env`
  - RC-01: Fetch all tiers as visitor (public API), assert no tier longest edge exceeds cap
  - RC-02: Fetch all tiers as owner (authenticated), verify at least one tier exceeds the cap
  - RC-03: Download ArchivedUri as owner, verify dimensions match OriginalWidth/OriginalHeight
  - RC-04: Navigate to gallery in Lightbox as visitor, inspect loaded image `naturalWidth`/`naturalHeight`, assert ≤ cap (requires selector discovery — leave as `test.skip()` initially)
  - _Requirements: 10_

---

## Phase 4 — Calibration & Validation

- [ ] 18. Run the full suite against the inside environment and capture baseline results
  - `pnpm run test:inside 2>&1 | tee baseline-results.txt`
  - Identify any tests that fail due to threshold miscalibration (not product bugs)
  - _Requirements: all_

- [ ] 19. Calibrate quality thresholds based on baseline results
  - If SSIM scores consistently land at 0.94–0.96, tighten the threshold to 0.93
  - If Delta-E scores are consistently > 5 for known-good images, investigate color space handling before loosening thresholds
  - Document final calibrated thresholds in a comment at the top of each spec file
  - _Requirements: 1, 2, 4, 9_

- [ ] 20. Implement Lightbox UI tests (MD-01 to MD-09, OR-11, OR-12, RC-04)
  - Run `pnpm exec playwright codegen https://inside.smugmug.net` with `--load-storage=fixtures/auth-state.json`
  - Navigate to a gallery image and open Lightbox, recording selectors
  - Update `SELECTORS` in `metadata-display.spec.ts` and uncomment test implementations
  - Remove `test.skip()` from OR-11, OR-12, and RC-04 once selectors are confirmed
  - _Requirements: 4, 6, 10_

- [ ] 21. Add to CI pipeline
  - Confirm tests can be run headlessly: `pnpm exec playwright test --reporter=junit`
  - Store credentials as CI secrets and map to `.env` variables
  - Add a rate-limit guard: monitor `X-RateLimit-Remaining` headers during upload-heavy test runs and add delays if needed
  - _Requirements: all_
