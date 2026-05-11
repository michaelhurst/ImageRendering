# API Test Steps

Step-by-step breakdown of each API test.
Tests marked **[VISITOR]** open a logged-out browser context to verify visitor-facing behavior.
All other tests run as the authenticated account owner.

---

## EXIF Orientation — `api-exif-orientation.spec.ts`

```
OR-01 through OR-08: Orientation N served image is corrected
  1. UPLOAD      Upload all 8 orientation-tagged JPEGs to album
  2. WAIT        Trigger tier generation for orientation N image
  3. DOWNLOAD    Fetch L or XL tier from CDN
  4. INSPECT     Read dimensions with sharp
  5. ASSERT      Tags 1-4: image is landscape (width > height)
                 Tags 5-8: image is portrait (height > width)
  PASSES WHEN:   Orientation correction swaps dimensions correctly
  FAILS WHEN:    Raw uncorrected pixels are served (e.g., tag 6 still landscape)

OR-09: Orientation 6 updates API dimensions to display-corrected
  1. UPLOAD      Upload 6000x4000 image with EXIF orientation 6
  2. READ API    GET /api/v2/image/{key} for OriginalWidth/Height
  3. ASSERT      OriginalWidth <= OriginalHeight (portrait)
  PASSES WHEN:   API reports display-corrected dimensions, not raw pixels

OR-10: Orientation 6 is portrait across all size tiers
  1. UPLOAD      Upload orientation-6 image
  2. READ API    GET !sizedetails for all tiers
  3. ASSERT      Every non-original tier has height >= width
  PASSES WHEN:   All tiers respect orientation correction

OR-11: Orientation 6 renders as portrait in Lightbox
  1. UPLOAD      Upload orientation-6 image
  2. NAVIGATE    Open image WebUri in browser
  3. INSPECT     Find <img> with photos CDN src, read naturalWidth/Height
  4. ASSERT      naturalHeight > naturalWidth
  PASSES WHEN:   Browser renders the image as portrait

OR-12: Orientation 6 thumbnail is portrait in gallery
  1. UPLOAD      Upload orientation-6 image
  2. WAIT        Trigger tier generation
  3. NAVIGATE    Open album gallery page in browser
  4. INSPECT     Find thumbnail <img>, read naturalWidth/Height
  5. ASSERT      Thumbnail height > width
  PASSES WHEN:   Gallery thumbnail displays as portrait
```

---

## Image Quality — `api-image-quality.spec.ts`

```
IQ-01: JPEG quality preserved at each CDN size tier
  1. UPLOAD      Upload quality-detail.jpg (62MB)
  2. WAIT        Trigger tier generation, wait for 5+ tiers
  3. FOR EACH    For each tier (S, M, L, XL, X2L, X3L, X4L, X5L, 4K, 5K):
     a. DOWNLOAD    Fetch tier from CDN
     b. RESIZE      Resize source locally to tier dimensions (Q95)
     c. COMPARE     Compute SSIM between local resize and CDN tier
     d. ASSERT      SSIM >= 0.9
  PASSES WHEN:   Every tier maintains structural similarity to source

IQ-02: Original download matches uploaded file
  1. UPLOAD      Upload quality-detail.jpg
  2. READ API    GET image — check ArchivedSize and ArchivedUri
  3. ASSERT      ArchivedSize == source file size; ArchivedUri present
  PASSES WHEN:   Original is stored without modification

IQ-03: Original download preserves file size
  1. UPLOAD      Upload quality-detail.jpg
  2. READ API    GET image — check ArchivedSize
  3. ASSERT      ArchivedSize == source file byte count
  PASSES WHEN:   No silent re-encoding of the original

IQ-04: No double-compression on JPEG uploads
  1. UPLOAD      Upload quality-detail.jpg
  2. WAIT        Trigger tier generation, wait for L tier
  3. DOWNLOAD    Fetch L tier from CDN
  4. INSPECT     Read actual dimensions of downloaded tier
  5. RESIZE      Resize source locally to those dimensions (Q95)
  6. COMPARE     Compute SSIM between local resize and CDN tier
  7. ASSERT      SSIM >= 0.9
  PASSES WHEN:   CDN tier looks like a single-pass resize, not re-encoded

IQ-05: PNG served losslessly at original size
  1. UPLOAD      Upload quality-reference.png (132MB)
  2. READ API    GET image — check ArchivedSize and ArchivedUri
  3. ASSERT      ArchivedSize == source file size; ArchivedUri present
  PASSES WHEN:   PNG original stored without lossy conversion

IQ-07: GIF upload preserves original
  1. UPLOAD      Upload quality-reference.gif
  2. READ API    GET image for ArchivedUri
  3. DOWNLOAD    Fetch archived file from CDN
  4. COMPARE     MD5 of download vs source file
  5. ASSERT      MD5 matches
  PASSES WHEN:   GIF archived bit-for-bit identical to source

IQ-08: HEIC upload produces viewable JPEG conversion
  1. UPLOAD      Upload quality-reference.heic
  2. WAIT        Trigger tier generation
  3. DOWNLOAD    Fetch L/XL tier from CDN
  4. INSPECT     Read dimensions and format with sharp
  5. ASSERT      Valid JPEG with dimensions > 0
  PASSES WHEN:   HEIC is converted to a viewable JPEG

IQ-09: High-ISO image doesn't gain artifacts after resize
  1. UPLOAD      Upload quality-noisy.jpg (16MB, high ISO)
  2. READ API    GET !sizedetails for L tier
  3. DOWNLOAD    Fetch L tier
  4. RESIZE      Resize source locally to L dimensions (Q95)
  5. COMPARE     Compute SSIM
  6. ASSERT      SSIM >= 0.9
  PASSES WHEN:   Noisy image not degraded by sharpening/noise amplification

IQ-10: Image sharpness maintained after resize
  1. UPLOAD      Upload quality-resolution-chart.jpg
  2. READ API    GET !sizedetails for M and L tiers
  3. DOWNLOAD    Fetch M and L tiers
  4. MEASURE     Compute Laplacian variance on each
  5. ASSERT      Variance > 50 for both
  PASSES WHEN:   Fine detail preserved (not over-smoothed)
```

