import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(EXTENSION_PATH, '.chrome-profile-test');

if (fs.existsSync(PROFILE_DIR)) {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PROFILE_DIR, { recursive: true });

// Check what Chromium version Playwright uses
const execPath = chromium.executablePath();
console.log('Playwright chromium executable:', execPath);
console.log('Exists:', fs.existsSync(execPath));

try {
  const context = await chromium.launchPersistentContext(
    PROFILE_DIR,
    {
      headless: false,
      channel: 'chrome', // Use system Chrome instead of Playwright's bundled
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
    }
  );

  console.log('Context created');
  
  context.on('serviceworker', (sw) => {
    console.log('SW EVENT:', sw.url());
  });
  
  await new Promise(r => setTimeout(r, 8000));
  
  const sws = context.serviceWorkers();
  console.log('Service workers:', sws.length);
  for (const sw of sws) {
    console.log('  URL:', sw.url());
  }
  
  await context.close();
} catch (e) {
  console.error('Error:', e.message.substring(0, 300));
}

try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}
