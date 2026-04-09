const { test, expect } = require('@playwright/test');
const https = require('https');
const exifr = require('exifr');

const BASELINE_URL = 'https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg';
const CANDIDATE_URL = 'https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg';

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

test('EXIF data matches between smugmug.com and inside.smugmug.net', async () => {
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

  console.log('Baseline EXIF:', JSON.stringify(baselineExif, null, 2));
  console.log('Candidate EXIF:', JSON.stringify(candidateExif, null, 2));

  // Compare all EXIF fields present in the baseline
  for (const key of Object.keys(baselineExif)) {
    expect(candidateExif).toHaveProperty(key);
    expect(candidateExif[key]).toEqual(baselineExif[key]);
  }
});
