# Requirements Document

## Introduction

Automated test suite to verify that SmugMug correctly preserves and displays image quality, color accuracy, pixel dimensions, EXIF orientation, and metadata across all CDN size tiers, gallery views, and privacy contexts. The suite uses Playwright for UI tests and the SmugMug API v2 for data-level verification.

---

## Requirements

### Requirement 1: Image Quality & Compression

**User Story:** As a SmugMug photographer, I want my uploaded images to be served at high quality across all size tiers, so that my work looks sharp and faithful to the originals in every context.

#### Acceptance Criteria

1. WHEN a JPEG is uploaded and each CDN size tier (Ti, Th, S, M, L, XL, Original) is fetched THE SYSTEM SHALL serve images with SSIM ≥ 0.92 compared to a locally resized reference at the same dimensions
2. WHEN a JPEG is uploaded and the original is fetched via ArchivedUri THE SYSTEM SHALL return a file whose MD5 matches the source file byte-for-byte AND whose ArchivedMD5 field matches the source MD5
3. WHEN a JPEG is uploaded THE SYSTEM SHALL report an ArchivedSize and OriginalSize that match the source file's byte count exactly
4. WHEN a JPEG at known quality (Q95) is uploaded and the largest non-original tier is fetched THE SYSTEM SHALL serve an image with SSIM ≥ 0.90 compared to a single-pass locally resized reference, indicating no double-compression
5. WHEN a PNG is uploaded and the original is fetched via ArchivedUri THE SYSTEM SHALL return a pixel-perfect match against the source file
6. WHEN a PNG is uploaded and the M or L tier is fetched THE SYSTEM SHALL serve a JPEG conversion with SSIM ≥ 0.92 against a locally resized reference
7. WHEN a GIF is uploaded and the original is fetched via ArchivedUri THE SYSTEM SHALL return a file whose MD5 matches the source
8. WHEN a HEIC is uploaded THE SYSTEM SHALL produce viewable JPEG tiers with valid dimensions greater than 0
9. WHEN a high-ISO noisy image is uploaded and the L tier is fetched THE SYSTEM SHALL serve an image with SSIM ≥ 0.88 against a locally resized reference, indicating no amplification of noise
10. WHEN an image containing fine detail (resolution chart) is uploaded and the M and L tiers are fetched THE SYSTEM SHALL serve images with Laplacian variance ≥ 50, indicating preserved sharpness

---

### Requirement 2: Color Accuracy & Profiles

**User Story:** As a SmugMug photographer, I want my images' colors to be accurately preserved after upload and processing, so that my color-critical work (prints, portfolios) is faithfully represented.

#### Acceptance Criteria

1. WHEN an sRGB image with known color sample points is uploaded and the L tier is fetched THE SYSTEM SHALL return pixels at reference coordinates with Delta-E < 5
2. WHEN an Adobe RGB-tagged image is uploaded and the L tier is fetched THE SYSTEM SHALL return pixels at reference coordinates with Delta-E within acceptable range (< 10) after sRGB conversion
3. WHEN a ProPhoto RGB-tagged image is uploaded and the L tier is fetched THE SYSTEM SHALL map wide-gamut colors gracefully with Delta-E < 10 at reference coordinates
4. WHEN an image with a custom embedded ICC profile is uploaded THE SYSTEM SHALL either preserve the ICC profile or convert to sRGB
5. WHEN an image with no ICC profile (untagged) is uploaded THE SYSTEM SHALL treat it as sRGB, producing SSIM ≥ 0.98 compared to the same image with an explicit sRGB tag
6. WHEN a CMYK JPEG is uploaded THE SYSTEM SHALL convert it to RGB/sRGB and serve a viewable image (not inverted or wildly wrong)
7. WHEN a 16-bit TIFF or PNG with smooth gradients is uploaded THE SYSTEM SHALL convert to 8-bit JPEG without visible banding (gradient smoothness stdDev < 3.0)
8. WHEN an image with pure black (0,0,0) and pure white (255,255,255) pixels is uploaded THE SYSTEM SHALL preserve both endpoints with Delta-E < 8 at reference coordinates
9. WHEN an 11-step grayscale ramp is uploaded THE SYSTEM SHALL preserve each step's luminance within ±5 of expected values
10. WHEN an image with saturated R, G, B, C, M, Y patches is uploaded THE SYSTEM SHALL preserve each patch with Delta-E < 10

