// Debug: capture the documents page state after an upload to see what rendered.
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';

const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs.at(-1)}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('http://localhost:3004/documents', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const state = await page.evaluate(() => ({
  title: document.title,
  hasToolbar: Boolean(document.querySelector('button[title="New folder"]')),
  itemCount: document.querySelectorAll('[data-explorer-item]').length,
  itemTexts: Array.from(document.querySelectorAll('[data-explorer-item]')).slice(0, 8).map((e) => e.textContent?.slice(0, 60)),
  treeRows: document.querySelectorAll('[role="treeitem"], [role="tree"] > div').length,
  bodySnippet: document.body.innerText.slice(0, 600),
}));
console.log(JSON.stringify(state, null, 1));

await page.screenshot({ path: '/tmp/inkwell-debug-page.png', fullPage: false });
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