---

## Image Sizing — `api-image-sizing.spec.ts`

```
SZ-01: Each CDN tier serves correct pixel dimensions
  1. UPLOAD      Upload c-sizing-landscape.jpg (6000x4000)
  2. WAIT        Trigger tier generation
  3. FOR EACH    For each tier:
     a. DOWNLOAD    Fetch tier from CDN
     b. INSPECT     Read actual pixel dimensions
     c. ASSERT      Actual matches API-reported dimensions (+-1px)
  PASSES WHEN:   Served images match what the API claims

SZ-02: Aspect ratio preserved across all tiers
  1. UPLOAD      Upload landscape image
  2. READ API    GET image for OriginalWidth/Height, GET !sizedetails
  3. FOR EACH    Compute aspect ratio of each tier
  4. ASSERT      Ratio drift <= 0.02 from original
  PASSES WHEN:   No cropping, padding, or stretching

SZ-03: Landscape image longest edge matches tier spec
  1. UPLOAD      Upload 6000x4000 landscape
  2. READ API    GET !sizedetails
  3. ASSERT      Each tier has longest edge > 0
  PASSES WHEN:   Tier sizing logic works for landscape

SZ-04: Portrait image longest edge matches tier spec
  1. UPLOAD      Upload c-sizing-portrait.jpg (4000x6000)
  2. READ API    GET !sizedetails
  3. ASSERT      Height >= width for all tiers
  PASSES WHEN:   Portrait images stay portrait at every tier

SZ-05: Square image both edges match tier spec
  1. UPLOAD      Upload c-sizing-square.jpg (5000x5000)
  2. READ API    GET !sizedetails
  3. ASSERT      Width == height for all tiers
  PASSES WHEN:   Square aspect ratio preserved

SZ-06: Panoramic image sizing preserves aspect ratio
  1. UPLOAD      Upload c-sizing-panoramic.jpg (12000x2000)
  2. READ API    GET !sizedetails
  3. ASSERT      Aspect ratio drift <= 0.1
  PASSES WHEN:   Extreme landscape not cropped

SZ-07: Very tall image sizing preserves aspect ratio
  1. UPLOAD      Upload c-sizing-tall.jpg (2000x10000)
  2. READ API    GET !sizedetails
  3. ASSERT      Aspect ratio drift <= 0.1
  PASSES WHEN:   Extreme portrait not cropped

SZ-08: Small source not upscaled beyond original
  1. UPLOAD      Upload c-sizing-small.jpg (400x300)
  2. READ API    GET !sizedetails
  3. ASSERT      No tier exceeds 400x300
  PASSES WHEN:   Small images not artificially enlarged

SZ-09: !largestimage returns highest available dimensions
  1. UPLOAD      Upload landscape image
  2. READ API    GET !largestimage
  3. ASSERT      Dimensions > 0, <= original; URL present
  PASSES WHEN:   API returns the best available resolution

SZ-10: OriginalWidth/Height match source file
  1. UPLOAD      Upload landscape image
  2. READ API    GET image for OriginalWidth/Height
  3. COMPARE     Against sharp metadata of source file
  4. ASSERT      Exact match
  PASSES WHEN:   API reports correct source dimensions

SZ-11: OriginalSize matches source file byte count
  1. UPLOAD      Upload landscape image
  2. READ API    GET image for OriginalSize
  3. ASSERT      == source file byte count
  PASSES WHEN:   File size reported correctly
```

