// Debug: upload inside the page and capture console + store state after.
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';

const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs.at(-1)}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001ff9ba769c30000000049454e44ae426082',
  'hex',
);

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 200)); });

await page.goto('http://localhost:3004/documents', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const before = await page.locator('[data-explorer-item]').count();
await page.setInputFiles('input[type="file"]', { name: 'consoleprobe.png', mimeType: 'image/png', buffer: PNG });
await page.waitForTimeout(6000);
const after = await page.locator('[data-explorer-item]').count();
const hasTile = await page.locator('[data-explorer-item]:has-text("consoleprobe.png")').count();

console.log(JSON.stringify({ before, after, hasTile, logs: logs.slice(0, 10) }, null, 1));

// cleanup
const docs = await fetch('http://localhost:3002/api/documents').then((r) => r.json());
for (const d of docs) if (d.name === 'consoleprobe.png') await fetch(`http://localhost:3002/api/documents/${d.id}`, { method: 'DELETE' });
await browser.close();
