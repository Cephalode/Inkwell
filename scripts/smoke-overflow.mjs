// Overflow smoke: long folder/course names must stay inside their boxes.
// Checks the course sidebar rows, breadcrumb, and grid tiles clamp text via
// ellipsis (scrollWidth <= clientWidth on the truncating span, and no child
// of the sidebar/document.body overflows the viewport width).
import { readdirSync } from 'node:fs';
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3004';
const API = process.env.API_URL || 'http://localhost:3002';

const LONG = 'Introduction to Machine Learning: Unsupervised Learning — Extremely Long Course Name Edition For Overflow Testing 2026';

const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs[dirs.length - 1]}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let passed = 0, failed = 0;
function check(name, cond) {
  console.log(cond ? `✓ ${name}` : `✗ ${name}`);
  cond ? passed++ : failed++;
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok && res.status !== 404) throw new Error(`${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// 1. Create a course with a really long name
const created = await api('/courses', { method: 'POST', body: JSON.stringify({ id: `course_overflow_${Date.now()}`, name: LONG }) });
check('course with long name created', Boolean(created?.id));

await page.goto(`${BASE}/documents`, { waitUntil: 'networkidle' });

// 2. Course folder row (now in the tree, not a separate Courses list) truncates.
const row = page.locator('aside [role="treeitem"]', { hasText: 'Extremely Long Course Name' }).first();
await row.waitFor({ timeout: 10000 });
const rowMetrics = await row.evaluate((rowEl) => {
  const span = Array.from(rowEl.querySelectorAll('span')).find((s) => s.className.includes('truncate'));
  const aside = rowEl.closest('aside');
  const rr = rowEl.getBoundingClientRect();
  const ar = aside.getBoundingClientRect();
  return {
    hasSpan: Boolean(span),
    spanClamped: span ? (span.scrollWidth > span.clientWidth ? getComputedStyle(span).textOverflow === 'ellipsis' : true) : false,
    insideSidebar: rr.right <= ar.right + 1 && rr.left >= ar.left - 1,
  };
});
check('tree row has truncating span', rowMetrics.hasSpan);
check('tree span clamped (ellipsis works)', rowMetrics.spanClamped);
check('tree row stays inside sidebar box', rowMetrics.insideSidebar);

// 3. No horizontal overflow of the page/sidebar
const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('no horizontal page overflow', pageOverflow);

// 4. Open the course folder → breadcrumb truncates inside the address bar
await row.click({ clickCount: 2 });
await page.waitForTimeout(400);
const crumb = await page.evaluate(() => {
  const bar = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('overflow-x-auto') && d.querySelector('button'));
  if (!bar) return null;
  const barRect = bar.getBoundingClientRect();
  const btns = Array.from(bar.querySelectorAll('button'));
  const last = btns[btns.length - 1];
  const r = last.getBoundingClientRect();
  const cs = getComputedStyle(last);
  const clamped = last.scrollWidth > last.clientWidth ? cs.textOverflow === 'ellipsis' && cs.overflow === 'hidden' : true;
  return { inside: r.right <= barRect.right + 1, clamped };
});
check('breadcrumb course chip clamped inside address bar', Boolean(crumb?.inside && crumb?.clamped));

// 5. Long-named FILE in a grid tile stays inside its card
const doc = await api('/documents', { method: 'POST', body: JSON.stringify({}) }).catch(() => null);
// create a doc directly via DB-free route: upload isn't easy headless — instead rename an existing doc
const docs = await api('/documents');
if (docs.length > 0) {
  const target = docs[0];
  const oldName = target.name;
  await api(`/documents/${target.id}`, { method: 'PATCH', body: JSON.stringify({ name: `${LONG}.pdf` }) });
  await page.reload({ waitUntil: 'networkidle' });
  const tile = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[data-explorer-item]')).find((d) => d.textContent.includes('Extremely Long Course Name'));
    if (!el) return null;
    const span = el.querySelector('span.truncate');
    const r = el.getBoundingClientRect();
    return {
      found: true,
      clamped: span ? span.scrollWidth <= span.clientWidth + 1 : false,
      insideViewport: r.right <= window.innerWidth + 1,
    };
  });
  check('long-named file tile found', Boolean(tile?.found));
  check('file tile name clamped with ellipsis', Boolean(tile?.clamped));
  check('file tile stays inside viewport', Boolean(tile?.insideViewport));
  await api(`/documents/${target.id}`, { method: 'PATCH', body: JSON.stringify({ name: oldName }) });
}

// cleanup course
await api(`/courses/${created.id}`, { method: 'DELETE' });

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
