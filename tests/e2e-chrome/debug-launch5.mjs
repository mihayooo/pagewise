import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(EXTENSION_PATH, '.chrome-profile-r211');

if (fs.existsSync(PROFILE_DIR)) {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// Find the exact chromium binary Playwright uses
const chromePath = execSync('npx playwright install --dry-run 2>&1 | grep "Install location" | head -1', { encoding: 'utf8' }).trim();
console.log('Playwright browser info:', chromePath);

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
        '--enable-logging=stderr',
        '--v=1',
      ],
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    }
  );

  console.log('Context created, waiting 10s...');
  
  // Listen for SW
  context.on('serviceworker', (sw) => {
    console.log('[EVENT] New service worker:', sw.url());
  });
  
  await new Promise(r => setTimeout(r, 10000));
  
  const sws = context.serviceWorkers();
  console.log('Service workers:', sws.length);
  
  // Try to directly navigate to the extension page
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://invalid/`, { timeout: 5000 });
  } catch (e) {
    console.log('Expected error for invalid extension URL:', e.message.substring(0, 100));
  }
  
  // Try checking chrome://extensions for errors
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Try to enable developer mode and load unpacked
  try {
    // Toggle developer mode
    const toggle = await page.$('extensions-toggle-row#devMode');
    if (toggle) {
      console.log('Found devMode toggle');
    }
    
    // Check page source for errors
    const html = await page.content();
    const errorMatches = html.match(/error|fail|Error|FAIL/gi);
    console.log('Error mentions in page:', errorMatches ? errorMatches.length : 0);
  } catch (e) {
    console.log('Chrome extensions page error:', e.message);
  }
  
  await context.close();
} catch (e) {
  console.error('Fatal:', e.message);
}

try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
