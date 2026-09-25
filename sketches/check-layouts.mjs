import { chromium } from '/Users/sqibo/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'fs';
import { homedir } from 'os';

const cache = `${homedir()}/Library/Caches/ms-playwright`;
const shell = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell')).sort().pop();
const exe = `${cache}/${shell}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

const variants = ['004-tutor-focus', '005-tutor-twopane', '006-tutor-stage'];
const out = {};
for (const v of variants) {
  await page.goto(`http://localhost:8791/${v}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const doc = document.scrollingElement;
    const t = document.querySelector('.transcript');
    return {
      pageScrolls: doc.scrollHeight > window.innerHeight + 1,
      pageOverflowPx: doc.scrollHeight - window.innerHeight,
      transcriptScrolls: t ? t.scrollHeight > t.clientHeight + 1 : null,
      transcriptVisiblePx: t ? t.clientHeight : null,
      overflowX: doc.scrollWidth > window.innerWidth + 1,
      bubbles: document.querySelectorAll('.msg').length,
    };
  });
  await page.screenshot({ path: `/Users/sqibo/dev/inkwell/sketches/${v}/screenshot.png` });
  out[v] = m;
}
// also screenshot the switcher index
await page.goto('http://localhost:8791/tutor-switcher/index.html', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/Users/sqibo/dev/inkwell/sketches/tutor-switcher/screenshot.png' });

console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS=' + errors.length, errors.slice(0, 3));
await browser.close();
