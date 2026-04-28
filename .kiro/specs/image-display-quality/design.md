# Design Document

## Overview

This document describes the technical architecture of the SmugMug image display quality test suite. The suite combines SmugMug API v2 calls with image analysis libraries to programmatically verify quality, color fidelity, sizing, orientation, and metadata — without relying on brittle visual snapshots.

---

## Architecture

### Component Overview

```
image-display-tests/
├── helpers/
│   ├── smugmug-api.ts       — API client (upload, fetch, patch)
│   ├── image-comparison.ts  — SSIM, Delta-E, pixel sampling, sharpness
│   ├── exif-utils.ts        — EXIF/IPTC/XMP reading, orientation helpers
│   ├── auth.ts              — Login, session persistence
│   └── test-fixtures.ts     — Playwright fixture extensions
├── tests/                   — One spec file per requirement group
│   ├── image-quality.spec.ts
│   ├── color-accuracy.spec.ts
│   ├── image-sizing.spec.ts
│   ├── exif-orientation.spec.ts
│   ├── metadata-preservation.spec.ts
│   ├── metadata-display.spec.ts
│   ├── metadata-api.spec.ts
│   ├── point-of-interest.spec.ts
│   ├── watermark.spec.ts
│   └── resolution-cap.spec.ts
└── reference-images/        — Known test images with documented properties
```

### Key Dependencies

| Library | Purpose |
|---------|---------|
| `@playwright/test` | Browser automation and test runner |
| `sharp` | Image decoding, resizing, pixel access, metadata |
| `exifr` | EXIF/IPTC/XMP parsing from files and buffers |
| `dotenv` | Environment variable management |

---

## Data Flow

### API-Based Test Flow (most tests)

```
Test starts
  │
  ├─► Upload reference image via SmugMug Upload API
  │     POST https://upload.smugmug.com/
  │
  ├─► Fetch image metadata from API
  │     GET /api/v2/image/{imageKey}-0
  │     GET /api/v2/image/{imageKey}-0!sizedetails
  │     GET /api/v2/image/{imageKey}-0!metadata
  │
  ├─► Download CDN image buffers for each size tier
  │     GET https://photos.smugmug.com/...
  │
  ├─► Run image analysis on downloaded buffers
  │     (SSIM, pixel sampling, dimension check, Delta-E, etc.)
  │
  └─► Assert results meet thresholds
```

### UI-Based Test Flow (metadata-display, orientation UI tests)

```
Test starts
  │
  ├─► Login via browser session (auth.ts)
  │
  ├─► Upload image via API
  │
  ├─► Navigate to image WebUri via page.goto()
  │
  ├─► Interact with Lightbox (click image, press I for info panel)
  │
  ├─► Inspect DOM for metadata text content
  │
  └─► Assert correct values / absence of values
```

---

## Authentication Model

Two access modes are used across the suite:

**Authenticated (owner):** Uses browser session cookies captured via `auth.ts` login flow. Applied to all upload operations and owner-perspective tests (watermark, resolution cap, full-res access).

**Unauthenticated (visitor):** Uses a `SmugMugAPI.withApiKey()` instance that appends `?APIKey=` to public endpoints on `www.smugmug.com`. Applied to visitor-perspective tests (watermark visible, resolution cap enforced).

Tests that require both perspectives construct two API client instances and compare results.

---

## Image Analysis Techniques

### SSIM (Structural Similarity Index)
Used to compare overall image quality between SmugMug-served tiers and locally generated references. Both images are normalized to the same dimensions and converted to grayscale before computing luminance, contrast, and structure components. Score range: 0.0 (completely different) to 1.0 (identical).

**Thresholds:**
- General quality: ≥ 0.92
- Orientation match: ≥ 0.90
- No double-compression: ≥ 0.90
- Owner view (no watermark): ≥ 0.90
- Untagged vs sRGB match: ≥ 0.98

### Delta-E Color Difference
Used to measure perceptual color accuracy at known pixel coordinates. A companion JSON file for each color reference image lists `{x, y, r, g, b}` sample points. Pixel coordinates are scaled proportionally when comparing to resized tiers.

**Thresholds:**
- sRGB samples: Delta-E < 5
- Adobe RGB / ProPhoto conversions: Delta-E < 10
- Black/white endpoints: Delta-E < 8

