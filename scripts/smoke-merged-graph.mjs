// Smoke: merged knowledge graph — graph view renders with the Topic Map style.
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';

const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs.at(-1)}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto('http://localhost:3001/documents', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Switch to Graph view
const graphBtn = page.locator('button[title="Graph view"]');
await graphBtn.click();
await page.waitForTimeout(6000); // let the force sim settle + initial fit

const result = await page.evaluate(() => {
  const filterLabels = Array.from(document.querySelectorAll('label span')).map(s => s.textContent).filter(t => t && t.length < 30);
  const canvases = document.querySelectorAll('canvas').length;
  const detailPanel = document.body.innerText.match(/Roadmap topics|Study guides|Card decks/g);
  return { canvases, filterLabels, legendMentions: detailPanel };
});
console.log(JSON.stringify(result, null, 2));

await page.screenshot({ path: '/tmp/inkwell-merged-graph.png' });
console.log('pageerrors:', errors.length ? errors : 'none');
await browser.close();
