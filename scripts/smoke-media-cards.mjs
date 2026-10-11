// Smoke: documents page inline media players + icons after type normalization.
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
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.card'));
  const mediaCards = cards.filter(c => c.querySelector('audio, video'));
  const audioPlayers = document.querySelectorAll('.card audio[controls]').length;
  const videoPlayers = document.querySelectorAll('.card video[controls]').length;
  const firstAudio = document.querySelector('.card audio[controls]');
  const icons = Array.from(document.querySelectorAll('.card .text-2xl, .card .text-3xl')).map(e => e.textContent);
  const badges = Array.from(document.querySelectorAll('.card')).slice(0, 6).map(c => c.textContent?.slice(0, 90));
  return {
    totalCards: cards.length,
    audioPlayers,
    videoPlayers,
    firstAudioSrc: firstAudio ? firstAudio.getAttribute('src') : null,
    icons,
    badges,
  };
});
console.log(JSON.stringify(result, null, 2));

await page.screenshot({ path: '/tmp/inkwell-media-cards.png', fullPage: false });
console.log('pageerrors:', errors.length ? errors : 'none');
await browser.close();
