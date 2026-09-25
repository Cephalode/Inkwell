import { chromium } from '/Users/sqibo/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'fs';
import { homedir } from 'os';

const cache = `${homedir()}/Library/Caches/ms-playwright`;
const shell = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell')).sort().pop();
const exe = `${cache}/${shell}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:8791/005-tutor-twopane/index.html', { waitUntil: 'networkidle' });
const m = await page.evaluate(() => {
  const s = document.querySelector('.side').getBoundingClientRect();
  const c = document.querySelector('.chatcol').getBoundingClientRect();
  const doc = document.scrollingElement;
  return {
    contextOnLeft: s.x < c.x,
    chatOnRight: c.x > s.x,
    contextX: Math.round(s.x), chatX: Math.round(c.x),
    contextW: Math.round(s.width), chatW: Math.round(c.width),
    pageScrolls: doc.scrollHeight > window.innerHeight + 1,
  };
});
console.log(JSON.stringify(m));
await browser.close();
