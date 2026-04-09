const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASELINE_URL = 'https://photos.smugmug.com/photos/i-pLCbGmQ/0/M7cnhpSpvR2TX2NQ2c5h9hb5Msq5hmgPt76ZznKN4/O/i-pLCbGmQ.jpg';
const CANDIDATE_URL = 'https://photos.inside.smugmug.net/photos/i-8ZMdb55/0/MmQnKcKsXBbScjjkVhRM8qJWWpTqnLxDnRxCKrPMj/O/i-8ZMdb55.jpg';
const BASELINE_DIR = path.join(__dirname, 'baselines');

const viewports = [
  { name: 'Ti', width: 100,  height: 75   },
  { name: 'Th', width: 150,  height: 112  },
  { name: 'S',  width: 400,  height: 300  },
  { name: 'M',  width: 600,  height: 450  },
  { name: 'L',  width: 800,  height: 600  },
  { name: 'XL', width: 1024, height: 768  },
  { name: 'X2', width: 1280, height: 960  },
  { name: 'X3', width: 1600, height: 1200 },
  { name: 'X4', width: 1920, height: 1440 },
  { name: 'X5', width: 2048, height: 1536 },
  { name: '4K', width: 3840, height: 2160 },
  { name: '5K', width: 5120, height: 2880 },
  { name: 'O',  width: 1280, height: 720  },
];

async function loadImage(page, url) {
  await page.goto(url);
  const img = page.locator('img');
  await img.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const el = document.querySelector('img');
    return el && el.complete && el.naturalWidth > 0;
  });
  return img;
}

for (const { name, width, height } of viewports) {
  test(`image renders and is visible at [${name}] ${width}x${height}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    const img = await loadImage(page, CANDIDATE_URL);
    const loaded = await img.evaluate((el) => el.naturalWidth > 0);
    expect(loaded).toBe(true);
    await page.close();
  });

  test(`candidate matches baseline at [${name}] ${width}x${height}`, async ({ browser }) => {
    const baselinePath = path.join(BASELINE_DIR, `baseline-${name}.png`);

    // Capture and save baseline from smugmug.com if it doesn't exist yet
    if (!fs.existsSync(baselinePath)) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      const baselinePage = await browser.newPage({ viewport: { width, height } });
      const baselineImg = await loadImage(baselinePage, BASELINE_URL);
      fs.writeFileSync(baselinePath, await baselineImg.screenshot());
      await baselinePage.close();
      console.log(`Baseline saved for [${name}]`);
    }

    // Capture candidate screenshot from inside.smugmug.net
    const candidatePage = await browser.newPage({ viewport: { width, height } });
    const candidateImg = await loadImage(candidatePage, CANDIDATE_URL);
    const candidateScreenshot = await candidateImg.screenshot();
    await candidatePage.close();

    // Compare candidate directly against the smugmug.com baseline
    const baselineScreenshot = fs.readFileSync(baselinePath);
    expect(candidateScreenshot).toEqual(baselineScreenshot);
  });
}
