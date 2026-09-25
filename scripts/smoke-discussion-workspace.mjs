
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';

const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs.at(-1)}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('https://cephalode.vercel.app/learn/steps/e2e5a56b-61c6-4920-aaf2-d125f02c3ec1?start=discussion', { timeout: 60000, waitUntil: 'domcontentloaded' });

// Wait for the workspace root itself (activity POST + tutor opener can take ~10-90s)
let wsFound = true;
try {
  await page.locator('[data-leave-confirm]').waitFor({ timeout: 120000 });
} catch { wsFound = false; }

const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
const checks = {
  workspace_mounted: wsFound,
  title_neural: body.includes('neural networks'),
  kicker_talk: body.includes('talk it through'),
  objectives_card: body.includes('be able to do'),
  session_card: body.includes('this session'),
  history_label: body.includes('history') || body.includes('turns'), // absent until first evidence
  tutor_opener: body.includes('welcome') || body.includes('own words'),
  end_session_btn: body.includes('end session'),
  textarea: null,
};
console.log('CHECKS', JSON.stringify(checks));

const geo = await page.evaluate(() => {
  const root = document.querySelector('[data-leave-confirm]');
  if (!root) return null;
  const cs = getComputedStyle(root);
  const cols = [...root.children].map(c => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; });
  return { display: cs.display, flexDirection: cs.flexDirection, cols, vw: innerWidth };
});
console.log('GEOMETRY', JSON.stringify(geo));

// One real turn through the UI
let turnSent = 'no-textarea';
const ta = page.locator('[data-leave-confirm] textarea').first();
if (wsFound && await ta.count()) {
  checks.textarea = true;
  await ta.fill('Each neuron computes a weighted sum of its inputs plus a bias, then applies a nonlinearity like ReLU. Training adjusts weights with backpropagation and gradient descent.');
  await page.locator('[data-leave-confirm] button:has-text("Send")').first().click();
  try {
    await page.getByText(/Turn \d+ of 8/).first().waitFor({ timeout: 120000 });
    turnSent = 'true';
  } catch { turnSent = 'false'; }
}
console.log('TURN_SENT=' + turnSent);
console.log('PAGE_ERRORS', JSON.stringify(errors.slice(0, 5)));
await page.screenshot({ path: '/Users/cephalode/dev/inkwell/scripts/workspace-smoke.png' });
await browser.close();

const ok = wsFound && Object.entries(checks).every(([k, v]) => k === 'textarea' || v === true)
  && geo && geo.cols.length === 2 && geo.cols[0].x < geo.cols[1].x
  && turnSent === 'true';
process.exit(ok ? 0 : 2);