---

### Requirement 3: Image Dimensions & Sizing

**User Story:** As a SmugMug photographer, I want all size tiers to have correct pixel dimensions and preserved aspect ratios, so that my images are never distorted or incorrectly cropped.

#### Acceptance Criteria

1. WHEN an image is uploaded and each CDN size tier's URL is fetched THE SYSTEM SHALL serve images whose actual pixel dimensions match the Width and Height reported in the !sizedetails API response
2. WHEN an image is uploaded and each tier is fetched THE SYSTEM SHALL preserve the original aspect ratio within ±0.02 across all tiers
3. WHEN a landscape image (e.g., 6000×4000) is uploaded THE SYSTEM SHALL cap the longest edge (width) at each tier's documented maximum
4. WHEN a portrait image (e.g., 4000×6000) is uploaded THE SYSTEM SHALL cap the longest edge (height) at each tier's documented maximum
5. WHEN a square image (e.g., 5000×5000) is uploaded THE SYSTEM SHALL serve square tiers with both edges equal at each tier's maximum
6. WHEN a panoramic image (e.g., 12000×2000) is uploaded THE SYSTEM SHALL preserve the extreme landscape aspect ratio (>4:1) across all tiers
7. WHEN a very tall image (e.g., 2000×10000) is uploaded THE SYSTEM SHALL preserve the extreme portrait aspect ratio (>3:1) across all tiers
8. WHEN a small source image (e.g., 400×300) is uploaded THE SYSTEM SHALL NOT upscale any tier beyond the source dimensions
9. WHEN !largestimage is queried for a high-res upload THE SYSTEM SHALL return dimensions that are greater than 0 and less than or equal to OriginalWidth/OriginalHeight
10. WHEN an image is uploaded THE SYSTEM SHALL report OriginalWidth and OriginalHeight that match the source file's dimensions exactly
11. WHEN an image is uploaded THE SYSTEM SHALL report an OriginalSize that matches the source file's byte count exactly

---

### Requirement 4: EXIF Orientation

**User Story:** As a SmugMug photographer, I want images shot in any orientation (including phone-portrait) to display correctly upright, so that viewers never see sideways or flipped images.

#### Acceptance Criteria

1. WHEN an image with EXIF orientation tag 1 (normal) is uploaded THE SYSTEM SHALL serve a correctly oriented image matching the ground truth reference (SSIM ≥ 0.90)
2. WHEN an image with EXIF orientation tag 2 (mirrored horizontal) is uploaded THE SYSTEM SHALL correct the mirror and serve an upright image (SSIM ≥ 0.90 vs ground truth)
3. WHEN an image with EXIF orientation tag 3 (rotated 180°) is uploaded THE SYSTEM SHALL rotate 180° and serve an upright image (SSIM ≥ 0.90 vs ground truth)
4. WHEN an image with EXIF orientation tag 4 (mirrored vertical) is uploaded THE SYSTEM SHALL correct and serve an upright image (SSIM ≥ 0.90 vs ground truth)
5. WHEN an image with EXIF orientation tag 5 (mirrored + 90° CW) is uploaded THE SYSTEM SHALL correct and serve an upright image (SSIM ≥ 0.90 vs ground truth)
6. WHEN an image with EXIF orientation tag 6 (rotated 90° CW — phone portrait) is uploaded THE SYSTEM SHALL rotate and serve an upright image (SSIM ≥ 0.90 vs ground truth)
7. WHEN an image with EXIF orientation tag 7 (mirrored + 90° CCW) is uploaded THE SYSTEM SHALL correct and serve an upright image (SSIM ≥ 0.90 vs ground truth)
8. WHEN an image with EXIF orientation tag 8 (rotated 90° CCW) is uploaded THE SYSTEM SHALL rotate and serve an upright image (SSIM ≥ 0.90 vs ground truth)
9. WHEN a landscape-pixel image (6000×4000) with orientation tag 6 is uploaded THE SYSTEM SHALL report OriginalWidth < OriginalHeight (display-corrected portrait dimensions)
10. WHEN an orientation-6 image is uploaded and all tiers (Ti through XL) are fetched THE SYSTEM SHALL serve portrait-oriented images (height > width) at every tier
11. WHEN an orientation-6 image is viewed in Lightbox THE SYSTEM SHALL render it in portrait orientation
12. WHEN an orientation-6 image is viewed in the Organizer THE SYSTEM SHALL render the thumbnail in portrait orientation

