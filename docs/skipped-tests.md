# Skipped & Disabled Tests

This document tracks tests that are skipped or disabled, why, and what's needed to enable them.

---

## Disabled: POI-01 through POI-05 (Point of Interest)

**File:** `tests/api-point-of-interest.spec.ts`  
**Status:** Entire describe block disabled via `test.skip(true, ...)`  
**Root cause:** The `!pointofinterest` API endpoint returns null for all images on both inside and production. POI cannot be set via the API — PATCH with `PointOfInterestX`/`PointOfInterestY` is silently ignored, and PUT/POST to `!pointofinterest` returns 405.  
**What's needed:**

- Determine how POI is set (likely UI-only via the Organize crop tool)
- Or determine if face detection needs a specific account feature enabled
- Pre-uploaded test images with faces exist in `/POI-Tests/POI-test-images/` on both environments but return null for POI

---

## Disabled: Local tests (102 tests)

**File:** `playwright.config.ts` — `api-tests` project  
**Status:** Removed from testMatch (commented with explanation)  
**Root cause:** These tests are redundant with the `smugmug-api-tests` project which covers the same validations against the live pipeline with fresh uploads each run.  
**Disabled specs:** image-quality, image-sizing, exif-orientation, metadata-preservation, metadata-api, point-of-interest, watermark, resolution-cap  
**Kept active:** color-accuracy (10 tests), image-render (26 tests) — these are unique and not covered by API tests

---

## Conditional skips (graceful)

These tests attempt their operation and skip if the environment doesn't support it:

| Test  | Condition                          | Notes                                                                       |
| ----- | ---------------------------------- | --------------------------------------------------------------------------- |
| MA-07 | XMP regions not returned           | Skips if `!regions` returns 0 regions (works on both envs currently)        |
| IQ-07 | `quality-reference.gif` not found  | Guard clause — file exists, test passes                                     |
| IQ-08 | `quality-reference.heic` not found | Guard clause — file exists, test passes                                     |
| IQ-08 | HEIC SSIM check                    | Skips SSIM if sharp can't decode HEIC locally (still validates JPEG output) |
