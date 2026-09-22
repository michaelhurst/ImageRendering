import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    httpCredentials: {
      username: process.env.INSIDE_AUTH_USER || '',
      password: process.env.INSIDE_AUTH_PASS || '',
    },
  });

  const page = await context.newPage();
  
  let apiKey = '';
  
  // Listen for requests containing APIKey
  page.on('request', (req) => {
    const url = req.url();
    const match = url.match(/[?&]APIKey=([^&]+)/);
    if (match && !apiKey) {
      apiKey = match[1];
      console.log(`FOUND_API_KEY=${apiKey}`);
    }
  });

  // Also check response bodies for config
  page.on('response', async (res) => {
    if (res.url().includes('.js') && !apiKey) {
      try {
        const text = await res.text();
        const match = text.match(/APIKey['":\s]+['"]([a-zA-Z0-9_-]+)['"]/);
        if (match) {
          apiKey = match[1];
          console.log(`FOUND_API_KEY_JS=${apiKey}`);
        }
      } catch {}
    }
  });

  try {
    await page.goto('https://inside.smugmug.net', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Check the page source for embedded config
    const content = await page.content();
    const configMatch = content.match(/APIKey['":\s]+['"]([a-zA-Z0-9_-]+)['"]/);
    if (configMatch && !apiKey) {
      apiKey = configMatch[1];
      console.log(`FOUND_API_KEY_HTML=${apiKey}`);
    }
    
    if (!apiKey) {
      // Try navigating to the gallery page which makes more API calls
      await page.goto('https://automated-render-testing.inside.smugmug.net/Baseline-Images', { waitUntil: 'networkidle', timeout: 30000 });
    }

    if (!apiKey) {
      // Check page content again after gallery
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
  }

  await browser.close();
})();
