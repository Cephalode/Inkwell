// Click-behavior smoke: single click selects, double click opens.
import { readdirSync } from 'node:fs';
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs[dirs.length - 1]}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3004/documents', { waitUntil: 'networkidle' });

let passed = 0, failed = 0;
const check = (n, c) => { console.log(c ? `✓ ${n}` : `✗ ${n}`); c ? passed++ : failed++; };

// FILE tile: single click selects only (no preview modal)
const file = page.locator('[data-explorer-item]').filter({ has: page.locator('span.text-3xl') }).first();
await file.click();
await page.waitForTimeout(300);
const selected = await file.evaluate((el) => el.style.background.includes('color-mix'));
const modalOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"], .fixed.inset-0')));
check('file single click selects (highlight)', selected);
check('file single click does NOT open preview', !modalOpen);

// FILE tile: double click opens the preview modal
await file.dblclick();
await page.waitForTimeout(500);
const modalOpen2 = await page.evaluate(() => Boolean(document.querySelector('.fixed.inset-0, [role="dialog"]')));
check('file double click opens preview', modalOpen2);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// FOLDER tile: single click selects only (URL/breadcrumb unchanged)
const folder = page.locator('[data-explorer-item]').first(); // folders render first
const crumbBefore = await page.locator('div.overflow-x-auto').innerText();
await folder.click();
await page.waitForTimeout(300);
const crumbAfter = await page.locator('div.overflow-x-auto').innerText();
const folderSelected = await folder.evaluate((el) => el.style.background.includes('color-mix'));
check('folder single click selects', folderSelected);
check('folder single click does NOT navigate', crumbAfter === crumbBefore);

// FOLDER tile: double click navigates (breadcrumb gains the folder name)
await folder.dblclick();
await page.waitForTimeout(500);
const crumbOpen = await page.locator('div.overflow-x-auto').innerText();
check('folder double click navigates into folder', crumbOpen !== crumbBefore);

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
