import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
await fs.mkdir('review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3002/#project/video'); await page.waitForTimeout(5000);
  await page.screenshot({ path: path.resolve('review/studio-preview.png') });
  console.log(JSON.stringify({ title: await page.title(), frames: page.frames().map(frame => frame.url()), buttons: await page.getByRole('button').allTextContents(), body: (await page.locator('body').innerText()).slice(0, 3000) }, null, 2));
} finally { await browser.close(); }
