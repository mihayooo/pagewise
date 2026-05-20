import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(EXTENSION_PATH, '.chrome-profile-r211');

if (fs.existsSync(PROFILE_DIR)) {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

console.log('EXTENSION_PATH:', EXTENSION_PATH);

try {
  const context = await chromium.launchPersistentContext(
    PROFILE_DIR,
    {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--headless=new',
      ],
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    }
  );

  console.log('Context created');
  
  // Wait a bit and check again
  console.log('Waiting 5s for extension to load...');
  await new Promise(r => setTimeout(r, 5000));
  
  const sws = context.serviceWorkers();
  console.log('Service workers after 5s:', sws.length);
  for (const sw of sws) {
    console.log('  SW URL:', sw.url());
  }
  
  // Check if we can navigate to chrome://extensions
  const page = await context.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Try to check chrome.runtime in extension page
  if (sws.length > 0) {
    const url = new URL(sws[0].url());
    const extensionId = url.hostname;
    console.log('Extension ID:', extensionId);
    
    const spPage = await context.newPage();
    await spPage.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`, { waitUntil: 'domcontentloaded' });
    await spPage.waitForSelector('#app', { timeout: 10000 });
    console.log('Side panel loaded!');
    await spPage.close();
  }
  
  await page.close();
  await context.close();
} catch (e) {
  console.error('Error:', e.message);
}

try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
