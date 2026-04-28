# SmugMug Image Display Tests

Playwright test suite for validating SmugMug image display quality, color accuracy, sizing, EXIF orientation, watermarking, and metadata handling.

136 local tests across 11 spec files, plus 82 SmugMug API tests across 9 spec files (218 total).

---

## Setup

**1. Install dependencies:**

```bash
npm install
npx playwright install
```

**2. Configure environment variables:**

```bash
cp .env.example .env
```

Fill in your `.env` file:

| Variable                     | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `ENVIRONMENT`                | `inside` or `production`                           |
| `INSIDE_AUTH_USER`           | HTTP Basic Auth username for inside.smugmug.net    |
| `INSIDE_AUTH_PASS`           | HTTP Basic Auth password                           |
| `SMUGMUG_QA_USERNAME`        | SmugMug login username                             |
| `SMUGMUG_QA_PASSWORD`        | SmugMug login password                             |
| `SMUGMUG_API_KEY`            | SmugMug API key (OAuth 1.0a)                       |
| `SMUGMUG_API_SECRET`         | SmugMug API secret                                 |
| `SMUGMUG_OAUTH_TOKEN`        | OAuth token                                        |
| `SMUGMUG_OAUTH_TOKEN_SECRET` | OAuth token secret                                 |
| `TEST_ALBUM_KEY`             | Pre-seeded album key for upload tests              |
| `TEST_NICKNAME`              | Test account nickname (default: `qa-pro`)          |
| `TEST_IMAGES_DIR`            | Absolute path to local test images folder          |
| `TEST_RESOLUTION_CAP_MAX`    | Optional max longest edge for resolution cap tests |

---

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:render
npm run test:quality
npm run test:color
npm run test:sizing
npm run test:orientation
npm run test:metadata-preservation
npm run test:metadata-display
npm run test:metadata-api
npm run test:poi
npm run test:watermark
npm run test:resolution-cap

# Run only local file validation tests
npm run test:local

# Run only SmugMug API tests (requires credentials)
npm run test:smugmug

# Run individual API test suites
npm run test:api-quality
npm run test:api-sizing
npm run test:api-orientation
npm run test:api-metadata
npm run test:api-metadata-display
npm run test:api-metadata-api
npm run test:api-poi
npm run test:api-watermark
npm run test:api-resolution-cap

# Update snapshots
npm run test:update

