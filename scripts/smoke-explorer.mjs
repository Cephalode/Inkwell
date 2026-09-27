// Smoke: Documents page file explorer — toolbar, folder create, upload,
// preview modal, layout toggle, rename, delete-confirm. Run: node scripts/smoke-explorer.mjs
import { chromium } from '/Users/cephalode/.npm/_npx/8aba6135655dd455/node_modules/playwright-core/index.mjs';
import { readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PORT = process.env.IW_PORT || '3004';
const stamp = Date.now();
const FOLDER = `smoke-folder-${stamp}`;
const FILE = `smoke-file-${stamp}.png`;

// Valid 32×32 RGBA PNG (crunch-generated) — hand-rolled fixtures crash the
// client-side thumbnail parser (libpng IDAT check) and abort the upload.
function makePng(width, height) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const o = rowStart + 1 + x * 4;
      raw[o] = (x * 8) % 256; raw[o + 1] = (y * 8) % 256; raw[o + 2] = 200; raw[o + 3] = 255;
    }
  }
  const idat = deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}

const PNG = makePng(32, 32);

const cache = '/Users/cephalode/Library/Caches/ms-playwright';
const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
const exe = `${cache}/${dirs.at(-1)}/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const checks = [];
const check = (name, ok, detail = '') => checks.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);

await page.goto(`http://localhost:${PORT}/documents`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 1. Toolbar renders
check('toolbar Upload button', await page.locator('button:has-text("Upload")').first().isVisible());
check('toolbar New folder button', await page.locator('button[title="New folder"]').first().isVisible());
check('sort control', await page.locator('button:has-text("Date")').first().isVisible());
check('folder tree sidebar', await page.locator('[role="tree"], aside').first().isVisible());
check('breadcrumbs root', await page.locator('button:has-text("All documents")').first().isVisible());

// 2. Create a folder via toolbar
await page.locator('button[title="New folder"]').first().click();
await page.locator('input[placeholder="Folder name…"]').fill(FOLDER);
await page.locator('input[placeholder="Folder name…"]').press('Enter');
await page.waitForTimeout(1200);
const folderTile = page.locator(`[data-explorer-item]:has-text("${FOLDER}")`).first();
check('folder tile appears', await folderTile.isVisible());

// 3. Upload a file (goes to current folder = root)
await page.setInputFiles('input[type="file"]', { name: FILE, mimeType: 'image/png', buffer: PNG });
await page.waitForTimeout(3000);
const fileTile = page.locator(`[data-explorer-item]:has-text("${FILE}")`).first();
check('file tile appears', await fileTile.isVisible());

// 4. Preview modal on click
await fileTile.click();
await page.waitForTimeout(800);
const dialog = page.locator('[role="dialog"]');
check('preview modal opens', await dialog.isVisible());
check('preview shows image', await dialog.locator('img').first().isVisible());
await page.screenshot({ path: '/tmp/inkwell-explorer-preview.png' });
await dialog.locator('button[title="Close preview"]').click();
await page.waitForTimeout(400);
check('preview closes', (await dialog.count()) === 0);

// 5. Sort menu: switch to Name asc
await page.locator('button:has-text("Date")').first().click();
await page.locator('button:has-text("Name")').first().click();
await page.waitForTimeout(400);
check('sort switches to Name', await page.locator('button:has-text("Name")').first().isVisible());

// 6. Layout toggle → list
await page.locator('button[title="View layout"]').click();
await page.waitForTimeout(300);
await page.locator('button:has-text("list")').first().click();
await page.waitForTimeout(500);
check('list rows render', (await page.locator('[data-explorer-item][role="row"]').count()) >= 2);
await page.screenshot({ path: '/tmp/inkwell-explorer-list.png' });

// 7. Rename the file via ⋯ menu (input is controlled — target it structurally)
const row = page.locator(`[data-explorer-item]:has-text("${FILE}")`).first();
await row.locator('button[aria-label^="Options for"]').click();
await page.waitForTimeout(300);
await page.locator('div.fixed button:has-text("Rename")').click();
await page.waitForTimeout(300);
// Once renaming, the row's name text is replaced by an input, so target the
// visible rename input directly (only one exists at a time).
const renameInput = page.locator('[data-explorer-item] input:visible').first();
await renameInput.fill(`renamed-${stamp}.png`);
await renameInput.press('Enter');
await page.waitForTimeout(1500);
check('rename applied', await page.locator(`[data-explorer-item]:has-text("renamed-${stamp}.png")`).first().isVisible());

// 8. Delete file via ⋯ menu + ConfirmDialog
const renamedRow = page.locator(`[data-explorer-item]:has-text("renamed-${stamp}.png")`).first();
await renamedRow.locator('button[aria-label^="Options for"]').click();
await page.waitForTimeout(300);
await page.locator('div.fixed button:has-text("Delete")').click();
await page.waitForTimeout(400);
check('confirm dialog shows', await page.locator('button:has-text("Delete")').last().isVisible());
await page.locator('button:has-text("Delete")').last().click();
await page.waitForTimeout(1500);
check('file deleted', (await page.locator(`[data-explorer-item]:has-text("renamed-${stamp}.png")`).count()) === 0);

// 9. Delete folder (should confirm + disappear)
await page.locator(`[data-explorer-item]:has-text("${FOLDER}")`).first().locator('button[aria-label^="Options for"]').click();
await page.waitForTimeout(300);
await page.locator('div.fixed button:has-text("Delete")').click();
await page.waitForTimeout(400);
await page.locator('button:has-text("Delete")').last().click();
await page.waitForTimeout(1500);
check('folder deleted', (await page.locator(`[data-explorer-item]:has-text("${FOLDER}")`).count()) === 0);

await page.screenshot({ path: '/tmp/inkwell-explorer-final.png' });
console.log(checks.join('\n'));
const failed = checks.filter((c) => c.startsWith('✗')).length;
console.log(`\npageerrors: ${errors.length ? errors : 'none'}`);
console.log(`${checks.length - failed} passed, ${failed} failed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
