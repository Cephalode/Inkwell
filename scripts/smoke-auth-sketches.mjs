// Smoke-check the auth sketches (Google-only): 010-ink-editorial, 011-quiet-card, 012-big-ledger, auth-switcher.
// Usage: node scripts/smoke-auth-sketches.mjs [baseUrl]
// Assumes a static server serving sketches/ at baseUrl (default http://localhost:8033).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// playwright-core may not be installed in this repo — borrow a copy via PW_PATH if needed.
const pwMod = await import(process.env.PW_PATH || 'playwright-core');
const chromium = pwMod.chromium ?? pwMod.default?.chromium;

const BASE = process.argv[2] || 'http://localhost:8033';
// Find a Chromium binary: prefer cached chrome-headless-shell, fall back to full chromium.
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const entries = existsSync(cache) ? readdirSync(cache) : [];
const shellDir = entries.find(d => d.startsWith('chromium_headless_shell'));
const chromeDir = entries.find(d => d.startsWith('chromium-'));
let exe;
if (shellDir) {
  exe = join(cache, shellDir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
} else if (chromeDir) {
  exe = join(cache, chromeDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
}
if (!exe || !existsSync(exe)) { console.error('FAIL: no chromium binary in ~/Library/Caches/ms-playwright'); process.exit(1); }

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); } };

const browser = await chromium.launch({ executablePath: exe });

async function overflowFree(page, label) {
  const m = await page.evaluate(() => ({
    sw: document.scrollingElement.scrollWidth, iw: window.innerWidth,
  }));
  ok(m.sw <= m.iw, `${label}: no horizontal overflow (${m.sw} <= ${m.iw})`);
}

// ---------- 010 ----------
{
  console.log('010-ink-editorial');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/010-ink-editorial/index.html`, { waitUntil: 'networkidle' });
  ok((await page.title()).includes('010'), 'title mentions 010');
  const dl = await page.textContent('#dl-date');
  ok(dl && dl.includes('2026'), `dateline filled: "${dl}"`);
  ok(await page.isVisible('.btn-google'), 'Google button visible');
  const body = (await page.content()).toLowerCase();
  ok(!body.includes('guest'), 'no "guest" anywhere in page');
  ok(!body.includes('observer'), 'no "observer" wording left');
  ok(!body.includes('slip') && !body.includes('openSlip'.toLowerCase()), 'no admission-slip remnants');
  await overflowFree(page, 'desktop 1280');
  await page.screenshot({ path: '/tmp/auth-sketch-010.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await overflowFree(page, 'mobile 390');
  await page.screenshot({ path: '/tmp/auth-sketch-010-mobile.png' });
  await page.click('.btn-google');
  await page.waitForTimeout(1700);
  const note = await page.textContent('#g-note');
  ok(note && note.length > 0, `google flow ends with note: "${note}"`);
  await page.close();
}

// ---------- 011 ----------
{
  console.log('011-quiet-card');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/011-quiet-card/index.html`, { waitUntil: 'networkidle' });
  ok((await page.title()).includes('011'), 'title mentions 011');
  ok(await page.isVisible('.card'), 'card visible');
  ok(await page.isVisible('.btn-google'), 'Google button visible');
  const body = (await page.content()).toLowerCase();
  ok(!body.includes('guest'), 'no "guest" anywhere in page');
  ok(!body.includes('guestflow') && !body.includes('welcome-inner') && !body.includes('enter-btn'), 'no guest-panel remnants');
  await overflowFree(page, 'desktop 1280');
  await page.screenshot({ path: '/tmp/auth-sketch-011.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await overflowFree(page, 'mobile 390');
  await page.click('.btn-google');
  await page.waitForTimeout(1700);
  const err = await page.textContent('#g-err');
  ok(err && err.length > 0, `google flow ends with note: "${err}"`);
  await page.close();
}

// ---------- 012 ----------
{
  console.log('012-big-ledger');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/012-big-ledger/index.html`, { waitUntil: 'networkidle' });
  ok((await page.title()).includes('012'), 'title mentions 012');
  const h1 = await page.textContent('.lhs h1');
  ok(h1.includes('ledger'), `headline present: "${h1.trim()}"`);
  ok((await page.$$('.way')).length === 1, 'exactly ONE sign-in row (google)');
  const body = (await page.content()).toLowerCase();
  ok(!body.includes('guest'), 'no "guest" anywhere in page');
  ok(!body.includes('gcard') && !body.includes('sitting'), 'no one-sitting-card remnants');
  await overflowFree(page, 'desktop 1280');
  await page.screenshot({ path: '/tmp/auth-sketch-012.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await overflowFree(page, 'mobile 390');
  const entriesHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.entries')).display === 'none');
  ok(entriesHidden, 'mobile: value entries collapsed');
  await page.screenshot({ path: '/tmp/auth-sketch-012-mobile.png' });
  await page.click('.way');
  await page.waitForTimeout(1700);
  const note = await page.textContent('#g-note');
  ok(note && note.length > 0, `google flow ends with note: "${note}"`);
  await page.close();
}

// ---------- switcher ----------
{
  console.log('auth-switcher');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/auth-switcher/index.html`, { waitUntil: 'networkidle' });
  const src0 = await page.getAttribute('#frame', 'src');
  ok(src0.includes('010'), `initial frame is 010 (${src0})`);
  await page.click('#b-011');
  await page.waitForTimeout(600);
  const src1 = await page.getAttribute('#frame', 'src');
  ok(src1.includes('011'), `tab click swaps to 011 (${src1})`);
  const inner = await page.evaluate(() => {
    const f = document.getElementById('frame');
    return f.contentDocument && f.contentDocument.title;
  });
  ok(inner && inner.includes('011'), 'iframe content actually loaded 011');
  await page.click('#b-012');
  await page.waitForTimeout(600);
  ok((await page.getAttribute('#frame', 'src')).includes('012'), 'tab click swaps to 012');
  await page.screenshot({ path: '/tmp/auth-sketch-switcher.png' });
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
