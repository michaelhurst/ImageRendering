import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let apiKey = '';
  
  page.on('request', (req) => {
    const url = req.url();
    const match = url.match(/[?&]APIKey=([^&]+)/);
    if (match && !apiKey) {
      apiKey = match[1];
      console.log(`FOUND_API_KEY=${apiKey}`);
    }
  });

  try {
    await page.goto('https://www.smugmug.com', { waitUntil: 'networkidle', timeout: 30000 });
    
    const content = await page.content();
    const configMatch = content.match(/APIKey['":\s]+['"]([a-zA-Z0-9_-]+)['"]/);
    if (configMatch && !apiKey) {
      apiKey = configMatch[1];
      console.log(`FOUND_API_KEY_HTML=${apiKey}`);
    }
    
    if (!apiKey) {
      await page.goto('https://automated-render-testing.smugmug.com/Baseline-Images', { waitUntil: 'networkidle', timeout: 30000 });
    }

    if (!apiKey) {
      const galleryContent = await page.content();
      const galleryMatch = galleryContent.match(/APIKey['":\s]+['"]([a-zA-Z0-9_-]+)['"]/);
      if (galleryMatch) {
        apiKey = galleryMatch[1];
        console.log(`FOUND_API_KEY_GALLERY=${apiKey}`);
      }
    }
    
    if (!apiKey) {
      console.log('API_KEY_NOT_FOUND');
    }
  } catch (err: any) {
    console.log(`ERROR: ${err.message}`);
    if (apiKey) console.log(`But key was found: ${apiKey}`);
  }

  await browser.close();
})();
