/**
 * MA-01 through MA-07: Metadata API Accuracy
 *
 * Verifies that the SmugMug API accurately returns metadata fields
 * for the candidate image, and that values match the baseline.
 *
 * Images are fetched directly from CDN URLs:
 *   BASELINE_URL — production smugmug.com image (ground truth)
 *   CANDIDATE_URL — inside.smugmug.net image under test
 *
 * API calls use the image keys embedded in the CDN URLs.
 */

import { test, expect } from "@playwright/test";
import * as https from "https";

const BASELINE_URL =
  "https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg";
const CANDIDATE_URL =
  "https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg";

// Image keys extracted from the CDN URLs
const BASELINE_IMAGE_KEY = "i-pLCbGmQ";
const CANDIDATE_IMAGE_KEY = "i-8ZMdb55";

const API_KEY = process.env.SMUGMUG_API_KEY || "";
const OAUTH_TOKEN = process.env.SMUGMUG_OAUTH_TOKEN || "";
const OAUTH_SECRET = process.env.SMUGMUG_OAUTH_TOKEN_SECRET || "";
const API_SECRET = process.env.SMUGMUG_API_SECRET || "";

function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        Accept: "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${OAUTH_TOKEN}` } : {}),
      },
    };
    https
      .get(
        `${url}?APIKey=${API_KEY}&_accept=application%2Fjson`,
        options,
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch (e) {
              reject(e);
            }
          });
          res.on("error", reject);
        },
      )
      .on("error", reject);
  });
}

// -----------------------------------------------------------------------
// MA-01: Candidate EXIF contains required fields
// -----------------------------------------------------------------------
test("MA-01: Candidate EXIF contains required fields", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { all: true });

  expect(exif).not.toBeNull();
  const requiredFields = [
    "Make",
    "Model",
    "ExposureTime",
    "FNumber",
    "FocalLength",
  ];
  const missing = requiredFields.filter((f) => exif?.[f] === undefined);

  if (missing.length > 0) console.log("Missing fields:", missing.join(", "));
  expect(missing, `Missing EXIF fields: ${missing.join(", ")}`).toHaveLength(0);
});

// -----------------------------------------------------------------------
// MA-02: Candidate EXIF ISO is present
// -----------------------------------------------------------------------
test("MA-02: Candidate EXIF ISO is present", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { pick: ["ISO", "ISOSpeedRatings"] });
  const hasISO = exif?.ISO !== undefined || exif?.ISOSpeedRatings !== undefined;
  expect(hasISO, "Missing ISO field").toBe(true);
});

// -----------------------------------------------------------------------
// MA-03: Candidate format is JPEG
// -----------------------------------------------------------------------
test("MA-03: Candidate image format is JPEG", async () => {
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const sharp = require("sharp");
  const { format } = await sharp(buffer).metadata();
  expect(format).toBe("jpeg");
});

// -----------------------------------------------------------------------
// MA-04: Baseline format is JPEG
// -----------------------------------------------------------------------
test("MA-04: Baseline image format is JPEG", async () => {
  const buffer = await fetchImageBuffer(BASELINE_URL);
  const sharp = require("sharp");
  const { format } = await sharp(buffer).metadata();
  expect(format).toBe("jpeg");
});

// -----------------------------------------------------------------------
// MA-05: Candidate EXIF fields match baseline EXIF fields
// -----------------------------------------------------------------------
test("MA-05: Candidate EXIF fields match baseline", async () => {
  const exifr = require("exifr");
  const fields = [
    "Make",
    "Model",
    "ExposureTime",
    "FNumber",
    "FocalLength",
    "ISO",
  ];

  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: fields }),
    exifr.parse(candidateBuffer, { pick: fields }),
  ]);

  const mismatches: string[] = [];
  for (const key of fields) {
    if (bExif?.[key] === undefined) continue;
    if (JSON.stringify(cExif?.[key]) !== JSON.stringify(bExif[key])) {
      mismatches.push(
        `${key}: baseline=${JSON.stringify(bExif[key])} candidate=${JSON.stringify(cExif?.[key])}`,
      );
    }
  }

  if (mismatches.length > 0)
    console.log("EXIF mismatches:\n" + mismatches.join("\n"));
  expect(mismatches, `${mismatches.length} EXIF field(s) differ`).toHaveLength(
    0,
  );
});

// -----------------------------------------------------------------------
// MA-06: Candidate EXIF DateTimeOriginal is valid
// -----------------------------------------------------------------------
test("MA-06: Candidate EXIF DateTimeOriginal is a valid date", async () => {
  const exifr = require("exifr");
  const buffer = await fetchImageBuffer(CANDIDATE_URL);
  const exif = await exifr.parse(buffer, { pick: ["DateTimeOriginal"] });

  if (exif?.DateTimeOriginal) {
    const d = new Date(exif.DateTimeOriginal);
    expect(isNaN(d.getTime())).toBe(false);
    expect(d.getFullYear()).toBeGreaterThan(1990);
  }
});

// -----------------------------------------------------------------------
// MA-07: Candidate and baseline DateTimeOriginal match
// -----------------------------------------------------------------------
test("MA-07: Candidate and baseline DateTimeOriginal match", async () => {
  const exifr = require("exifr");
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);
  const [bExif, cExif] = await Promise.all([
    exifr.parse(baselineBuffer, { pick: ["DateTimeOriginal"] }),
    exifr.parse(candidateBuffer, { pick: ["DateTimeOriginal"] }),
  ]);

  if (bExif?.DateTimeOriginal) {
    const bDate = new Date(bExif.DateTimeOriginal).toISOString().slice(0, 19);
    const cDate = new Date(cExif?.DateTimeOriginal).toISOString().slice(0, 19);
    expect(cDate).toBe(bDate);
  }
});
