// Same flow against production (https://inkwell.cephalode.com).
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('https://inkwell.cephalode.com/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('button, a').filter({ hasText: 'Start learning' }).first().click().catch(() => {});
await page.waitForTimeout(2000);
const lessonBtn = page.locator('button').filter({ hasText: 'Lesson' }).first();
if (await lessonBtn.isVisible().catch(() => false)) {
  await lessonBtn.click();
  await page.waitForTimeout(2500);
}
const para = page.locator('p').filter({ hasText: /\S.*\S.*\S/ }).first();
if (!(await para.isVisible().catch(() => false))) {
  console.log('FAIL: step paragraph not found (prod data differs?) — h1:', await page.locator('h1').first().innerText().catch(() => 'none'));
  await browser.close(); process.exit(1);
}
await para.click({ clickCount: 3 });
await page.waitForTimeout(600);
const sendBtn = page.locator('button', { hasText: 'Send to AI' }).first();
const pillVisible = await sendBtn.isVisible().catch(() => false);
console.log('Send to AI visible:', pillVisible);
if (!pillVisible) { await browser.close(); process.exit(1); }
await sendBtn.click();
await page.waitForTimeout(800);
const input = page.locator('textarea[placeholder*="Ask a question"]').first();
const chatVisible = await input.isVisible().catch(() => false);
const val = chatVisible ? await input.inputValue() : '';
console.log('chat input visible:', chatVisible);
console.log('input value:', JSON.stringify(val.slice(0, 80)));
const ok = chatVisible && val.startsWith('"') && val.length > 5;
console.log(errors.length ? `console errors: ${errors.slice(0, 3).join(' | ')}` : 'ok: no console errors');
await browser.close();
if (!ok) process.exit(1);
console.log('PASS');