---

### Requirement 5: Metadata Preservation

**User Story:** As a SmugMug photographer, I want all my EXIF, IPTC, and XMP metadata preserved after upload, so that camera settings, GPS data, copyright, and keywords are available in the API and UI.

#### Acceptance Criteria

1. WHEN an image with known EXIF Make and Model is uploaded THE SYSTEM SHALL return matching Make and Model in the !metadata response
2. WHEN an image with known exposure settings is uploaded THE SYSTEM SHALL return matching ExposureTime, FNumber, and ISO in !metadata
3. WHEN an image with known focal length is uploaded THE SYSTEM SHALL return matching FocalLength and FocalLengthIn35mmFilm in !metadata
4. WHEN an image with known DateTimeOriginal is uploaded THE SYSTEM SHALL return matching DateTimeOriginal in !metadata
5. WHEN a geotagged image is uploaded THE SYSTEM SHALL return matching Latitude, Longitude, and Altitude on the image endpoint
6. WHEN a geotagged image is uploaded THE SYSTEM SHALL return consistent GPS values between the image endpoint and !metadata
7. WHEN an image with known LensModel is uploaded THE SYSTEM SHALL return matching lens info in !metadata
8. WHEN an image with a WhiteBalance value is uploaded THE SYSTEM SHALL preserve the WhiteBalance in !metadata
9. WHEN an image with a Flash value is uploaded THE SYSTEM SHALL preserve the Flash field in !metadata
10. WHEN an image with a Copyright field is uploaded THE SYSTEM SHALL return matching Copyright in !metadata
11. WHEN an image with an Artist field is uploaded THE SYSTEM SHALL return matching Artist in !metadata
12. WHEN an image with IPTC caption data is uploaded THE SYSTEM SHALL populate the image Caption field with the IPTC caption
13. WHEN an image with IPTC keywords is uploaded THE SYSTEM SHALL populate KeywordArray with the IPTC keywords
14. WHEN an image with a UserComment EXIF field is uploaded THE SYSTEM SHALL return matching UserComment in !metadata

---

### Requirement 6: Metadata Display

**User Story:** As a SmugMug visitor, I want to see image metadata (camera, exposure, location) in the Lightbox info panel when the photographer has enabled it, and I want it hidden when privacy settings dictate.

#### Acceptance Criteria

1. WHEN a visitor opens Lightbox and presses I THE SYSTEM SHALL display the camera make and model in the info panel
2. WHEN a visitor opens the Lightbox info panel THE SYSTEM SHALL display shutter speed, aperture, and ISO matching the source EXIF
3. WHEN a visitor opens the Lightbox info panel THE SYSTEM SHALL display the focal length
4. WHEN a visitor opens the Lightbox info panel THE SYSTEM SHALL display the date taken matching DateTimeOriginal
5. WHEN a geotagged image is viewed in a gallery with Geography enabled THE SYSTEM SHALL display location data in the Lightbox info panel
6. WHEN a geotagged image is viewed in a gallery with Geography disabled THE SYSTEM SHALL NOT display location data in the Lightbox info panel
7. WHEN a geotagged image is viewed with site-level GPS data disabled in Privacy settings THE SYSTEM SHALL NOT display location data
8. WHEN the gallery's EXIF display setting is disabled THE SYSTEM SHALL NOT display camera/exposure/focal data in the info panel
9. WHEN an image with no EXIF is viewed and the info panel is opened THE SYSTEM SHALL render cleanly without "undefined", "null", or broken layout

---