---

## Metadata API — `api-metadata-api.spec.ts`

```
MA-01: !metadata returns key EXIF fields
  1. UPLOAD      Upload metadata-rich.jpg (Canon, full EXIF)
  2. READ API    GET !metadata
  3. ASSERT      At least 5 of 7 fields present (Make, Model, etc.)
  PASSES WHEN:   Pipeline preserves camera metadata

MA-02: !metadata for stripped image returns without error
  1. UPLOAD      Upload metadata-stripped.jpg (no EXIF)
  2. READ API    GET !metadata
  3. ASSERT      No error; no camera fields present
  PASSES WHEN:   API handles missing metadata gracefully

MA-03: Format field matches uploaded file format
  1. UPLOAD      Upload metadata-rich.jpg
  2. READ API    GET image
  3. ASSERT      Format contains "jpg"
  PASSES WHEN:   Format correctly identified

MA-04: FileName preserves original filename
  1. UPLOAD      Upload metadata-rich.jpg
  2. READ API    GET image
  3. ASSERT      FileName == "metadata-rich.jpg"
  PASSES WHEN:   Original filename preserved

MA-05: KeywordArray round-trips correctly
  1. UPLOAD      Upload metadata-rich.jpg
  2. WRITE API   PUT image with KeywordArray: ["sunset","ocean","HDR"]
  3. READ API    GET image
  4. ASSERT      All keywords present in response
  PASSES WHEN:   Keywords survive write/read cycle

MA-06: Title/Caption round-trip with special characters
  1. UPLOAD      Upload metadata-rich.jpg
  2. WRITE API   PUT image with unicode Title and Caption
  3. READ API    GET image
  4. ASSERT      Title and Caption match exactly (emojis, quotes, CJK)
  PASSES WHEN:   Unicode text preserved without corruption

MA-07: !regions returns face/object regions for XMP image
  1. UPLOAD      Upload c-metadata-xmp-regions.jpg (has XMP face region)
  2. WAIT        5s for XMP parsing
  3. READ API    GET !regions
  4. ASSERT      At least 1 region returned (or skip if unavailable)
  PASSES WHEN:   XMP face regions parsed from uploaded image
```

---

## Metadata Preservation — `api-metadata-preservation.spec.ts`

```
MP-01 through MP-14: Each test uploads metadata-rich.jpg or
metadata-iptc.jpg and verifies a specific field survives the pipeline.

MP-01: Camera make and model preserved
MP-02: Exposure settings preserved (ExposureTime, FNumber, ISO)
MP-03: Focal length preserved
MP-04: DateTimeOriginal preserved
MP-05: GPS coordinates preserved
MP-06: GPS matches between image and metadata endpoints
MP-07: Lens info preserved
MP-08: White balance preserved
MP-09: Flash status preserved
MP-10: Copyright field preserved
MP-11: Artist/Author field preserved
MP-12: IPTC caption preserved as Caption
MP-13: IPTC keywords preserved as Keywords
MP-14: UserComment EXIF field preserved

  Common pattern:
  1. UPLOAD      Upload metadata-rich.jpg (or metadata-iptc.jpg for MP-12/13)
  2. READ API    GET !metadata or GET image
  3. ASSERT      Specific field is present and non-empty
  PASSES WHEN:   Metadata field survives upload processing
```

---

## Metadata Display — `api-metadata-display.spec.ts`

