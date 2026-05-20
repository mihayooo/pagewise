import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');

try {
  // Launch with chromium.launch and then use CDP to load extension
  const browser = await chromium.launch({
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
  });

  console.log('Browser launched (non-persistent)');
  await new Promise(r => setTimeout(r, 5000));
  
  const contexts = browser.contexts();
  console.log('Contexts:', contexts.length);
  for (const ctx of contexts) {
    const sws = ctx.serviceWorkers();
    console.log('  SW count:', sws.length);
    for (const sw of sws) {
      console.log('    SW URL:', sw.url());
    }
  }
  
  await browser.close();
} catch (e) {
  console.error('Error:', e.message);
}
