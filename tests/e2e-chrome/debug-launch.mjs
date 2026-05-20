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
console.log('PROFILE_DIR:', PROFILE_DIR);

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
        '--disable-background-networking',
        '--headless=new',
      ],
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    }
  );

  console.log('Context created, waiting for service worker...');
  
  let extensionId = '';
  
  try {
    const sw = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 });
    const url = new URL(sw.url());
    extensionId = url.hostname;
    console.log('Got extensionId from SW:', extensionId);
  } catch (e) {
    console.log('Error waiting for SW:', e.message);
    const sws = context.serviceWorkers();
    console.log('Service workers found:', sws.length);
    for (const sw of sws) {
      console.log('SW URL:', sw.url());
      const url = new URL(sw.url());
      extensionId = url.hostname;
      break;
    }
  }
  
  if (!extensionId) {
    console.log('Still no extensionId. Checking pages...');
    const pages = context.pages();
    for (const p of pages) {
      console.log('Page URL:', p.url());
    }
  }
  
  console.log('Final extensionId:', extensionId);
  
  if (extensionId) {
    const page = await context.newPage();
    const url = `chrome-extension://${extensionId}/sidebar/sidebar.html`;
    console.log('Opening side panel:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { timeout: 10000 });
    console.log('Side panel opened and #app found!');
    
    const title = await page.title();
    console.log('Page title:', title);
    
    // Check tabs
    const tabs = await page.$$('button.tab');
    console.log('Tab count:', tabs.length);
    
    await page.close();
  }
  
  await context.close();
  console.log('Done!');
} catch (e) {
  console.error('Fatal error:', e.message);
  console.error(e.stack);
}

try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
