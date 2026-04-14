# SmugMug Image Display Tests

Playwright test suite for validating SmugMug image display quality, color accuracy, sizing, EXIF orientation, watermarking, and metadata handling.

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

| Variable                     | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `ENVIRONMENT`                | `inside` or `production`                        |
| `INSIDE_AUTH_USER`           | HTTP Basic Auth username for inside.smugmug.net |
| `INSIDE_AUTH_PASS`           | HTTP Basic Auth password                        |
| `SMUGMUG_QA_USERNAME`        | SmugMug login username                          |
| `SMUGMUG_QA_PASSWORD`        | SmugMug login password                          |
| `SMUGMUG_API_KEY`            | SmugMug API key (OAuth 1.0a)                    |
| `SMUGMUG_API_SECRET`         | SmugMug API secret                              |
| `SMUGMUG_OAUTH_TOKEN`        | OAuth token                                     |
| `SMUGMUG_OAUTH_TOKEN_SECRET` | OAuth token secret                              |
| `TEST_ALBUM_KEY`             | Pre-seeded album key for upload tests           |
| `TEST_NICKNAME`              | Test account nickname (default: `qa-pro`)       |

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
npm run test:exif
npm run test:metadata-preservation
npm run test:metadata-display
npm run test:metadata-api
npm run test:poi
npm run test:watermark
npm run test:resolution-cap

# Update snapshots
npm run test:update

# View HTML report
npm run test:report
```

## Test Suites

| Suite                 | File                            | Description                                          |
| --------------------- | ------------------------------- | ---------------------------------------------------- |
| Image Render          | `image-render.spec.ts`          | Visual screenshot comparison across all viewports    |
| Image Quality         | `image-quality.spec.ts`         | SSIM, sharpness, compression artifact detection      |
| Color Accuracy        | `color-accuracy.spec.ts`        | Delta-E pixel color comparison, color space checks   |
| Image Sizing          | `image-sizing.spec.ts`          | Pixel dimensions and aspect ratio verification       |
| EXIF Orientation      | `exif-orientation.spec.ts`      | EXIF orientation tag presence and correctness        |
| EXIF Compare          | `exif-compare.spec.ts`          | Field-by-field EXIF comparison between environments  |
| Metadata Preservation | `metadata-preservation.spec.ts` | EXIF field preservation across environments          |
| Metadata Display      | `metadata-display.spec.ts`      | Metadata correctness in browser (dimensions, dates)  |
| Metadata API          | `metadata-api.spec.ts`          | EXIF completeness and field-level baseline matching  |
| Point of Interest     | `point-of-interest.spec.ts`     | Subject/crop center consistency between environments |
| Watermark             | `watermark.spec.ts`             | Pixel diff and uniform block detection               |
| Resolution Cap        | `resolution-cap.spec.ts`        | Longest edge vs configurable resolution cap          |

```

```
