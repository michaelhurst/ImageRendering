const { test, expect } = require("@playwright/test");
const https = require("https");
const exifr = require("exifr");

const BASELINE_URL =
  "https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg";
const CANDIDATE_URL =
  "https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg";

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

test("EXIF data matches between smugmug.com and inside.smugmug.net", async () => {
  const [baselineBuffer, candidateBuffer] = await Promise.all([
    fetchImageBuffer(BASELINE_URL),
    fetchImageBuffer(CANDIDATE_URL),
  ]);

  const [baselineExif, candidateExif] = await Promise.all([
    exifr.parse(baselineBuffer, { all: true }),
    exifr.parse(candidateBuffer, { all: true }),
  ]);

  expect(baselineExif).not.toBeNull();
  expect(candidateExif).not.toBeNull();

  const mismatches = [];

  for (const key of Object.keys(baselineExif)) {
    if (!Object.prototype.hasOwnProperty.call(candidateExif, key)) {
      mismatches.push(
        `MISSING  [${key}]: baseline="${JSON.stringify(baselineExif[key])}"`,
      );
      continue;
    }

    const baseVal = JSON.stringify(baselineExif[key]);
    const candVal = JSON.stringify(candidateExif[key]);

    if (baseVal !== candVal) {
      mismatches.push(
        `MISMATCH [${key}]: baseline=${baseVal} candidate=${candVal}`,
      );
    }
  }

  if (mismatches.length > 0) {
    console.log("EXIF differences:\n" + mismatches.join("\n"));
  } else {
    console.log(`All ${Object.keys(baselineExif).length} EXIF fields match.`);
  }

  expect(
    mismatches,
    `${mismatches.length} EXIF field(s) differ:\n${mismatches.join("\n")}`,
  ).toHaveLength(0);
});