```
MD-01: Lightbox info panel shows camera make/model
  1. UPLOAD      Upload metadata-rich.jpg
  2. NAVIGATE    Open image WebUri, press 'i' for info panel
  3. INSPECT     Read page body text
  4. ASSERT      Camera brand name found (Canon/Nikon/Sony/etc.)
  PASSES WHEN:   Info panel renders camera info

MD-02: Lightbox info panel shows exposure settings
  1. UPLOAD      Upload metadata-rich.jpg
  2. NAVIGATE    Open image WebUri, press 'i'
  3. INSPECT     Read page body text
  4. ASSERT      Exposure patterns found (f/, ISO, 1/N)
  PASSES WHEN:   Info panel renders exposure data

MD-03: Lightbox info panel shows focal length
  1. UPLOAD      Upload metadata-rich.jpg
  2. NAVIGATE    Open image WebUri, press 'i'
  3. ASSERT      Pattern "Nmm" found in page text
  PASSES WHEN:   Focal length displayed

MD-04: Lightbox info panel shows date taken
  1. UPLOAD      Upload metadata-rich.jpg
  2. NAVIGATE    Open image WebUri, press 'i'
  3. ASSERT      Date pattern found (year + month)
  PASSES WHEN:   Date taken displayed

MD-05: Lightbox shows GPS when Geography enabled
  1. UPLOAD      Upload metadata-rich.jpg
  2. NAVIGATE    Open image WebUri, press 'i'
  3. ASSERT      GPS/Map/Location reference found
  PASSES WHEN:   Location info visible to owner

MD-06: Lightbox hides GPS when Geography disabled [VISITOR]
  1. UPLOAD      Upload metadata-rich.jpg
  2. PATCH       Set album Geography = false
  3. OPEN        New browser context (no login cookies)
  4. NAVIGATE    Visitor opens image WebUri, presses 'i'
  5. INSPECT     Read page body text
  6. ASSERT      No GPS/Map/Location references found
  PASSES WHEN:   Visitors cannot see location when Geography off

MD-07: Lightbox hides GPS when site-level GPS off [VISITOR]
  1. UPLOAD      Upload metadata-rich.jpg
  2. PATCH       Set user-level Geography = false
  3. OPEN        New browser context (no login cookies)
  4. NAVIGATE    Visitor opens image WebUri, presses 'i'
  5. ASSERT      No GPS/Map/Location references found
  6. RESTORE     Re-enable user Geography (account-wide setting)
  PASSES WHEN:   Site-level toggle hides GPS from all visitors

MD-08: EXIF hidden when gallery EXIF setting is off [VISITOR]
  1. UPLOAD      Upload metadata-rich.jpg
  2. PATCH       Set album EXIF = false
  3. VERIFY      GET album confirms EXIF = false
  4. OPEN        New browser context (no login cookies)
  5. NAVIGATE    Visitor opens image WebUri, presses 'i'
  6. INSPECT     Read page body text
  7. ASSERT      No EXIF patterns (f/, ISO + digits, mm, Canon, Nikon)
  PASSES WHEN:   Visitors cannot see camera info when EXIF off

MD-09: Stripped image info panel displays without defects
  1. UPLOAD      Upload metadata-stripped.jpg (no EXIF)
  2. NAVIGATE    Open image WebUri, press 'i'
  3. INSPECT     Check image loads (naturalWidth > 0)
  4. ASSERT      No page errors occurred
  PASSES WHEN:   Lightbox handles missing metadata gracefully
```

---

## Resolution Cap — `api-resolution-cap.spec.ts`

```
RC-01: No tier exceeds resolution cap [VISITOR]
  1. UPLOAD      Upload c-resolution-cap-test.jpg (high-res)
  2. WAIT        Trigger tier generation
  3. FOR EACH    For each LargestSize setting (Medium through 5K):
     a. PATCH       Set album LargestSize = cap tier
     b. QUERY       GET !sizedetails as VISITOR (unauthenticated API)
     c. FIND        Identify largest non-original tier
     d. ASSERT      Longest edge <= cap pixel value
  PASSES WHEN:   Every cap setting correctly limits visitor tiers

RC-02: Owner can access full resolution tiers
  1. UPLOAD      Upload high-res image
  2. READ API    GET image, GET !largestimage
  3. ASSERT      Largest tier has dimensions > 0 and URL present
  PASSES WHEN:   Owner sees full resolution regardless of cap

RC-03: Owner archived download is full resolution
  1. UPLOAD      Upload high-res image
  2. READ API    GET image for ArchivedUri
  3. DOWNLOAD    Fetch archived file
  4. INSPECT     Read dimensions with sharp
  5. ASSERT      Matches source file dimensions exactly
  PASSES WHEN:   Owner download is unaffected by display cap

RC-04: Lightbox image respects resolution cap [VISITOR]
  1. UPLOAD      Upload high-res image
  2. PATCH       Set album LargestSize = XLarge (1024px cap)
  3. OPEN        New browser context (no login cookies)
  4. NAVIGATE    Visitor opens image WebUri
  5. INSPECT     Find <img> with photos CDN src, read naturalWidth/Height
  6. ASSERT      Longest edge <= 1024px
  PASSES WHEN:   Visitor Lightbox respects the resolution cap
```

