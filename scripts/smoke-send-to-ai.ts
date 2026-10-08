// Smoke: select → Send to AI → focus chip appears (NOT text in the input),
// chat opens, input stays empty; then assert the /api/chat payload's system
// prompt carries the whole learning page + the focus excerpt.
// Run with:  npx tsx scripts/smoke-send-to-ai.ts
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright/index.mjs';

const BASE = process.env.INKWELL_URL ?? 'http://localhost:3001';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let chatPayload: { system?: string; user?: string } | null = null;
page.on('request', (req) => {
  if (req.url().includes('/api/chat') && req.method() === 'POST') {
    try {
      const body = req.postDataJSON();
      const sys = body?.messages?.find((m: { role: string }) => m.role === 'system');
      const usr = body?.messages?.find((m: { role: string }) => m.role === 'user');
      chatPayload = { system: sys?.content, user: usr?.content };
    } catch { /* not json */ }
  }
});

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('button, a').filter({ hasText: 'Start learning' }).first().click().catch(() => {});
await page.waitForTimeout(2000);
const lessonBtn = page.locator('button').filter({ hasText: 'Lesson' }).first();
if (await lessonBtn.isVisible().catch(() => false)) {
  await lessonBtn.click();
  await page.waitForTimeout(2500);
}
const para = page.locator('p').filter({ hasText: /\S.*\S.*\S/ }).first();
if (!(await para.isVisible().catch(() => false))) {
  console.log('FAIL: no paragraph found. h1:', await page.locator('h1').first().innerText().catch(() => 'none'));
  await browser.close();
  process.exit(1);
}
const selText = ((await para.innerText()) || '').trim();
await para.click({ clickCount: 3 });
await page.waitForTimeout(500);

const sendBtn = page.locator('button', { hasText: 'Send to AI' }).first();
if (!(await sendBtn.isVisible().catch(() => false))) {
  console.log('FAIL: Send to AI pill not visible');
  await browser.close();
  process.exit(1);
}
await sendBtn.click();
await page.waitForTimeout(800);

// Input must stay EMPTY; the focus lives in a chip.
const ta = page.locator('textarea[placeholder*="Ask a question"]').first();
const inputVisible = await ta.isVisible().catch(() => false);
const inputVal = inputVisible ? await ta.inputValue() : '';
const chip = page.locator('span', { hasText: selText.slice(0, 30) }).last();
const chipVisible = await chip.isVisible().catch(() => false);
console.log('chat open:', inputVisible, '| input empty:', inputVal === '', '| focus chip visible:', chipVisible);

// Type a question and send — capture the system prompt.
await ta.fill('What is this page about?');
await page.keyboard.press('Enter');
for (let i = 0; i < 20 && !chatPayload; i++) await page.waitForTimeout(500);

const sys = chatPayload?.system ?? '';
console.log('system prompt has page ref:', sys.includes('LEARNING PAGE REFERENCE'));
console.log('system prompt has activity content:', sys.includes('Content of the open activity'));
console.log('system prompt has focus:', sys.includes(selText.slice(0, 60).replace(/[\\"]/g, '')));
console.log('user message:', JSON.stringify(chatPayload?.user?.slice(0, 60) ?? 'NONE'));

console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'ok: no console errors');
await browser.close();
const ok = inputVisible && inputVal === '' && chipVisible && sys.includes('LEARNING PAGE REFERENCE') && sys.includes(selText.slice(0, 40).replace(/[\\"]/g, ''));
if (!ok) process.exit(1);
console.log('PASS');