### Requirement 7: Metadata API Accuracy

**User Story:** As a SmugMug developer or integrator, I want the API to return accurate, consistent metadata, so that I can rely on it for display, search, and data management.

#### Acceptance Criteria

1. WHEN !metadata is queried for an image with rich EXIF THE SYSTEM SHALL return at minimum: Make, Model, ExposureTime, FNumber, ISO, FocalLength, DateTimeOriginal
2. WHEN !metadata is queried for an image with all EXIF stripped THE SYSTEM SHALL return successfully (not an error) with no spurious data
3. WHEN an image is uploaded THE SYSTEM SHALL report a Format field (e.g., "JPG", "PNG", "GIF") matching the uploaded file's actual format
4. WHEN an image is uploaded with a specific filename THE SYSTEM SHALL preserve the original filename in the FileName field
5. WHEN KeywordArray is PATCHed with ["sunset", "ocean", "HDR"] and the image is re-fetched THE SYSTEM SHALL return the same KeywordArray values
6. WHEN Title and Caption are PATCHed with unicode and special characters and the image is re-fetched THE SYSTEM SHALL return exact matches
7. WHEN an image with XMP face regions is uploaded and !regions is queried THE SYSTEM SHALL return regions with coordinate data

---

### Requirement 8: Point of Interest & Cropping

**User Story:** As a SmugMug photographer, I want to control where my images are cropped for thumbnails and feature images by setting a Point of Interest, so that the subject stays centered.

#### Acceptance Criteria

1. WHEN an image has no Point of Interest set THE SYSTEM SHALL crop thumbnails centered on the geometric center of the image
2. WHEN a Point of Interest is set to (0.25, 0.25) via the API THE SYSTEM SHALL shift thumbnail crops to center on that point
3. WHEN an image with a POI is replaced via the Upload API THE SYSTEM SHALL either persist or reset the POI (behavior documented)
4. WHEN a POI is set and !pointofinterest is queried THE SYSTEM SHALL return x/y coordinates matching the values that were set (within ±0.01)
5. WHEN a POI is set THE SYSTEM SHALL apply it to all size tiers that involve cropping (thumbnails, Feature Images)

---

### Requirement 9: Watermark Rendering

**User Story:** As a SmugMug Pro photographer, I want watermarks applied to visitor-facing images but not to my own view or downloads, so that my work is protected while I retain clean originals.

#### Acceptance Criteria

1. WHEN watermarking is enabled on a gallery and a visitor fetches any size tier THE SYSTEM SHALL serve images containing a visible watermark (detected via pixel diff > 1% against the owner's unwatermarked version)
2. WHEN the gallery owner fetches the same size tiers THE SYSTEM SHALL serve images without a watermark (SSIM ≥ 0.90 against a locally resized source)
3. WHEN the gallery owner downloads the original via ArchivedUri THE SYSTEM SHALL return the unwatermarked original (MD5 matching the uploaded source)
4. WHEN a watermarked image is examined THE SYSTEM SHALL apply the watermark at a reasonable coverage (1–50% pixel diff) matching the configured position and opacity
5. WHEN watermarked images are compared across size tiers (Th, M, L, XL) THE SYSTEM SHALL scale the watermark proportionally (diff percentage ratio < 10× between smallest and largest tier)

---

### Requirement 10: Display Resolution Cap (Photo Protection)

**User Story:** As a SmugMug photographer, I want to limit the maximum display resolution for visitors while retaining full resolution for myself, so that my high-res originals are protected from unauthorized use.

#### Acceptance Criteria

1. WHEN photo protection caps display resolution to Medium (600px) and a visitor fetches all tiers THE SYSTEM SHALL NOT serve any tier with a longest edge exceeding 600px
2. WHEN the gallery owner fetches the same image THE SYSTEM SHALL provide access to tiers larger than the resolution cap
3. WHEN the gallery owner downloads the original via ArchivedUri THE SYSTEM SHALL return the full-resolution file with dimensions matching OriginalWidth and OriginalHeight
4. WHEN a visitor opens the image in Lightbox THE SYSTEM SHALL load an image whose dimensions do not exceed the configured resolution cap
