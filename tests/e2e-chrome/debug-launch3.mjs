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

  // Wait for extension to load
  await new Promise(r => setTimeout(r, 5000));
  
  // Navigate to chrome://extensions
  const page = await context.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Try to get extensions info using chrome extensions API
  try {
    const extensions = await page.evaluate(() => {
      // chrome://extensions page has extensionManager
      return document.querySelectorAll('.extension-list-item-container').length;
    });
    console.log('Extension items on page:', extensions);
  } catch (e) {
    console.log('Could not evaluate on chrome://extensions:', e.message);
  }
  
  // Try getting page content
  const content = await page.content();
  // Check if our extension appears
  if (content.includes('PageWise') || content.includes('智阅')) {
    console.log('Extension found in chrome://extensions page');
  } else {
    console.log('Extension NOT found in chrome://extensions page');
  }
  
  // Check console errors
  const pages = context.pages();
  console.log('Total pages:', pages.length);
  for (const p of pages) {
    console.log('Page:', p.url());
  }

  // Check background page / service worker
  const bgPages = context.backgroundPages();
  console.log('Background pages:', bgPages.length);
  
  const sws = context.serviceWorkers();
  console.log('Service workers:', sws.length);
  
  // Try listening for a new service worker
  let _swFound = false;
  context.on('serviceworker', (sw) => {
    console.log('Service worker event fired:', sw.url());
    _swFound = true;
  });
  
  // Navigate to a page to trigger content scripts
  const triggerPage = await context.newPage();
  await triggerPage.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  
  const sws2 = context.serviceWorkers();
  console.log('Service workers after navigating:', sws2.length);
  for (const sw of sws2) {
    console.log('  SW URL:', sw.url());
  }
  
  await context.close();
} catch (e) {
  console.error('Error:', e.message);
}

try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
