# API Test Steps — Detailed Reference

Each test is documented with its purpose, steps, source images, expected values, and what a failure indicates.

Tests marked **[VISITOR]** open a logged-out browser context to verify visitor-facing behavior.
All other tests run as the authenticated account owner.

---

## EXIF Orientation — `api-exif-orientation.spec.ts`

### OR-01 through OR-04: Landscape orientations served correctly

**Purpose:** Verify that images with EXIF orientation tags 1–4 (which don't swap dimensions) are served as landscape after processing.

**Source images:** `Landscape_1-Normal.jpg` through `Landscape_4-Mirrored-vertical.jpg` (400x300 raw pixels, each with a different EXIF orientation tag)

**Steps:**

1. Upload all 8 orientation-tagged JPEGs to a test album
2. For each tag 1–4: trigger tier generation, download L/XL tier
3. Read actual pixel dimensions with sharp
4. Assert width > height (landscape)

**Expected values:** Served tier should be ~400x300 (landscape)

**Failure means:** SmugMug's pipeline is incorrectly swapping dimensions for mirror/180° operations, or not processing the image at all.

---

### OR-05 through OR-08: Portrait orientations served correctly

**Purpose:** Verify that images with EXIF orientation tags 5–8 (which involve 90°/270° rotation) are served as portrait after correction.

**Source images:** `Landscape_5-Mirrored-horizontal-rotated-270-CW.jpg` through `Landscape_8-Rotated-270-CW.jpg` (400x300 raw pixels, but should display as 300x400 portrait)

**Steps:**

1. Same upload as OR-01–04 (shared)
2. For each tag 5–8: trigger tier generation, download L/XL tier
3. Read actual pixel dimensions with sharp
4. Assert height > width (portrait)

**Expected values:** Served tier should be ~450x600 (portrait — dimensions swapped)

**Failure means:** SmugMug is serving the raw uncorrected pixels without applying the 90°/270° rotation. This is the most visible orientation bug — images appear sideways to users.

---

### OR-09: API dimensions are display-corrected

**Purpose:** Verify the API reports dimensions as they appear to users (after orientation correction), not the raw pixel layout.

**Source image:** `c-Landscape_6-Rotated-90-CW-6000x4000.jpg` (6000x4000 raw, orientation 6 = display as 4000x6000 portrait)

**Steps:**

1. Upload the high-res orientation-6 image
2. GET /api/v2/image/{key} for OriginalWidth/OriginalHeight
3. Assert OriginalWidth <= OriginalHeight

**Expected values:** API reports 4000x6000 (portrait), not 6000x4000 (raw landscape)

**Failure means:** API clients relying on OriginalWidth/Height for layout calculations would get wrong dimensions, causing images to be displayed in wrong-sized containers.

---

### OR-10: All tiers are portrait for orientation 6

**Purpose:** Verify every size tier (not just the largest) respects orientation correction.

**Steps:**

1. Upload orientation-6 image
2. GET !sizedetails for all tiers
3. Assert height >= width for every non-original tier

**Expected values:** Every tier from Ti through 5K should be portrait

**Failure means:** Some tiers are generated without orientation correction — users would see correct orientation at one size but wrong at another.

---

### OR-11: Lightbox renders portrait

**Purpose:** End-to-end browser verification that the Lightbox displays the image in the correct orientation.

**Steps:**

1. Upload orientation-6 image
2. Navigate to image WebUri in browser
3. Find the rendered `<img>` element
4. Read naturalWidth/naturalHeight
5. Assert naturalHeight > naturalWidth

**Failure means:** Even if the API and CDN serve correct dimensions, the browser/Lightbox JavaScript might override or ignore them.

---

### OR-12: Gallery thumbnail is portrait

**Purpose:** Verify orientation correction applies to gallery thumbnails, not just Lightbox views.

**Steps:**

1. Upload orientation-6 image, wait for tier generation
2. GET album WebUri, navigate to gallery page
3. Click image to enter Lightbox (if needed)
4. Find thumbnail `<img>`, read naturalWidth/naturalHeight
5. Assert height > width

**Failure means:** Gallery grid would show sideways thumbnails even though the full-size image is correct.

---

## Image Quality — `api-image-quality.spec.ts`

### IQ-01: JPEG quality preserved at each CDN size tier

**Purpose:** Verify SmugMug's resize pipeline doesn't introduce unacceptable quality loss at any tier.

**Source image:** `quality-detail.jpg` (62MB, high-detail photograph)

**Steps:**

1. Upload source image
2. Wait for all tiers to generate (5+ tiers)
3. For each tier (S through 5K, skipping Ti/Th/O):
   - Download the tier from CDN
   - Resize source locally to the same dimensions at Q95
   - Compute SSIM between local resize and CDN tier
   - Assert SSIM >= 0.9

**Expected values:** SSIM typically 0.998–0.999 per tier

**Failure means:** A specific tier size is being over-compressed, has artifacts, or is serving wrong content. SSIM below 0.9 indicates visible degradation.

---

### IQ-02: Original download matches uploaded file

**Purpose:** Verify the archived original is stored bit-for-bit without modification.

**Source image:** `quality-detail.jpg` (62MB)

**Steps:**

1. Upload source image
2. GET image — read ArchivedSize and ArchivedUri
3. Assert ArchivedSize == source file byte count (62,519,806 bytes)
4. Assert ArchivedUri is present

**Failure means:** SmugMug is silently re-encoding or modifying the original file during upload, which would alter the photographer's master copy.

---

### IQ-04: No double-compression on JPEG uploads

**Purpose:** Detect if SmugMug re-encodes an already-compressed JPEG (causing generation loss).

**Source image:** `quality-detail.jpg`

**Steps:**

1. Upload source, wait for L tier
2. Download L tier, read its actual dimensions
3. Resize source locally to those exact dimensions at Q95 (single compression)
4. Compute SSIM between single-pass local and CDN tier
5. Assert SSIM >= 0.9

**Expected values:** SSIM ~0.999 (CDN tier should look like a single resize, not double-encoded)

**Failure means:** The pipeline is decoding the JPEG, then re-encoding it (double compression), introducing cumulative artifacts visible as blocking and color banding.

---

### IQ-05: PNG served losslessly at original size

**Purpose:** Verify PNG originals are stored without lossy conversion.

**Source image:** `quality-reference.png` (132MB, lossless)

**Steps:**

1. Upload PNG
2. GET image — read ArchivedSize
3. Assert ArchivedSize == source file byte count

**Failure means:** The pipeline is converting PNG to JPEG or re-encoding it, destroying the lossless quality photographers expect when uploading PNG.

---

### IQ-07: GIF upload preserves original

**Purpose:** Verify GIF files are archived without modification (important for animated GIFs).

**Source image:** `quality-reference.gif` (22KB)

**Steps:**

1. Upload GIF
2. GET image for ArchivedUri
3. Download archived file
4. Compute MD5 of download and source
5. Assert MD5 matches

**Failure means:** GIF is being re-encoded or converted, which would break animations or alter the palette.

---

### IQ-08: HEIC upload produces viewable JPEG conversion

**Purpose:** Verify HEIC files (iPhone format) are converted to viewable JPEGs for browsers that don't support HEIC.

**Source image:** `quality-reference.heic` (2.3MB)

**Steps:**

1. Upload HEIC, wait for tier generation
2. Download L/XL tier
3. Verify JPEG magic bytes (0xFF 0xD8)
4. Read dimensions — assert > 0
5. If local HEIC decode available: compute SSIM against locally-converted reference, assert >= 0.9

**Expected values:** Valid JPEG at ~450x600 (portrait HEIC)

**Failure means:** HEIC conversion is broken — iPhone photos would show as broken images or error pages to visitors.

---

### IQ-09: High-ISO image doesn't gain artifacts after resize

**Purpose:** Verify the resize pipeline doesn't amplify noise or add sharpening halos to noisy images.

**Source image:** `quality-noisy.jpg` (16MB, shot at high ISO with visible grain)

**Steps:**

1. Upload noisy image
2. Get L tier dimensions, download it
3. Resize source locally to same dimensions
4. Compute SSIM
5. Assert >= 0.9

**Expected values:** SSIM ~0.999

**Failure means:** The resize algorithm is applying sharpening that amplifies noise, or denoising that destroys detail. Both are visible to photographers.

---

### IQ-10: Image sharpness maintained after resize

**Purpose:** Verify fine detail (text, lines, edges) survives the resize pipeline.

**Source image:** `quality-resolution-chart.jpg` (1.3MB, fine-line resolution chart)

**Steps:**

1. Upload resolution chart
2. Download M and L tiers
3. Compute Laplacian variance (edge detection metric) on each
4. Assert variance > 500

**Expected values:** M ~9300, L ~8600 (high detail)

**Failure means:** The resize algorithm is over-smoothing, applying too much anti-aliasing, or the image is being served at wrong quality settings. Values below 500 indicate severe blurring.

---

## Image Sizing — `api-image-sizing.spec.ts`

### SZ-01: Each CDN tier serves correct pixel dimensions

**Purpose:** Verify the actual served image pixels match what the API claims.

**Source image:** `c-sizing-landscape.jpg` (6000x4000)

**Steps:**

1. Upload landscape image
2. GET !sizedetails for all tiers
3. For each tier: download, read actual dimensions with sharp
4. Assert actual matches API-reported (±1px for rounding)

**Expected values:** Ti=100x67, Th=150x100, S=400x267, M=600x400, L=800x533, etc.

**Failure means:** The API is reporting wrong dimensions (breaking client layout calculations) or the CDN is serving wrong-sized images.

---

### SZ-02: Aspect ratio preserved across all tiers

**Purpose:** Detect cropping, padding, or stretching introduced during resize.

**Source image:** `c-sizing-landscape.jpg` (aspect ratio 1.5:1)

**Steps:**

1. Upload, get original aspect ratio from API
2. GET !sizedetails, compute ratio for each tier
3. Assert ratio drift <= 0.02 from original (skip square-cropped Ti/Th)

**Failure means:** Some tiers are being cropped to a different aspect ratio or padded with borders, distorting the photographer's composition.

---

### SZ-03: Landscape image longest edge matches tier spec

**Purpose:** Verify each tier is sized to SmugMug's documented tier specifications.

**Source image:** `c-sizing-landscape.jpg` (6000x4000)

**Steps:**

1. Upload landscape image
2. GET !sizedetails
3. For each tier, compare longest edge to expected spec (±1px)

**Expected values:** Ti=100, Th=150, S=400, M=600, L=800, XL=1024, X2L=1280, X3L=1600, X4L=2048, X5L=2560, 4K=3840, 5K=5120

**Failure means:** Tier generation is using wrong target dimensions, which would affect all images on the platform.

---

### SZ-04: Portrait image stays portrait at every tier

**Source image:** `c-sizing-portrait.jpg` (4000x6000)

**Steps:** Upload, GET !sizedetails, assert height >= width for all tiers

**Failure means:** Resize logic is orientation-unaware and treats all images as landscape.

---

### SZ-05: Square image stays square at every tier

**Source image:** `c-sizing-square.jpg` (5000x5000)

**Steps:** Upload, GET !sizedetails, assert width == height for all tiers

**Failure means:** Rounding errors in resize logic break 1:1 aspect ratios (e.g., 600x599).

---

### SZ-06: Panoramic image preserves aspect ratio

**Source image:** `c-sizing-panoramic.jpg` (12000x2000, ratio 6:1)

**Steps:** Upload, check ratio drift <= 0.1 across tiers

**Failure means:** Extreme aspect ratios are being cropped or padded to fit standard dimensions.

---

### SZ-07: Very tall image preserves aspect ratio

**Source image:** `c-sizing-tall.jpg` (2000x10000, ratio 1:5)

**Steps:** Same as SZ-06 for extreme portrait

**Failure means:** Same as SZ-06 but for vertical images.

---

### SZ-08: Small source not upscaled beyond original

**Source image:** `c-sizing-small.jpg` (400x300)

**Steps:** Upload, GET !sizedetails, assert no tier exceeds 400x300

**Failure means:** The CDN is generating tiers larger than the source, creating blurry upscaled versions that look worse than the original.

---

### SZ-09: !largestimage returns the actual largest tier

**Purpose:** Verify the API endpoint clients use to request "best available" actually returns the largest.

**Steps:**

1. Upload landscape image
2. GET !largestimage — note dimensions
3. GET !sizedetails — find the actual largest non-original tier
4. Assert no tier is larger than what !largestimage reported

**Expected values:** !largestimage returns 5120x3413 (5K tier)

**Failure means:** Clients requesting the best available resolution would get a smaller image than what's actually available.

---

### SZ-10: OriginalWidth/Height match source file

**Steps:** Upload, compare API OriginalWidth/Height against sharp metadata of source

**Expected values:** 6000x4000

**Failure means:** Dimension reporting bug — clients would calculate wrong layouts.

---

### SZ-11: OriginalSize matches source file byte count

**Steps:** Upload, compare API OriginalSize against fs.statSync byte count

**Failure means:** File size reporting error — download progress indicators would be wrong.

---

## Metadata API — `api-metadata-api.spec.ts`

### MA-01: !metadata returns all key EXIF fields

**Purpose:** Verify the metadata API returns the complete set of camera fields photographers expect.

**Source image:** `metadata-rich.jpg` (Canon EOS 6D Mark II, full EXIF)

**Steps:**

1. Upload image
2. GET !metadata
3. Check for each field using alternate key names:
   - Make (or CameraMake)
   - Model (or CameraModel)
   - ExposureTime (or Exposure, ShutterSpeed)
   - FNumber (or Aperture, ApertureValue, FStop)
   - ISO (or ISOSpeedRatings, ISOSpeed)
   - FocalLength
   - DateTimeOriginal (or DateCreated, CreateDate, DateTaken)
4. Assert all 7 fields present

**Expected values:** Make=Canon, Model=EOS 6D Mark II, ExposureTime=30, ISO=100, FocalLength=105

**Failure means:** The metadata parsing pipeline is dropping fields, which would show blank entries in the photo info panel.

---

### MA-02: Stripped image returns without error

**Source image:** `metadata-stripped.jpg` (no EXIF data)

**Steps:** Upload, GET !metadata, assert no camera fields present

**Failure means:** API crashes or returns errors when metadata is missing instead of gracefully returning empty.

---

### MA-03–MA-06: Format, filename, keywords, title/caption round-trip

These test basic API field accuracy and write/read cycles. High confidence — exact string/array matching.

---

### MA-07: XMP regions parsed from uploaded image

**Purpose:** Verify SmugMug parses XMP face/object region data embedded in images.

**Source image:** `c-metadata-xmp-regions.jpg` (contains XMP region: "Test Face" at center)

**Steps:**

1. Upload image, wait 5s for parsing
2. GET !regions
3. If regions returned: assert Type == "Face"
4. If no regions: gracefully skip

**Expected values:** 1 region with Type="Face"

**Failure means:** XMP region parsing is broken — face tagging and people search features won't work for images with embedded face data.

---

## Metadata Preservation — `api-metadata-preservation.spec.ts`

### MP-01 through MP-14: Value comparison against source EXIF

**Purpose:** Verify each metadata field survives the upload pipeline with correct values (not just existence).

**Source images:** `metadata-rich.jpg` (MP-01–11, MP-14), `metadata-iptc.jpg` (MP-12–13)

**Method:** Each test reads the source file's EXIF locally with `exifr`, uploads to SmugMug, then compares the API-returned value against the local value.

| Test  | Field                  | Comparison                   | Expected                |
| ----- | ---------------------- | ---------------------------- | ----------------------- |
| MP-01 | Make, Model            | Case-insensitive contains    | Canon, EOS 6D Mark II   |
| MP-02 | ExposureTime, ISO      | Numeric match                | 30s, ISO 100            |
| MP-03 | FocalLength            | Numeric (±1)                 | 105mm                   |
| MP-04 | DateTimeOriginal       | Year/month/day match         | 2021-05-04              |
| MP-05 | GPS Latitude/Longitude | toBeCloseTo (4 decimals)     | 37.6779, -119.7364      |
| MP-06 | GPS cross-validation   | Image endpoint vs !metadata  | Must agree within 0.01° |
| MP-07 | LensModel              | Focal length numbers present | 24-105mm                |
| MP-08 | WhiteBalance           | Defined                      | Auto/Daylight           |
| MP-09 | Flash                  | Defined                      | Did not fire            |
| MP-10 | Copyright              | Exact match                  | ©2021 Chris Skopec      |
| MP-11 | Artist                 | Exact match                  | CHRIS SKOPEC            |
| MP-12 | IPTC Caption           | Contains source caption      | "Good girl. Good."      |
| MP-13 | IPTC Keywords          | All source keywords present  | Lab, ball, dog, grass   |
| MP-14 | UserComment            | Contains source comment      | (if present in source)  |

**Failure means:** The upload pipeline is stripping, corrupting, or altering specific metadata fields. Photographers lose their copyright info, GPS data, or camera settings.

---

## Metadata Display — `api-metadata-display.spec.ts`

### MD-01 through MD-05: Lightbox info panel shows metadata

**Purpose:** Verify the browser Lightbox actually renders metadata to users (not just that the API has it).

**Source image:** `metadata-rich.jpg`

**Steps (common):**

1. Upload image
2. Navigate to image WebUri
3. Wait for page load, click image to enter Lightbox
4. Press 'i' to open info panel, wait 2s
5. Read page body text
6. Assert specific patterns found

| Test  | Pattern                                       | What it catches                 |
| ----- | --------------------------------------------- | ------------------------------- |
| MD-01 | "Canon", "EOS", "Nikon", "Sony"               | Camera brand not displayed      |
| MD-02 | `f/N`, `ISO NNN`, `1/N`                       | Exposure settings not displayed |
| MD-03 | `Nmm`                                         | Focal length not displayed      |
| MD-04 | "2021", "May", "05/04"                        | Date taken not displayed        |
| MD-05 | "Map", "Location", decimal coords, "Yosemite" | GPS/location not displayed      |

**Failure means:** The Lightbox JavaScript isn't rendering the info panel correctly, or the 'i' shortcut isn't working, or metadata isn't being passed to the frontend.

---

### MD-06: GPS hidden from visitors when Geography disabled [VISITOR]

**Purpose:** Verify the Geography album setting actually hides location data from non-owners.

**Steps:**

1. Upload GPS-tagged image
2. PATCH album: `{ Geography: false }`
3. Open new browser context (no login cookies, just HTTP Basic Auth for inside)
4. Navigate to image, click into Lightbox, press 'i'
5. Assert NO GPS/Map/Location text found

**Failure means:** Privacy setting isn't being enforced — visitors can see the photographer's location even when they've disabled it.

---

### MD-07: GPS hidden when site-level Geography off [VISITOR]

**Purpose:** Same as MD-06 but for the account-wide setting.

**Steps:** Same as MD-06 but patches user-level Geography instead of album-level. Restores setting after test (account-wide).

---

### MD-08: EXIF hidden from visitors when EXIF disabled [VISITOR]

**Purpose:** Verify the EXIF album setting hides camera info from non-owners.

**Steps:**

1. Upload metadata-rich image
2. PATCH album: `{ EXIF: false }`
3. Verify setting applied (GET album confirms EXIF=false)
4. Open visitor browser context
5. Navigate to Lightbox, press 'i'
6. Assert NO EXIF patterns found (`f/N`, `ISO NNN`, `Nmm`, camera brands)
   - Uses `ISO\s+\d{2,}` to avoid false-matching "ISO8601" in page JS

**Failure means:** Camera info is visible to visitors even when the photographer has disabled it — privacy violation.

---

### MD-09: Stripped image doesn't cause errors

**Purpose:** Verify the Lightbox handles images with no metadata gracefully (no JS errors, no broken UI).

**Source image:** `metadata-stripped.jpg` (no EXIF at all)

**Steps:**

1. Register page error listener BEFORE navigation
2. Upload stripped image, navigate to Lightbox
3. Verify image loads (naturalWidth > 0)
4. Assert zero page errors captured

**Failure means:** Missing metadata causes JavaScript exceptions, breaking the viewer for images without EXIF.

---

## Resolution Cap — `api-resolution-cap.spec.ts`

### RC-01: All LargestSize settings correctly cap visitor tiers [VISITOR]

**Purpose:** Verify every possible resolution cap setting is enforced for visitors.

**Source image:** `c-resolution-cap-test.jpg` (6000x4000, 15.6MB)

**Steps:**

1. Upload high-res image, wait for all tiers
2. Create visitor API client (unauthenticated, API key only)
3. For each of 9 cap settings (Medium through 5K):
   - PATCH album LargestSize
   - GET !sizedetails as visitor
   - Find largest non-original tier
   - Assert longest edge <= cap pixel value

**Expected values:**
| Setting | Max pixels | Visitor should see |
|---------|-----------|-------------------|
| Medium | 600 | M tier max |
| Large | 800 | L tier max |
| XLarge | 1024 | XL tier max |
| X2Large | 1280 | X2L tier max |
| ... | ... | ... |
| 5K | 5120 | 5K tier max |

**Failure means:** Resolution cap isn't being enforced — visitors can access higher-resolution images than the photographer intended, potentially enabling unauthorized prints or downloads.

---

### RC-02: Owner can download full resolution despite cap

**Purpose:** Verify the cap only affects visitors, not the image owner.

**Steps:**

1. Upload high-res image
2. PATCH album LargestSize = Medium (600px cap)
3. GET image — verify OriginalWidth > 600
4. Download ArchivedUri — verify dimensions match source exactly

**Expected values:** Archived download is 6000x4000 regardless of 600px display cap

**Failure means:** The cap is incorrectly applied to owners, preventing them from accessing their own full-resolution images.

---

### RC-03: Owner archived download is full resolution

**Purpose:** Verify the archived original download matches the source file exactly.

**Steps:**

1. Upload, GET image for ArchivedUri
2. Download archived file
3. Read dimensions with sharp
4. Assert matches source file dimensions

**Failure means:** The archive pipeline is resizing or re-encoding originals.

---

### RC-04: Lightbox respects cap for visitors [VISITOR]

**Purpose:** End-to-end browser verification that visitors see capped images in the Lightbox.

**Steps:**

1. Upload high-res image
2. PATCH album LargestSize = XLarge (1024px cap)
3. Open visitor browser context
4. Navigate to image WebUri
5. Find rendered `<img>`, read naturalWidth/naturalHeight
6. Assert longest edge <= 1024

**Failure means:** The Lightbox is loading a higher-resolution image than the cap allows, bypassing the restriction at the browser level.

---

## Text Overlay — `api-text-overlay.spec.ts`

### TO-01: HEIC with text overlay converts to viewable JPEG

**Purpose:** Verify HEIC files containing text overlays are correctly converted to JPEG.

**Source image:** `text-over-image.heic` (8.5MB, portrait HEIC with text)

**Steps:**

1. Upload HEIC, wait for tier generation
2. Download a tier
3. Verify JPEG magic bytes (0xFF 0xD8)
4. Assert dimensions > 0

**Failure means:** HEIC conversion fails for images with text overlays — these would show as broken images.

---

### TO-02: Converted image preserves portrait orientation

**Steps:** Upload HEIC, GET image, assert height > width

**Failure means:** Orientation lost during HEIC→JPEG conversion.

---

### TO-03: All tiers maintain portrait aspect ratio

**Steps:** Upload HEIC, GET !sizedetails, assert height >= width for all tiers

**Failure means:** Some tiers lose orientation during conversion.

---

### TO-04: Text sharpness preserved in converted L tier

**Purpose:** Verify text remains readable after HEIC conversion + resize.

**Steps:**

1. Upload HEIC, get L tier
2. Download, compute Laplacian variance
3. Assert variance > 500

**Expected values:** Variance ~2445

**Failure means:** Text is blurred during conversion — screenshots, documents, or text-heavy images become unreadable.

---

### TO-05: Archived original is downloadable and valid

**Steps:** Upload HEIC, GET image, download ArchivedUri, assert size matches API ArchivedSize

**Failure means:** Original HEIC file is corrupted or inaccessible after upload.

---

## Watermark — `api-watermark.spec.ts`

### WM-01: Watermark present on visitor-facing tiers [VISITOR]

**Purpose:** Verify watermarks are actually applied to images visitors see.

**Source image:** `c-watermark-test.jpg` (254KB)

**Steps:**

1. Upload image
2. PATCH album: `{ Watermark: true }`
3. Download L tier as owner (clean copy)
4. Download same tier as visitor (unauthenticated API)
5. Compare MD5 hashes
6. Assert they differ (watermark applied)

**Failure means:** Watermarks silently stopped being applied — visitors can download unwatermarked images, defeating the photographer's protection.

---

### WM-02: Owner download has no watermark

**Purpose:** Verify the owner's archived copy is clean (no watermark burned in).

**Steps:** Upload, download ArchivedUri, MD5 compare against source

**Expected values:** MD5 matches exactly

**Failure means:** Watermark is being permanently burned into the original file, destroying the photographer's master copy.

---

### WM-03: Archived size matches source

**Steps:** Upload, assert ArchivedSize == source byte count

**Failure means:** Original file modified during storage.

---

### WM-04: Watermark applied at both small and large sizes [VISITOR]

**Purpose:** Verify watermark scales correctly — present on both thumbnails and large views.

**Steps:**

1. Upload, enable watermark
2. Download Th/S tier as owner and visitor — compare MD5
3. Download L/XL tier as owner and visitor — compare MD5
4. Assert both sizes differ (watermarked)

**Failure means:** Watermark only applies at certain sizes — visitors could access unwatermarked versions by requesting a specific tier.

---

### WM-05: All tiers have watermark applied [VISITOR]

**Purpose:** Comprehensive check that every visitor-facing tier has the watermark.

**Steps:**

1. Upload, enable watermark
2. For each non-original tier:
   - Download as owner and visitor
   - Compare MD5
   - Log whether watermarked
3. Assert at least some tiers are watermarked

**Failure means:** Specific tiers are missing watermarks, creating a bypass path for visitors.
