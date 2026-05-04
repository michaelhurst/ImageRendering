# Skipped Tests — Reasons & Potential Fixes

This document tracks tests that are conditionally skipped during runs, why they skip, and what would be needed to enable them.

---

## IQ-06: PNG resized tiers convert to JPEG acceptably

**File:** `tests/api-image-quality.spec.ts`  
**Skip condition:** Fails with SSIM ~0.007 (downloaded tier doesn't match source)  
**Root cause:** The 132MB PNG (`quality-reference.png`) takes longer to process than the tier generation timeout allows. The `!sizedetails` endpoint returns tier URLs, but the actual image data served at those URLs appears to be a placeholder or processing-in-progress response rather than the final resized JPEG.  
**Potential fix:**

- Increase `waitForSizeTiers` timeout beyond 120s (currently set to 120s)
- Add a secondary validation step that checks the downloaded tier's dimensions match the expected tier dimensions before running SSIM
- Use a smaller PNG test image (e.g., 10-20MB) that processes faster
- Add retry logic: if SSIM is below 0.5, wait and re-download (indicates placeholder)

---

## MA-07: !regions returns face/object regions for XMP image

**File:** `tests/api-metadata-api.spec.ts`  
**Skip condition:** Gracefully skips if the `!regions` endpoint returns 0 regions after upload  
**Root cause:** The inside environment does not appear to parse XMP face/object regions from uploaded images. The `!regions` API endpoint returns an empty array. This may be a feature that's only enabled on production, or it may require background processing that takes longer than the 5s wait.  
**Potential fix:**

- Test on production to see if regions are returned there
- Increase the wait time after upload (XMP parsing may be async)
- Verify the test image (`c-metadata-xmp-regions.jpg`) actually contains valid XMP region data by inspecting it with `exiftool` or `exifr`
- Check if the SmugMug API requires a specific endpoint or parameter to trigger XMP parsing

---

## RC-01: No tier exceeds resolution cap

**File:** `tests/api-resolution-cap.spec.ts`  
**Skip condition:** `TEST_RESOLUTION_CAP_MAX` env var not set  
**Root cause:** This test enforces a maximum pixel dimension on served tiers. The cap value varies by account/plan and isn't a fixed constant, so it must be configured per environment.  
**Potential fix:**

- Set `TEST_RESOLUTION_CAP_MAX` in `.env` to the expected max longest edge for the test account (e.g., `5120` for 5K max)
- The test account (`automated-render-testing`) may need a specific plan/tier that enforces a resolution cap
- Query the account settings API to determine the cap dynamically

---

## RC-04: Lightbox image respects resolution cap

**File:** `tests/api-resolution-cap.spec.ts`  
**Skip condition:** `TEST_RESOLUTION_CAP_MAX` env var not set  
**Root cause:** Same as RC-01 — needs the resolution cap value configured.  
**Potential fix:** Same as RC-01. Once `TEST_RESOLUTION_CAP_MAX` is set, this test navigates to the Lightbox and verifies the served image doesn't exceed the cap.

---

## MD-06: Lightbox hides GPS when Geography disabled

**File:** `tests/api-metadata-display.spec.ts`  
**Skip condition:** Unconditionally skipped  
**Root cause:** Requires toggling the gallery's "Geography" setting via the SmugMug UI or API before checking that GPS data is hidden in the Lightbox info panel.  
**Potential fix:**

- Use the SmugMug API to PATCH the album/gallery settings to disable Geography display
- Navigate to the Lightbox and verify GPS coordinates are not shown
- Re-enable the setting after the test (cleanup)
- Need to identify the correct API endpoint and field name for the Geography toggle

---

## MD-07: Lightbox hides GPS when site-level GPS off

**File:** `tests/api-metadata-display.spec.ts`  
**Skip condition:** Unconditionally skipped  
**Root cause:** Requires toggling a site-level (account-level) privacy setting that controls GPS display globally.  
**Potential fix:**

- Use the SmugMug API to PATCH the user/account settings to disable GPS display
- Verify GPS is hidden in Lightbox
- Re-enable after test
- Risk: changing account-level settings could affect other concurrent tests

---

## MD-08: EXIF hidden when gallery EXIF setting is off

**File:** `tests/api-metadata-display.spec.ts`  
**Skip condition:** Unconditionally skipped  
**Root cause:** Requires toggling the gallery's EXIF display setting before verifying that camera metadata is hidden in the Lightbox info panel.  
**Potential fix:**

- Use the SmugMug API to PATCH the album settings to disable EXIF display
- Navigate to Lightbox and verify EXIF fields are not rendered
- Re-enable after test
- Need to identify the correct API field for EXIF display toggle

---

## IQ-07 / IQ-08: File format tests (conditional)

**File:** `tests/api-image-quality.spec.ts`  
**Skip condition:** Only skips if the test image file doesn't exist in `TEST_IMAGES_DIR`  
**Root cause:** These are guard clauses, not real skips. If `quality-reference.gif` or `quality-reference.heic` are missing from the test images directory, the test skips gracefully.  
**Status:** Currently passing — both files exist. No action needed.
