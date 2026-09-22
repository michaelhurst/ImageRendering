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
  const apiCtx = page.context().request;
  
  const apiKey = process.env.SMUGMUG_API_KEY_INSIDE;
  const baseUrl = 'https://inside.smugmug.net';

  // List albums
  const albumsUrl = `${baseUrl}/api/v2/folder/user/automated-render-testing!albums?APIKey=${apiKey}`;
  const albumsRes = await apiCtx.get(albumsUrl, { headers: { Accept: 'application/json' } });
  const albumsData = await albumsRes.json();
  const albums = albumsData?.Response?.Album || [];
  const baselineAlbum = albums.find((a: any) => a.UrlName === 'Baseline-Images' || a.Name === 'Baseline Images');
  
  if (!baselineAlbum) {
    console.log('Album not found');
    await browser.close();
    return;
  }

  console.log(`Album: ${baselineAlbum.Name} (key: ${baselineAlbum.AlbumKey})`);
  const albumUri = baselineAlbum.Uri;
  
  // Try different approaches to work around the ghost image
  
  // Approach 1: Use _expandmethod=inline to avoid sub-resource expansion
  const url1 = `${baseUrl}${albumUri}!images?start=1&count=5&APIKey=${apiKey}&_expandmethod=inline`;
  console.log(`\n1. _expandmethod=inline: ${url1}`);
  const res1 = await apiCtx.get(url1, { headers: { Accept: 'application/json' } });
  console.log(`   Status: ${res1.status()}`);

  // Approach 2: Try with Scope filter
  const url2 = `${baseUrl}${albumUri}!images?start=1&count=5&APIKey=${apiKey}&Scope=public`;
  console.log(`\n2. Scope=public: ${url2}`);
  const res2 = await apiCtx.get(url2, { headers: { Accept: 'application/json' } });
  console.log(`   Status: ${res2.status()}`);

  // Approach 3: Try start=2 to skip the broken image
  const url3 = `${baseUrl}${albumUri}!images?start=2&count=5&APIKey=${apiKey}`;
  console.log(`\n3. start=2: ${url3}`);
  const res3 = await apiCtx.get(url3, { headers: { Accept: 'application/json' } });
  console.log(`   Status: ${res3.status()}`);
  if (res3.ok()) {
    const data3 = await res3.json();
    const imgs = data3?.Response?.AlbumImage || [];
    console.log(`   Got ${imgs.length} images`);
    for (const img of imgs.slice(0, 5)) {
      console.log(`     - ${img.FileName} (key: ${img.ImageKey})`);
    }
  } else {
    console.log(`   Error: ${(await res3.text()).slice(0, 300)}`);
  }

  // Approach 4: Try the !albumimages endpoint
  const url4 = `${baseUrl}/api/v2/album/${baselineAlbum.AlbumKey}!albumimages?start=1&count=5&APIKey=${apiKey}`;
  console.log(`\n4. !albumimages: ${url4}`);
  const res4 = await apiCtx.get(url4, { headers: { Accept: 'application/json' } });
  console.log(`   Status: ${res4.status()}`);

  // Approach 5: Try SortDirection=Descending 
  const url5 = `${baseUrl}${albumUri}!images?start=1&count=5&APIKey=${apiKey}&SortDirection=Descending`;
  console.log(`\n5. SortDirection=Descending: ${url5}`);
  const res5 = await apiCtx.get(url5, { headers: { Accept: 'application/json' } });
  console.log(`   Status: ${res5.status()}`);
  if (res5.ok()) {
    const data5 = await res5.json();
    const imgs = data5?.Response?.AlbumImage || [];
    console.log(`   Got ${imgs.length} images`);
  } else {
    console.log(`   Error: ${(await res5.text()).slice(0, 300)}`);
  }

  // Approach 6: Search images by filename directly
  const url6 = `${baseUrl}/api/v2/image/CjpcMxT-1?APIKey=${apiKey}`;
  console.log(`\n6. Direct image lookup: ${url6}`);
  const res6 = await apiCtx.get(url6, { headers: { Accept: 'application/json' } });
  console.log(`   Status: ${res6.status()}`);
  console.log(`   Body: ${(await res6.text()).slice(0, 300)}`);

  await browser.close();
})();