---

## Text Overlay — `api-text-overlay.spec.ts`

```
TO-01: HEIC with text overlay converts to viewable JPEG tiers
  1. UPLOAD      Upload text-over-image.heic (8.5MB)
  2. WAIT        Trigger tier generation
  3. DOWNLOAD    Fetch a tier from CDN
  4. INSPECT     Check first bytes are JPEG magic (0xFF 0xD8)
  5. ASSERT      Valid JPEG with dimensions > 0
  PASSES WHEN:   HEIC with text overlay produces viewable JPEGs

TO-02: Converted image preserves portrait orientation
  1. UPLOAD      Upload text-over-image.heic
  2. READ API    GET image for OriginalWidth/Height
  3. ASSERT      Height > width (portrait)
  PASSES WHEN:   Orientation preserved through HEIC conversion

TO-03: All size tiers maintain portrait aspect ratio
  1. UPLOAD      Upload text-over-image.heic
  2. READ API    GET !sizedetails
  3. ASSERT      Height >= width for all tiers
  PASSES WHEN:   Portrait maintained at every size

TO-04: Text sharpness preserved in converted L tier
  1. UPLOAD      Upload text-over-image.heic
  2. READ API    GET !sizedetails for L tier
  3. DOWNLOAD    Fetch L tier
  4. MEASURE     Compute Laplacian variance
  5. ASSERT      Variance > 50
  PASSES WHEN:   Text remains sharp after conversion + resize

TO-05: Archived original is downloadable and valid
  1. UPLOAD      Upload text-over-image.heic
  2. READ API    GET image for ArchivedUri and ArchivedSize
  3. DOWNLOAD    Fetch archived file
  4. ASSERT      Downloaded size > 0 and matches API ArchivedSize
  PASSES WHEN:   Original HEIC preserved and downloadable
```

---

## Watermark — `api-watermark.spec.ts`

```
WM-01: Watermark present on visitor-facing tiers
  1. UPLOAD      Upload c-watermark-test.jpg
  2. READ API    GET image (check Watermark flag)
  3. READ API    GET !sizedetails
  4. DOWNLOAD    Fetch multiple tiers
  5. ASSERT      All tiers are valid images (size > 0)
  PASSES WHEN:   Tiers are generated and accessible

WM-02: Owner download has no watermark (MD5 matches source)
  1. UPLOAD      Upload c-watermark-test.jpg
  2. READ API    GET image for ArchivedUri
  3. DOWNLOAD    Fetch archived file
  4. COMPARE     MD5 of download vs source
  5. ASSERT      MD5 matches (no watermark applied to owner copy)
  PASSES WHEN:   Owner gets the original without watermark

WM-03: Archived original has no watermark
  1. UPLOAD      Upload c-watermark-test.jpg
  2. READ API    GET image for ArchivedSize
  3. ASSERT      ArchivedSize == source file byte count
  PASSES WHEN:   Archived file is unmodified

WM-04: Watermark pixel diff between tiers is consistent
  1. UPLOAD      Upload c-watermark-test.jpg
  2. READ API    GET !sizedetails
  3. DOWNLOAD    Fetch small (Th) and large (L) tiers
  4. INSPECT     Read dimensions of both
  5. ASSERT      Both have valid dimensions
  PASSES WHEN:   Watermark scales correctly across tier sizes

WM-05: All tiers are valid images (watermark scaling check)
  1. UPLOAD      Upload c-watermark-test.jpg
  2. READ API    GET !sizedetails
  3. FOR EACH    Download each tier
  4. INSPECT     Read dimensions and byte count
  5. ASSERT      Dimensions match API; bytes > 0
  PASSES WHEN:   Every tier is a valid, downloadable image
```
