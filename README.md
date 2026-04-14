# SmugMug Image Display Quality Tests

Playwright + API test suite for verifying image display quality, color accuracy, sizing, orientation, and metadata preservation across the SmugMug platform.

## Quick Start

```bash
# 1. Install dependencies
npm install
npx playwright install chromium

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials and test album keys

# 3. Run all tests
npm test

# 4. Run a specific group
npm run test:quality      # Image Quality & Compression (IQ-01–10)
npm run test:color        # Color Accuracy & Profiles (CL-01–10)
npm run test:sizing       # Image Dimensions & Sizing (SZ-01–11)
npm run test:orientation  # EXIF Orientation (OR-01–12)
npm run test:metadata-preservation  # Metadata Preservation (MP-01–14)
npm run test:metadata-display       # Metadata Display UI (MD-01–09)
npm run test:metadata-api           # Metadata API Accuracy (MA-01–07)
npm run test:poi          # Point of Interest & Cropping (POI-01–05)
npm run test:watermark    # Watermark Rendering (WM-01–05)
npm run test:resolution-cap  # Display Resolution Cap (RC-01–04)

# 5. View the HTML report
npm run test:report
```

## Project Structure

```
image-display-tests/
├── playwright.config.ts          # Playwright configuration
├── package.json                  # Dependencies and run scripts
├── .env.example                  # Environment variable template
├── README.md                     # This file
│
├── helpers/                      # Shared utilities
│   ├── index.ts                  # Re-exports all helpers
│   ├── smugmug-api.ts            # SmugMug API v2 client
│   ├── image-comparison.ts       # SSIM, Delta-E, pixel sampling, sharpness
│   ├── exif-utils.ts             # EXIF reading, orientation, ICC profiles
│   ├── auth.ts                   # Login and session management
│   └── test-fixtures.ts          # Extended Playwright fixtures
│
├── tests/                        # Test spec files (one per group)
│   ├── image-quality.spec.ts     # IQ-01 through IQ-10
│   ├── color-accuracy.spec.ts    # CL-01 through CL-10
│   ├── image-sizing.spec.ts      # SZ-01 through SZ-11
│   ├── exif-orientation.spec.ts  # OR-01 through OR-12
│   ├── metadata-preservation.spec.ts  # MP-01 through MP-14
│   ├── metadata-display.spec.ts  # MD-01 through MD-09
│   ├── metadata-api.spec.ts      # MA-01 through MA-07
│   ├── point-of-interest.spec.ts # POI-01 through POI-05
│   ├── watermark.spec.ts         # WM-01 through WM-05
│   └── resolution-cap.spec.ts    # RC-01 through RC-04
│
├── reference-images/             # Test images with known properties
│   └── (see Reference Images section below)
│
├── fixtures/                     # Runtime artifacts
│   └── auth-state.json           # Saved browser session (auto-generated)
│
└── .vscode/                      # VSCode settings
    ├── settings.json
    └── extensions.json
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVIRONMENT` | Yes | `inside` or `production` |
| `INSIDE_AUTH_USER` | Inside only | HTTP Basic Auth username |
| `INSIDE_AUTH_PASS` | Inside only | HTTP Basic Auth password |
| `SMUGMUG_QA_USERNAME` | Yes | SmugMug login email |
| `SMUGMUG_QA_PASSWORD` | Yes | SmugMug login password |
| `SMUGMUG_API_KEY` | For public tests | API key for unauthenticated access |
| `SMUGMUG_API_SECRET` | For OAuth | API secret |
| `SMUGMUG_OAUTH_TOKEN` | For OAuth | OAuth access token |
| `SMUGMUG_OAUTH_TOKEN_SECRET` | For OAuth | OAuth token secret |
| `TEST_ALBUM_KEY` | Yes | Album key for uploading test images |
| `TEST_NICKNAME` | No | Test account nickname (default: `qa-pro`) |
| `TEST_WATERMARK_ALBUM_KEY` | For WM tests | Album with watermarking enabled |
| `TEST_CAPPED_ALBUM_KEY` | For RC tests | Album with display resolution cap |
| `TEST_RESOLUTION_CAP_MAX` | For RC tests | Expected max edge in px (default: `600`) |

## Reference Images

Place these files in the `reference-images/` directory. Each must have known, documented properties.

### Image Quality & Compression
| File | Description |
|------|-------------|
| `quality-detail.jpg` | JPEG Q95 with fine detail (text, fabric texture) |
| `quality-reference.png` | Lossless PNG reference |
| `quality-reference.gif` | Static GIF reference |
| `quality-reference.heic` | HEIC reference (optional) |
| `quality-noisy.jpg` | High-ISO image with visible grain |
| `quality-resolution-chart.jpg` | Resolution/sharpness test chart |

