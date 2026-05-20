import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const EXTENSION_PATH = '/home/claude-user/pagewise';
const PROFILE_DIR = path.join(EXTENSION_PATH, '.chrome-profile-r211');

try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// Approach: headless: false, --headless=new, but check chrome process output
console.log('Launching with --headless=new and verbose logging...');
const context = await chromium.launchPersistentContext(
  PROFILE_DIR,
  {
    headless: false,
    executablePath: '/usr/bin/google-chrome',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--headless=new',
      '--enable-logging=stderr',
      '--v=1',
    ],
    viewport: { width: 1280, height: 800 },
  }
);

// Try to navigate to a page and then check service workers
const page = await context.newPage();
await page.goto('https://example.com', { timeout: 10000 });
await page.waitForTimeout(5000);

console.log('\n=== Service Workers ===');
const sws = context.serviceWorkers();
console.log('Count:', sws.length);
for (const sw of sws) {
  console.log('  URL:', sw.url());
}

// Check if extensions loaded by navigating to chrome://extensions
const extPage = await context.newPage();
await extPage.goto('chrome://extensions/', { timeout: 10000 });
await extPage.waitForTimeout(3000);

// Get extension info via Chrome Extensions API page
const extInfo = await extPage.evaluate(() => {
  // The extensions manager is a web component
  const manager = document.querySelector('extensions-manager');
  if (manager) {
    return 'extensions-manager found';
  }
  return document.body?.innerHTML?.substring(0, 500) || 'empty body';
});
console.log('\nExtensions page:', extInfo);

await context.close();
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