### Pixel Sampling
Exact pixel RGB values are read at specific coordinates using `sharp`'s raw buffer extraction. Used for grayscale ramp step accuracy (luminance within ±5) and color patch verification.

### Laplacian Variance (Sharpness)
A 3×3 Laplacian kernel is applied to the grayscale image. The variance of the resulting values measures edge energy. Higher = sharper. Minimum threshold: 50.

### Gradient Smoothness (Banding Detection)
Adjacent pixel luminance differences are sampled along the middle horizontal row. The standard deviation of those differences measures smoothness. StdDev < 3.0 indicates no banding.

### Watermark Detection
The owner's (clean) and visitor's (watermarked) versions of the same tier are compared pixel-by-pixel. Pixels differing by more than a threshold in any channel are counted. A diff > 1% of total pixels indicates a watermark is present.

### MD5 Hash
Used for exact byte-level verification of original downloads against source files. Computed using Node's built-in `crypto` module.

---

## Reference Image Requirements

Each test group requires specific reference images placed in `reference-images/`. Images must have **known, documented properties** — the tests assert against those known values, not against dynamically computed baselines.

### Color reference images
Each color-checker image ships with a companion `.json` file listing pixel sample coordinates and expected RGB values. Coordinates are specified at the original resolution; tests scale them proportionally for each size tier.

```json
// color-checker-srgb.json — example
[
  { "x": 120, "y": 80, "r": 115, "g": 82,  "b": 68  },
  { "x": 240, "y": 80, "r": 194, "g": 150, "b": 130 },
  { "x": 360, "y": 80, "r": 98,  "g": 122, "b": 157 }
]
```

### Orientation reference images
Eight images (`orientation-1.jpg` through `orientation-8.jpg`) contain identical visual content (e.g., an upward arrow with "TOP" text) but with different EXIF orientation tags applied. `orientation-reference.jpg` is the ground truth — tag 1, correctly oriented.

### Metadata reference images
`metadata-rich.jpg` must contain populated values for all key EXIF fields: Make, Model, ExposureTime, FNumber, ISOSpeedRatings, FocalLength, DateTimeOriginal, GPS, LensModel, WhiteBalance, Flash, Copyright, Artist, UserComment.

---

## Environment Configuration

All environment-specific values are injected via `.env` and never hardcoded in tests. The `.env.example` file documents all required variables. Key variables:

| Variable | Used By |
|----------|---------|
| `TEST_ALBUM_KEY` | All upload-based tests |
| `SMUGMUG_API_KEY` | Unauthenticated (visitor) API calls |
| `TEST_WATERMARK_ALBUM_KEY` | WM-01 through WM-05 |
| `TEST_CAPPED_ALBUM_KEY` | RC-01 through RC-04 |
| `TEST_RESOLUTION_CAP_MAX` | RC-01 expected edge maximum |

---

## Test Execution Strategy

- Tests run serially (`workers: 1`) by default because many share upload state within a test group. Full isolation (one album per test run) is a future improvement.
- UI tests (metadata-display, OR-11/12, RC-04) are scaffolded but marked `test.skip()` pending Lightbox selector discovery via `npx playwright codegen`.
- Watermark and resolution cap tests auto-skip when their album key environment variables are not set.
- The `test.beforeAll` pattern in `metadata-preservation.spec.ts` uploads the rich-EXIF image once and shares the image key across the 14 preservation tests to minimise upload calls.

---

## Kiro Usage Notes

Kiro agents working on this spec should:

1. Use `requirements.md` as the source of truth for what each test must assert — every acceptance criterion maps to a named test case ID (IQ-01, CL-01, etc.)
2. Use `tasks.md` to track implementation progress — check off tasks as they are completed
3. When implementing a new test, import from `../helpers/test-fixtures` (not `@playwright/test`) to get pre-wired `api`, `imageCompare`, and `exifUtils` fixtures
4. When adding a new reference image type, document its properties in this design.md and add corresponding entries to the `reference-images/` table in `README.md`
5. UI tests in `metadata-display.spec.ts` require running `npx playwright codegen https://inside.smugmug.net` while logged in to discover real Lightbox selectors — update the `SELECTORS` object in that file before removing `test.skip()`