### Color Accuracy
| File | Companion JSON | Description |
|------|---------------|-------------|
| `color-checker-srgb.jpg` | `color-checker-srgb.json` | sRGB with known sample points |
| `color-checker-adobergb.jpg` | `color-checker-adobergb.json` | Adobe RGB tagged |
| `color-checker-prophoto.jpg` | `color-checker-prophoto.json` | ProPhoto RGB tagged |
| `color-icc-custom.jpg` | — | Custom ICC profile |
| `color-untagged.jpg` | — | Same as sRGB but ICC stripped |
| `color-cmyk.jpg` | — | CMYK color space |
| `color-16bit-gradient.tiff` | — | 16-bit smooth gradient |
| `color-blackwhite.jpg` | `color-blackwhite.json` | Pure black + white pixels |
| `color-grayscale-ramp.jpg` | `color-grayscale-ramp.json` | 11-step gray wedge |
| `color-saturated-patches.jpg` | `color-saturated-patches.json` | R, G, B, C, M, Y patches |

**JSON format** for reference pixel coordinates:
```json
[
  { "x": 100, "y": 50, "r": 115, "g": 82, "b": 68 },
  { "x": 200, "y": 50, "r": 194, "g": 150, "b": 130 }
]
```

### Image Sizing
| File | Dimensions | Description |
|------|-----------|-------------|
| `sizing-landscape.jpg` | 6000×4000 | Standard landscape |
| `sizing-portrait.jpg` | 4000×6000 | Standard portrait |
| `sizing-square.jpg` | 5000×5000 | Square |
| `sizing-panoramic.jpg` | 12000×2000 | Extreme landscape |
| `sizing-tall.jpg` | 2000×10000 | Extreme portrait |
| `sizing-small.jpg` | 400×300 | Small (below most tier maxes) |

### EXIF Orientation
| File | Description |
|------|-------------|
| `orientation-1.jpg` through `orientation-8.jpg` | Same visual content, each with a different EXIF orientation tag (1–8) |
| `orientation-reference.jpg` | Ground truth — correctly oriented (tag 1) |

### Metadata
| File | Description |
|------|-------------|
| `metadata-rich.jpg` | Full EXIF: camera, exposure, GPS, lens, copyright, artist, dates |
| `metadata-iptc.jpg` | IPTC caption, keywords, and title embedded |
| `metadata-stripped.jpg` | All EXIF/IPTC removed |
| `metadata-xmp-regions.jpg` | XMP face regions embedded |

### Other
| File | Description |
|------|-------------|
| `poi-test.jpg` | Large image with a distinct subject in the top-left quadrant |
| `watermark-test.jpg` | Any image for watermark tests |
| `resolution-cap-test.jpg` | High-res image (6000×4000) for resolution cap tests |

## Helper Utilities

### SmugMugAPI (`helpers/smugmug-api.ts`)
Full API client supporting authenticated (browser session) and unauthenticated (API key) access. Methods include `getImage()`, `getSizeDetails()`, `getMetadata()`, `uploadImage()`, `getPointOfInterest()`, `setPointOfInterest()`, and more.

### Image Comparison (`helpers/image-comparison.ts`)
- **SSIM** — structural similarity scoring between two images
- **Pixel sampling** — extract RGB values at specific coordinates
- **Delta-E** — perceptual color difference calculation
- **Sharpness** — Laplacian variance measurement
- **Gradient smoothness** — banding detection
- **Watermark detection** — diff-based comparison
- **MD5** — hash verification

### EXIF Utilities (`helpers/exif-utils.ts`)
- Read EXIF/IPTC/XMP from local files or buffers
- Orientation tag interpretation (all 8 tags)
- Dimension correction calculation after orientation
- ICC profile detection
- XMP face region reading

### Test Fixtures (`helpers/test-fixtures.ts`)
Extended Playwright test with pre-configured fixtures: `api`, `imageCompare`, `exifUtils`, `testAlbumKey`, `referenceImagesDir`.

## Implementation Notes

### Tests Marked `test.skip()`
Several UI tests (MD-01 through MD-09, OR-11, OR-12, RC-04) are scaffolded but skipped because they require Lightbox DOM selectors that must be discovered via `npx playwright codegen`. Run codegen against the target environment and update the `SELECTORS` object in each file.

### Test Isolation
Tests upload images to a shared test album. For full isolation, create a dedicated album per test run and clean up afterward. The current approach prioritizes simplicity.

### Thresholds
Quality thresholds (SSIM, Delta-E, sharpness variance) are set conservatively. Adjust based on observed SmugMug behavior — the first run will help calibrate appropriate values.

### Watermark & Resolution Cap Tests
These require specific gallery configurations (watermarking enabled, resolution cap set). The album keys must be provided via environment variables. Without them, these test groups are automatically skipped.