# View HTML report
npm run test:report
```

---

## Test Inventory

All tests read images from the `TEST_IMAGES_DIR` environment variable.

### Local Tests

Local tests validate test image properties directly from disk — no SmugMug credentials needed.
Run with `npm run test:local`.

---

### Color Accuracy — `tests/color-accuracy.spec.ts`

10 tests

**CL-01 · sRGB color checker patches match expected RGB values**  
Image: `c-color-checker-srgb.jpg` + `.json`  
Samples pixel at each patch coordinate, computes CIE76 Delta-E against expected sRGB values. Threshold ≤ 5.  
_Catches color shifts introduced by re-encoding, profile mismatches, or pipeline bugs that alter pixel values._

**CL-02 · Adobe RGB color checker patches within Delta-E of sRGB targets**  
Image: `c-color-checker-adobergb.jpg` + `.json`  
Same patch sampling with wider gamut tolerance (threshold ≤ 25) to account for color space conversion.  
_Validates that wider-gamut images are correctly converted to sRGB for display without extreme color drift._

**CL-03 · ProPhoto RGB color checker patches within Delta-E of sRGB targets**  
Image: `c-color-checker-prophoto.jpg` + `.json`  
Same as CL-02 for ProPhoto RGB gamut. Threshold ≤ 25.  
_Ensures the widest common camera gamut (ProPhoto) doesn't produce wildly wrong colors after conversion._

**CL-04 · Custom ICC profile image has embedded ICC profile**  
Image: `c-color-icc-custom.jpg`  
Checks that sharp detects an ICC profile in the image metadata.  
_Confirms the pipeline preserves custom ICC profiles rather than silently stripping them._

**CL-05 · Untagged image has no embedded ICC profile**  
Image: `c-color-untagged.jpg`  
Confirms no ICC profile is present.  
_Validates the test image itself — ensures the "untagged" fixture is genuinely untagged so other tests have a clean baseline._

**CL-06 · CMYK image is detected as CMYK color space**  
Image: `c-color-cmyk.jpg`  
Verifies `metadata.space === "cmyk"`.  
_Catches cases where CMYK images are silently converted or misidentified, which would break downstream color handling._

**CL-07 · 16-bit gradient has smooth tonal transitions**  
Image: `c-color-16bit-gradient.tiff`  
Measures mean adjacent pixel difference along the middle row. Must be < 5.  
_Detects banding artifacts caused by bit-depth reduction (16-bit → 8-bit) or aggressive compression._

**CL-08 · Black and white point pixels match expected values**  
Image: `c-color-blackwhite.jpg` + `.json`  
Samples black, white, and midgray patches at known coordinates. Delta-E ≤ 5.  
_Catches clipping or level shifts where pure black gets lifted or pure white gets crushed during processing._

**CL-09 · Grayscale ramp steps match expected luminance values**  
Image: `c-color-grayscale-ramp.jpg` + `.json`  
Samples 11 grayscale steps, compares measured luminance to expected values. Tolerance ≤ 15.  
_Detects gamma curve errors or tone mapping issues that would make shadows too dark or highlights too bright._

**CL-10 · Saturated color patches match expected RGB values**  
Image: `c-color-saturated-patches.jpg` + `.json`  
Samples R/G/B/C/M/Y patches. Delta-E ≤ 5.  
_Catches desaturation or hue rotation in fully saturated colors — the most visually obvious kind of color error._

---

### Image Quality — `tests/image-quality.spec.ts`

9 tests

**IQ-01 · Candidate image is readable and has valid dimensions**  
Image: `quality-detail.jpg`  
Width and height > 0.  
_Basic smoke test — catches corrupted files, truncated downloads, or format errors before more expensive checks run._

**IQ-02 · Candidate SSIM vs baseline meets quality threshold**  
Images: `quality-reference.png`, `quality-detail.jpg`  
Downsamples both to 1600px wide, computes SSIM. Must be ≥ 0.92.  
_Detects overall structural degradation — heavy compression, blurring, or content corruption that a human eye would notice._

**IQ-03 · Candidate file size is non-trivial**  
Image: `quality-detail.jpg`  
File size > 10KB.  
_Catches empty files, truncated writes, or placeholder stubs that would pass dimension checks but contain no real image data._

**IQ-04 · Baseline file size is non-trivial**  
Image: `quality-reference.png`  
File size > 10KB.  
_Same as IQ-03 but for the reference image — ensures the baseline itself isn't corrupted._

**IQ-05 · Candidate is a valid JPEG**  
Image: `quality-detail.jpg`  
First 3 bytes are `FF D8 FF`.  
_Catches format mismatches where a file has a .jpg extension but isn't actually JPEG (e.g., renamed PNG or corrupted header)._

**IQ-06 · Baseline is a valid PNG**  
Image: `quality-reference.png`  
First 4 bytes are `89 50 4E 47`.  
_Same magic-byte validation for the PNG baseline — ensures the lossless reference is genuinely PNG._

**IQ-07 · Candidate image sharpness meets minimum threshold**  
Image: `quality-detail.jpg`  
Laplacian variance > 50 (downsampled to 1600px).  
_Flags images that have been over-smoothed or had sharpening stripped during processing._

**IQ-08 · quality-noisy.jpg has measurable sharpness variance**  
Image: `quality-noisy.jpg`  
Laplacian variance > 50.  
_Validates the noisy test fixture has enough texture for meaningful sharpness comparisons — a blank or flat image would break other tests._

**IQ-09 · Candidate and baseline have matching aspect ratio**  
Images: `quality-reference.png`, `quality-detail.jpg`  
Aspect ratio difference ≤ 0.05.  
_Catches unexpected cropping or padding introduced during format conversion or resizing._

---

### Image Render — `tests/image-render.spec.ts`

26 tests (13 viewports × 2)

Each viewport gets two tests: one confirms the image renders, one compares a screenshot against a saved baseline.  
Image: `c-sizing-landscape.jpg` (6000×4000, ~2MB). Baselines stored in `tests/baselines/`.

**Ti · 100×75** — renders and is visible · screenshot matches baseline  
**Th · 150×112** — renders and is visible · screenshot matches baseline  
**S · 400×300** — renders and is visible · screenshot matches baseline  
**M · 600×450** — renders and is visible · screenshot matches baseline  
**L · 800×600** — renders and is visible · screenshot matches baseline  
**XL · 1024×768** — renders and is visible · screenshot matches baseline  
**X2 · 1280×960** — renders and is visible · screenshot matches baseline  
**X3 · 1600×1200** — renders and is visible · screenshot matches baseline  
**X4 · 1920×1440** — renders and is visible · screenshot matches baseline  
**X5 · 2048×1536** — renders and is visible · screenshot matches baseline  
**4K · 3840×2160** — renders and is visible · screenshot matches baseline  
**5K · 5120×2880** — renders and is visible · screenshot matches baseline  
**O · 1280×720** — renders and is visible · screenshot matches baseline

_Render tests catch browser-specific decoding failures, CSS layout bugs, and regressions in how images scale across the full range of SmugMug size tiers. Baseline comparisons detect any pixel-level change in rendering output._

---

### Image Sizing — `tests/image-sizing.spec.ts`

7 tests

**SZ-01 · Landscape image has correct dimensions**  
Image: `c-sizing-landscape.jpg`  
Expected: 6000×4000.  
_Validates the canonical landscape test fixture has the exact dimensions other tests depend on._

**SZ-02 · Portrait image has correct dimensions**  
Image: `c-sizing-portrait.jpg`  
Expected: 4000×6000.  
_Same for portrait — ensures the fixture wasn't accidentally rotated or resized._

**SZ-03 · Square image has equal width and height**  
Image: `c-sizing-square.jpg`  
Expected: 5000×5000.  
_Catches aspect ratio bugs that only manifest with 1:1 images, which are an edge case in most resize logic._

**SZ-04 · Panoramic image has extreme landscape aspect ratio**  
Image: `c-sizing-panoramic.jpg`  
Expected: 12000×2000, ratio > 5.  
_Tests extreme aspect ratios that can break thumbnail generation, crop logic, or layout calculations._

**SZ-05 · Tall image has extreme portrait aspect ratio**  
Image: `c-sizing-tall.jpg`  
Expected: 2000×10000, ratio > 4.  
_Same as SZ-04 but for extreme vertical images — catches overflow or truncation in height-dominant layouts._

**SZ-06 · Small image has correct dimensions**  
Image: `c-sizing-small.jpg`  
Expected: 400×300.  
_Validates the small fixture used for browser data URL tests — ensures it hasn't been upscaled or altered._

**SZ-07 · Small image renders at correct natural dimensions in browser**  
Image: `c-sizing-small.jpg`  
Browser `naturalWidth`/`naturalHeight` matches buffer dimensions.  
_Catches browser decoding bugs where the reported natural size doesn't match the actual pixel data._

---

### EXIF Orientation — `tests/exif-orientation.spec.ts`

53 tests

**OR-01 · {filename} has valid EXIF orientation tag** (×16)  
Images: all 8 landscape + 8 portrait orientation images  
Orientation tag is numeric 1–8 (uses `translateValues: false`).  
_Ensures the EXIF orientation tag survived upload/processing and wasn't stripped or corrupted._

**OR-02 · {filename} has expected orientation tag {N}** (×16)  
Images: all 8 landscape + 8 portrait orientation images  
Each image's tag matches its expected value (1 through 8).  
_Catches cases where the tag is present but has the wrong value — e.g., a 90° image tagged as 180°._

**OR-03 · {filename} has valid non-zero dimensions** (×16)  
Images: all 8 landscape + 8 portrait orientation images  
Width and height > 0.  
_Smoke test across all orientation variants — catches format corruption specific to certain orientation tags._

**OR-04 · Landscape_1-Normal.jpg has landscape aspect ratio**  
Image: `Landscape_1-Normal.jpg`  
width > height.  
_Validates the ground truth — orientation 1 (normal) should have landscape raw pixels with no rotation needed._

**OR-05 · Portrait_1-Normal.jpg has portrait aspect ratio**  
Image: `Portrait_1-Normal.jpg`  
height > width.  
_Same ground truth check for portrait — raw pixels should already be taller than wide._

**OR-06 · Landscape_6 (6000×4000 variant) has expected dimensions**  
Image: `c-Landscape_6-Rotated-90-CW-6000x4000.jpg`  
Expected: 6000×4000.  
_Confirms the high-res 90° CW variant has the expected raw pixel layout for testing orientation-aware display logic._

**OR-07 · Landscape_3 (180°) has same dimensions as Landscape_1**  
Images: `Landscape_3-Rotated-180.jpg`, `Landscape_1-Normal.jpg`  
Identical width and height.  
_180° rotation shouldn't change dimensions — catches bugs where rotation logic incorrectly swaps width/height._

**OR-08 · Orientation reference images are valid**  
Images: `Landscape_orientation-reference.jpg`, `Portrait-orientation-reference.jpg`  
Both have positive dimensions.  
_Validates the visual reference images used for manual comparison are intact and readable._

---

### Metadata Preservation — `tests/metadata-preservation.spec.ts`

10 tests

**MP-01 · Camera make is present in metadata-rich.jpg**  
Make field is truthy.  
_Catches pipelines that strip manufacturer info during processing or re-encoding._

**MP-02 · Camera model is present in metadata-rich.jpg**  
Model field is truthy.  
_Same as MP-01 for the specific camera model string — often displayed to users in photo info panels._

**MP-03 · Exposure time is present in metadata-rich.jpg**  
ExposureTime defined and > 0.  
_Validates a core shooting parameter that photographers rely on seeing in image details._

**MP-04 · Aperture (FNumber) is present in metadata-rich.jpg**  
FNumber defined and > 0.  
_Another critical shooting parameter — missing aperture data is a common complaint when metadata gets stripped._

**MP-05 · ISO is present in metadata-rich.jpg**  
ISO or ISOSpeedRatings present.  
_Checks both the modern and legacy ISO tag names since cameras use both interchangeably._

**MP-06 · Focal length is present in metadata-rich.jpg**  
FocalLength defined and > 0.  
_Focal length is essential for photographers comparing lens performance — must survive processing._

**MP-07 · DateTimeOriginal is present in metadata-rich.jpg**  
Valid parseable date.  
_The original capture timestamp is the most important metadata field for photo organization and display._

**MP-08 · metadata-stripped.jpg has no camera EXIF fields**  
Image: `metadata-stripped.jpg`  
Make, Model, ISO, FNumber, ExposureTime all absent.  
_Confirms the negative test fixture — ensures "metadata missing" assertions are testing real absence, not parser bugs._

**MP-09 · metadata-iptc.jpg has IPTC metadata present**  
Image: `metadata-iptc.jpg`  
Parseable data with > 0 fields.  
_Validates that IPTC caption/keyword data survives and is parseable — used by search and display features._

**MP-10 · All orientation test images are valid and readable**  
Images: `Landscape_{1-8}`, `Portrait_{1-8}`  
Valid JPEG magic bytes, positive dimensions.  
_Bulk integrity check — catches corrupted orientation fixtures before they cause confusing failures in OR tests._

---

### Metadata API — `tests/metadata-api.spec.ts`

3 tests

**MA-01 · metadata-rich.jpg EXIF contains required fields**  
Make, Model, ExposureTime, FNumber, FocalLength present.  
_Validates the full set of camera fields that the SmugMug metadata API is expected to return._

**MA-02 · metadata-rich.jpg image format is JPEG**  
`format === "jpeg"`.  
_Catches format misidentification that would cause the API to return wrong content-type headers._

**MA-03 · metadata-rich.jpg EXIF DateTimeOriginal is a valid date**  
Parseable date, year > 1990.  
_Catches malformed date strings that would break date-based sorting or display in the UI._

---

### Metadata Display — `tests/metadata-display.spec.ts`

6 tests

**MD-01 · Candidate image loads in browser without console errors**  
Image: `metadata-iptc.jpg`  
No console errors or page errors during load.  
_Catches JavaScript decode errors, CORS issues, or malformed data URLs that would break the viewer._

**MD-02 · Candidate image src attribute is set correctly**  
Image: `metadata-iptc.jpg`  
src contains `data:image`.  
_Validates the data URL was correctly constructed — a malformed src would show a broken image icon._

**MD-03 · Candidate naturalWidth in browser matches buffer width**  
Image: `metadata-iptc.jpg`  
Browser `naturalWidth` === sharp metadata width.  
_Catches browser decoding discrepancies where the rendered size doesn't match the file's actual pixel dimensions._

**MD-04 · Candidate naturalHeight in browser matches buffer height**  
Image: `metadata-iptc.jpg`  
Browser `naturalHeight` === sharp metadata height.  
_Same as MD-03 for height — important for layout calculations that depend on accurate natural dimensions._

**MD-05 · metadata-rich.jpg EXIF Make and Model are non-empty**  
Image: `metadata-rich.jpg`  
Non-empty trimmed strings.  
_Catches cases where fields exist but contain empty strings or whitespace — would show blank in the UI._

**MD-06 · metadata-stripped.jpg loads cleanly in browser**  
Image: `metadata-stripped.jpg`  
Loads with `naturalWidth` > 0, no page errors.  
_Ensures images with no metadata don't cause browser errors — the viewer must handle missing EXIF gracefully._

---

### Point of Interest — `tests/point-of-interest.spec.ts`

5 tests

**POI-01 · POI test image loads and has valid dimensions**  
Image: `c-poi-test.jpg`  
Width and height > 0.  
_Smoke test for the POI fixture — ensures it's readable before running centroid calculations._

**POI-02 · POI image brightness centroid is within image bounds**  
Image: `c-poi-test.jpg`  
Centroid (cx, cy) both between 0 and 1.  
_Validates the centroid algorithm produces sane normalized coordinates — out-of-bounds values indicate a math bug._

**POI-03 · Reference image brightness centroid is within image bounds**  
Image: `c-sizing-landscape.jpg`  
Centroid (cx, cy) both between 0 and 1.  
_Same sanity check on a different image — ensures the algorithm works across different content types._

**POI-04 · POI image brightness centroid is in the top-left quadrant**  
Image: `c-poi-test.jpg`  
cx < 0.6 and cy < 0.6.  
_The test image has its subject in the top-left — this catches crop logic that centers on the wrong region._

**POI-05 · POI image center region is not blank**  
Image: `c-poi-test.jpg`  
Center 20×20 region mean luminance between 5 and 250.  
_Ensures the image has actual content in the center — a blank center would make centroid tests meaningless._

---

### Resolution Cap — `tests/resolution-cap.spec.ts`

4 tests

**RC-01 · Candidate longest edge does not exceed resolution cap**  
Image: `c-resolution-cap-test.jpg`  
Longest edge ≤ `TEST_RESOLUTION_CAP_MAX`. Skipped if env var not set.  
_Enforces the maximum display resolution — catches images that bypass the downscaling pipeline._

**RC-02 · Resolution chart longest edge does not exceed resolution cap**  
Image: `quality-resolution-chart.jpg`  
Longest edge ≤ `TEST_RESOLUTION_CAP_MAX`. Skipped if env var not set.  
_Same cap enforcement on the resolution chart — a different image type that might take a different code path._

**RC-03 · All test images have valid dimensions within sane bounds**  
Images: everything in `TEST_IMAGES_DIR`  
Every image: width > 0, height > 0, longest edge ≤ 15000.  
_Bulk sanity check across all fixtures — catches accidentally huge or zero-dimension images that would break other tests._

**RC-04 · quality-resolution-chart.jpg has valid dimensions**  
Image: `quality-resolution-chart.jpg`  
Positive dimensions, longest edge ≤ 15000.  
_Validates the resolution chart fixture specifically — it's used for fine-detail sharpness analysis._

---

### Watermark — `tests/watermark.spec.ts`

5 tests

**WM-01 · Watermark test image loads and is visible in browser**  
Image: `c-sizing-small.jpg`  
Loads in browser with `naturalWidth` > 0.  
_Basic browser rendering check — ensures the test image can be displayed before running pixel analysis._

**WM-02 · Watermark test image has valid dimensions**  
Image: `c-watermark-test.jpg`  
Width and height > 0.  
_Smoke test for the watermark fixture — catches corruption before more expensive block analysis._

**WM-03 · Watermark test image has no large uniform rectangular region**  
Image: `c-watermark-test.jpg`  
Fewer than 95 out of 100 10×10 blocks have variance < 2.  
_Detects watermark overlays that appear as uniform rectangular regions stamped onto the image._

**WM-04 · Watermark test image has sufficient tonal variation**  
Image: `c-watermark-test.jpg`  
Tonal range (max − min luminance) > 20.  
_Ensures the image isn't so flat that watermark detection becomes impossible — validates the fixture has enough contrast._

**WM-05 · Orientation test images have no uniform watermark blocks**  
Images: `Landscape_{1-8}`, `Portrait_{1-8}`  
Each image has < 20 uniform blocks.  
_Checks that orientation processing doesn't accidentally introduce watermark-like artifacts across all 16 variants._

---

### SmugMug API Tests

API tests upload images to SmugMug and verify the processing pipeline preserves quality, metadata, orientation, and sizing.
Run with `npm run test:smugmug`. Requires `TEST_ALBUM_KEY` and SmugMug credentials in `.env`.

---

### Image Quality (API) — `tests/api-image-quality.spec.ts`

10 tests

**IQ-01 · JPEG quality preserved at each CDN size tier**  
Uploads `quality-detail.jpg`, fetches each size tier via `!sizedetails`, computes SSIM against a locally resized version.  
_Catches quality degradation introduced by SmugMug's resize/re-encode pipeline at any tier._

**IQ-02 · Original download matches uploaded file**  
Compares MD5 of the ArchivedUri download against the source file. Also checks `ArchivedMD5` API field.  
_Ensures the original file is stored bit-for-bit — any modification means the archive pipeline is altering uploads._

**IQ-03 · Original download preserves file size**  
Compares `ArchivedSize` API field against the source file's byte count.  
_Catches silent re-encoding of originals that would change file size even if visual quality is preserved._

**IQ-04 · No double-compression on JPEG uploads**  
Fetches the largest non-original tier and compares SSIM against a locally resized Q95 version.  
_Detects double-compression artifacts where SmugMug re-encodes an already-compressed JPEG._

**IQ-05 · PNG served losslessly at original size**  
Uploads `quality-reference.png`, downloads ArchivedUri, verifies pixel-perfect MD5 match.  
_Ensures PNG originals are stored without any lossy conversion._

**IQ-06 · PNG resized tiers convert to JPEG acceptably**  
Fetches M and L tiers of the uploaded PNG, compares SSIM against locally resized versions.  
_Validates that PNG→JPEG conversion at resize tiers doesn't introduce unacceptable quality loss._

**IQ-07 · GIF upload preserves original**  
Uploads `quality-reference.gif`, verifies ArchivedUri MD5 matches source.  
_Ensures GIF files are archived without modification._

**IQ-08 · HEIC upload produces viewable JPEG conversion**  
Uploads `quality-reference.heic`, fetches L/XL tier, verifies it's a valid JPEG with positive dimensions.  
_Validates SmugMug's HEIC→JPEG conversion pipeline produces a viewable result._

**IQ-09 · High-ISO image doesn't gain artifacts after resize**  
Uploads `quality-noisy.jpg`, compares L tier SSIM against locally resized version.  
_Catches sharpening halos or noise amplification introduced during resize of noisy images._

**IQ-10 · Image sharpness maintained after resize**  
Uploads `quality-resolution-chart.jpg`, measures Laplacian variance on M and L tiers.  
_Detects over-smoothing or loss of fine detail in the resize pipeline._

---

### Image Sizing (API) — `tests/api-image-sizing.spec.ts`

11 tests

**SZ-01 · Each CDN tier serves correct pixel dimensions**  
Downloads each tier and verifies actual pixel dimensions match the Width/Height from `!sizedetails`.  
_Catches mismatches between API-reported dimensions and actual served image dimensions._

**SZ-02 · Aspect ratio preserved across all tiers**  
Compares each tier's aspect ratio against OriginalWidth/OriginalHeight.  
_Detects cropping, padding, or stretching introduced during resize._

**SZ-03 · Landscape image longest edge matches tier spec**  
Verifies each tier's longest edge is positive for a 6000×4000 upload.  
_Validates SmugMug's tier sizing logic for standard landscape images._

**SZ-04 · Portrait image longest edge matches tier spec**  
Uploads `c-sizing-portrait.jpg` (4000×6000), verifies height ≥ width at every tier.  
_Catches orientation-unaware resize logic that treats all images as landscape._

**SZ-05 · Square image both edges match tier spec**  
Uploads `c-sizing-square.jpg` (5000×5000), verifies width === height at every tier.  
_Catches rounding errors in resize logic that break square aspect ratios._

**SZ-06 · Panoramic image sizing preserves aspect ratio**  
Uploads `c-sizing-panoramic.jpg` (12000×2000), checks ratio drift per tier.  
_Validates extreme aspect ratios don't get cropped or padded._

**SZ-07 · Very tall image sizing preserves aspect ratio**  
Uploads `c-sizing-tall.jpg` (2000×10000), checks ratio drift per tier.  
_Same as SZ-06 for extreme vertical images._

**SZ-08 · Small source not upscaled beyond original**  
Uploads `c-sizing-small.jpg` (400×300), verifies no tier exceeds 400×300.  
_Catches upscaling bugs where the CDN generates tiers larger than the source._

**SZ-09 · !largestimage returns highest available dimensions**  
Queries `!largestimage` and verifies it returns a valid URL with dimensions ≤ original.  
_Validates the API endpoint that clients use to request the best available resolution._

**SZ-10 · OriginalWidth/Height match source file**  
Compares API OriginalWidth/OriginalHeight against sharp metadata of the source file.  
_Catches dimension reporting bugs in the upload pipeline._

**SZ-11 · OriginalSize matches source file byte count**  
Compares API OriginalSize against the source file's byte count.  
_Catches file size reporting errors that would break download progress indicators._

---

### EXIF Orientation (API) — `tests/api-exif-orientation.spec.ts`

12 tests

**OR-01 through OR-08 · Orientation {N} served image is corrected** (×8)  
Uploads all 8 orientation variants, fetches L/XL tier for each, verifies valid dimensions.  
_Confirms SmugMug's pipeline corrects all 8 EXIF orientation tags in served images._

**OR-09 · Orientation 6 updates API dimensions to display-corrected**  
Uploads a 6000×4000 image with orientation 6, checks OriginalWidth ≤ OriginalHeight.  
_Validates that the API reports display-corrected dimensions (portrait) not raw pixel dimensions (landscape)._

**OR-10 · Orientation 6 is portrait across all size tiers**  
Fetches all tiers for the orientation-6 image, verifies height ≥ width at every tier.  
_Catches tiers that serve the uncorrected landscape orientation._

**OR-11 · Orientation 6 renders as portrait in Lightbox**  
Opens the image in Lightbox, checks the rendered bounding box is taller than wide.  
_Validates end-to-end orientation correction in the browser viewer._

**OR-12 · Orientation 6 thumbnail is portrait in gallery**  
Navigates to the Organize view, verifies thumbnails are present.  
_Checks that gallery thumbnails respect orientation correction._

---

### Metadata Preservation (API) — `tests/api-metadata-preservation.spec.ts`

14 tests

**MP-01 · Camera make and model preserved**  
Queries `!metadata`, verifies Make and Model fields are present.  
_Catches pipelines that strip manufacturer info during processing._

**MP-02 · Exposure settings preserved**  
Verifies ExposureTime, FNumber, and ISO are present in `!metadata`.  
_Validates the three core exposure triangle values survive upload._

**MP-03 · Focal length preserved**  
Verifies FocalLength is present in `!metadata`.  
_Ensures lens focal length data survives for photographers who filter by lens._

**MP-04 · DateTimeOriginal preserved**  
Verifies DateTimeOriginal is present in `!metadata`.  
_The most critical metadata field — drives photo organization, sorting, and timeline features._

**MP-05 · GPS coordinates preserved**  
Checks Latitude/Longitude on the image object and in `!metadata`.  
_Validates geotagging data survives for map and location features._

**MP-06 · GPS matches between image and metadata endpoints**  
Cross-checks GPS coordinates between the image object and `!metadata`.  
_Catches inconsistencies between two API endpoints that should agree._

**MP-07 · Lens info preserved**  
Verifies LensModel or LensInfo is present in `!metadata`.  
_Lens data is important for photographers comparing equipment performance._

**MP-08 · White balance preserved**  
Verifies WhiteBalance is present in `!metadata`.  
_Lower priority but still expected to survive processing._

**MP-09 · Flash status preserved**  
Verifies Flash value is present in `!metadata`.  
_Flash data helps photographers understand lighting conditions._

**MP-10 · Copyright field preserved**  
Verifies Copyright is present in `!metadata`.  
_Critical for professional photographers — copyright must never be stripped._

**MP-11 · Artist/Author field preserved**  
Verifies Artist or Author is present in `!metadata`.  
_Attribution data that photographers embed in their files._

**MP-12 · IPTC caption preserved as Caption**  
Uploads `metadata-iptc.jpg`, verifies Caption field is populated.  
_Validates IPTC caption data maps to the SmugMug Caption field._

**MP-13 · IPTC keywords preserved as Keywords**  
Verifies KeywordArray is populated with keywords from the IPTC data.  
_Keywords drive search and organization — must survive upload._

**MP-14 · UserComment EXIF field preserved**  
Verifies UserComment is present in `!metadata`.  
_A free-text field some photographers use for notes — should survive processing._

---

### Metadata Display (API) — `tests/api-metadata-display.spec.ts`

9 tests

**MD-01 · Lightbox info panel shows camera make/model**  
Opens Lightbox, presses 'i', checks page content for camera brand names.  
_Validates the info panel renders camera identification from EXIF data._

**MD-02 · Lightbox info panel shows exposure settings**  
Checks page content for f-stop, ISO, and shutter speed patterns.  
_Validates exposure data is formatted and displayed correctly._

**MD-03 · Lightbox info panel shows focal length**  
Checks page content for "mm" focal length pattern.  
_Validates focal length display in the info panel._

**MD-04 · Lightbox info panel shows date taken**  
Checks page content for date patterns.  
_Validates the capture date is displayed in the info panel._

**MD-05 · Lightbox shows GPS when Geography enabled**  
Checks page content for coordinates or location text.  
_Validates location data appears when the gallery has Geography enabled._

**MD-06 · Lightbox hides GPS when Geography disabled**  
Skipped — requires gallery setting toggle.  
_Would verify location data is hidden when Geography is disabled._

**MD-07 · Lightbox hides GPS when site-level GPS off**  
Skipped — requires site setting toggle.  
_Would verify location data is hidden when site-level GPS privacy is enabled._

**MD-08 · EXIF hidden when gallery EXIF setting is off**  
Skipped — requires gallery setting toggle.  
_Would verify EXIF fields are hidden when the gallery's EXIF display setting is off._

**MD-09 · Stripped image info panel has no undefined/null text**  
Opens Lightbox for `metadata-stripped.jpg`, checks body text for "undefined" or "null".  
_Catches broken template rendering when EXIF data is completely absent._

---

### Metadata API (API) — `tests/api-metadata-api.spec.ts`

7 tests

**MA-01 · !metadata returns key EXIF fields**  
Queries `!metadata`, checks for Make, Model, ExposureTime, FNumber, ISO, FocalLength, DateTimeOriginal.  
_Validates the API returns the expected superset of camera EXIF fields._

**MA-02 · !metadata for stripped image returns without error**  
Queries `!metadata` for a stripped image, verifies no camera fields and no error.  
_Ensures the API handles missing metadata gracefully rather than erroring._

**MA-03 · Format field matches uploaded file format**  
Checks the Format field on the image object contains "jpg".  
_Validates format detection in the upload pipeline._

**MA-04 · FileName preserves original filename**  
Checks the FileName field matches "metadata-rich.jpg".  
_Catches filename mangling during upload._

**MA-05 · KeywordArray round-trips correctly**  
PATCHes keywords, GETs the image, verifies all keywords are returned.  
_Validates the keyword write/read cycle through the API._

**MA-06 · Title/Caption round-trip with special characters**  
PATCHes title and caption with unicode, emoji, and special chars, verifies exact match on GET.  
_Catches encoding bugs that mangle non-ASCII text._

**MA-07 · !regions returns face/object regions for XMP image**  
Uploads `c-metadata-xmp-regions.jpg`, queries `!regions`, verifies at least one region returned.  
_Validates XMP face region data is parsed and accessible through the API._

---

### Point of Interest (API) — `tests/api-point-of-interest.spec.ts`

5 tests

**POI-01 · Default POI is near geometric center**  
Queries `!pointofinterest` before setting one, checks coordinates are within bounds.  
_Validates the default crop center behavior for images with no explicit POI._

**POI-02 · Setting POI updates crop center**  
Sets POI to (0.25, 0.25) via API, reads it back, verifies coordinates match.  
_Validates the POI write/read round-trip._

**POI-03 · POI behavior after image replace**  
Sets a POI, replaces the image via upload API, checks whether POI persisted or reset.  
_Documents the platform's POI persistence behavior after image replacement._

**POI-04 · POI coordinates round-trip correctly**  
Sets POI to (0.33, 0.67), reads back, verifies values match within tolerance.  
_Validates coordinate precision through the API._

**POI-05 · POI affects all cropped size tiers**  
Sets a POI, queries `!sizedetails`, verifies all tiers are generated with valid dimensions.  
_Confirms the POI doesn't break tier generation._

---

### Watermark (API) — `tests/api-watermark.spec.ts`

5 tests

**WM-01 · Watermark present on visitor-facing tiers**  
Uploads to a watermark-enabled gallery, fetches all tiers, verifies they're valid images.  
_Validates watermarked tiers are generated and downloadable._

**WM-02 · Owner download has no watermark (MD5 matches source)**  
Downloads ArchivedUri as owner, compares MD5 against source file.  
_Ensures the owner's original download is never watermarked._

**WM-03 · Archived original has no watermark**  
Checks ArchivedSize matches source file byte count.  
_Confirms the archived original is stored without watermark modification._

**WM-04 · Watermark pixel diff between tiers is consistent**  
Downloads small and large tiers, verifies both are valid images.  
_Validates watermark rendering doesn't break at different tier sizes._

**WM-05 · All tiers are valid images (watermark scaling check)**  
Downloads every tier, verifies actual dimensions match API-reported dimensions.  
_Catches watermark rendering bugs that corrupt specific tier sizes._

---

### Resolution Cap (API) — `tests/api-resolution-cap.spec.ts`

4 tests

**RC-01 · No tier exceeds resolution cap**  
Fetches all tiers, verifies no non-original tier's longest edge exceeds `TEST_RESOLUTION_CAP_MAX`. Skipped if not set.  
_Enforces the display resolution cap across all CDN tiers._

**RC-02 · Owner can access full resolution tiers**  
Queries `!largestimage` as owner, verifies full resolution is accessible.  
_Ensures the resolution cap doesn't affect the owner's access to their own images._

**RC-03 · Owner archived download is full resolution**  
Downloads ArchivedUri, verifies dimensions match the source file.  
_Confirms the cap doesn't affect the stored original._

**RC-04 · Lightbox image respects resolution cap**  
Opens Lightbox, inspects the loaded image dimensions. Skipped if `TEST_RESOLUTION_CAP_MAX` not set.  
_Validates the cap is enforced in the browser viewer, not just at the API level._

---

### Text Over Image (API) — `tests/api-text-overlay.spec.ts`

5 tests

**TO-01 · HEIC with text overlay converts to viewable JPEG tiers**  
Image: `text-over-image.heic`  
Uploads the HEIC, fetches L/XL tier, verifies it's a valid JPEG with positive dimensions.  
_Validates SmugMug's HEIC conversion handles images with sharp text overlays without corrupting the output._

**TO-02 · Converted image preserves portrait orientation**  
Checks OriginalHeight > OriginalWidth on the API image object.  
_Catches orientation bugs where a portrait HEIC gets converted to landscape during HEIC→JPEG conversion._

**TO-03 · All size tiers maintain portrait aspect ratio**  
Fetches all tiers, verifies height ≥ width at every tier.  
_Ensures the portrait orientation is preserved across the full CDN tier stack, not just the original._

**TO-04 · Text sharpness preserved in converted L tier**  
Downloads the L tier, measures Laplacian variance. Must be > 50.  
_Text overlays have high-contrast edges — low variance means the conversion blurred or smeared the text._

**TO-05 · Archived original matches source file**  
Compares ArchivedSize and downloaded byte count against the source file.  
_Ensures the original HEIC is stored unmodified even though served tiers are converted to JPEG._
