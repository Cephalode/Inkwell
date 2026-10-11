// E2E: zip upload → server-side extraction into a new folder subtree.
// Run: node scripts/e2e-zip.mjs  (requires backend on :3002)
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:3002/api';
const results = [];
let passed = 0, failed = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++; else failed++;
}

async function api(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body && isForm) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

// ── Build a real test zip with the system zip binary ──────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'inkwell-zip-e2e-'));
const zipPath = join(tmp, 'Physics 101.zip');
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001ff9ba769c30000000049454e44ae426082',
  'hex',
);
const pdfBytes = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF',
  'utf8',
);
writeFileSync(join(tmp, 'lecture-notes.txt'), 'Week 1: kinematics');
writeFileSync(join(tmp, 'diagram.png'), PNG_BYTES);
execFileSync('mkdir', ['-p', join(tmp, 'slides', 'week1')]);
writeFileSync(join(tmp, 'slides', 'intro.pdf'), pdfBytes);
writeFileSync(join(tmp, 'slides', 'week1', 'detailed.pdf'), pdfBytes);
execFileSync('zip', ['-r', zipPath, 'lecture-notes.txt', 'diagram.png', 'slides'], { cwd: tmp });

const stamp = Date.now();
const ids = { folders: [], docs: [] };

try {
  // ── 1. Reject non-zip uploads ──
  const fdBad = new FormData();
  fdBad.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'not-a-zip.pdf');
  const rej = await api('POST', '/folders/root/unzip', fdBad, true);
  check('non-zip rejected (400)', rej.status === 400, JSON.stringify(rej.data));

  // ── 2. Extract into root ──
  const zipBuf = execFileSync('cat', [zipPath]);
  const fd = new FormData();
  fd.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'Physics 101.zip');
  const up = await api('POST', '/folders/root/unzip', fd, true);
  check('extract into root (201)', up.status === 201, JSON.stringify(up.data)?.slice(0, 160));
  check('folder named after archive', up.data?.folder?.name === 'Physics 101', up.data?.folder?.name);
  check('counts (4 files, 3 folders incl. root)', up.data?.documentsCreated === 4 && up.data?.foldersCreated === 3,
    `docs=${up.data?.documentsCreated} folders=${up.data?.foldersCreated}`);
  const rootFolderId = up.data?.folder?.id;
  ids.folders.push(rootFolderId);

  // ── 3. Tree shape inside the extraction ──
  const tree = await api('GET', '/folders/tree');
  const slides = tree.data?.find((f) => f.name === 'slides' && f.parentId === rootFolderId);
  const week1 = tree.data?.find((f) => f.name === 'week1' && f.parentId === slides?.id);
  check('slides/ folder created under archive root', Boolean(slides));
  check('slides/week1/ nested folder created', Boolean(week1));
  const slidesT = tree.data?.find((f) => f.id === slides?.id);
  const week1T = tree.data?.find((f) => f.id === week1?.id);
  check('doc counts (slides=1, week1=1, root=2)', slidesT?.docCount === 1 && week1T?.docCount === 1 && tree.data?.find((f) => f.id === rootFolderId)?.docCount === 2,
    `slides=${slidesT?.docCount} week1=${week1T?.docCount} root=${tree.data?.find((f) => f.id === rootFolderId)?.docCount}`);
  if (slides) ids.folders.push(slides.id);
  if (week1) ids.folders.push(week1.id);

  // ── 4. Extracted documents: types, folder placement, classify skipped ──
  const docs = await api('GET', '/documents');
  // Only docs created by THIS run — leftover orphans from earlier failed runs
  // (folder deleted → folderId NULL) would otherwise collide in byName.
  const mine = (docs.data ?? []).filter((d) => new Date(d.createdAt).getTime() >= stamp);
  const byName = new Map(mine.map((d) => [d.name, d]));
  const notes = byName.get('lecture-notes.txt');
  const png = byName.get('diagram.png');
  const intro = byName.get('intro.pdf');
  const detailed = byName.get('detailed.pdf');
  check('all 4 files became documents', Boolean(notes && png && intro && detailed));
  check('txt typed txt', notes?.type === 'txt', notes?.type);
  check('png typed image', png?.type === 'image', png?.type);
  check('pdfs typed pdf', intro?.type === 'pdf' && detailed?.type === 'pdf');
  check('placement (root, root, slides, week1)',
    notes?.folderId === rootFolderId && png?.folderId === rootFolderId &&
    intro?.folderId === slides?.id && detailed?.folderId === week1?.id,
    `notes=${notes?.folderId === rootFolderId} png=${png?.folderId === rootFolderId} intro=${intro?.folderId === slides?.id} detailed=${detailed?.folderId === week1?.id}`);
  check('classify skipped for extracted docs', notes?.classifyStatus === 'skipped', notes?.classifyStatus);
  for (const d of [notes, png, intro, detailed]) if (d) ids.docs.push(d.id);

  // ── 5. Download round-trip: content survives Storage ──
  const dl = await fetch(`${BASE}/documents/${png.id}/download`);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  check('extracted file downloads intact', dl.status === 200 && dlBuf.equals(PNG_BYTES), `${dlBuf.length}B`);

  // ── 6. Extract into a nested destination folder ──
  const dest = await api('POST', '/folders', { name: `e2e-zip-dest-${stamp}` });
  ids.folders.push(dest.data.id);
  const fd2 = new FormData();
  fd2.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'Second Drop.zip');
  const up2 = await api('POST', `/folders/${dest.data.id}/unzip`, fd2, true);
  check('extract into nested folder (201)', up2.status === 201 && up2.data?.folder?.parentId === dest.data.id,
    `parent=${up2.data?.folder?.parentId}`);
  if (up2.data?.folder?.id) ids.folders.push(up2.data.folder.id);

  // ── 7. Unknown destination rejected ──
  const fd3 = new FormData();
  fd3.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'Third.zip');
  const up3 = await api('POST', '/folders/nonexistent-id/unzip', fd3, true);
  check('unknown destination rejected (400)', up3.status === 400);

  // ── 8. Corrupt zip rejected cleanly ──
  const fd4 = new FormData();
  fd4.append('file', new Blob([Buffer.from('this is not a zip file')], { type: 'application/zip' }), 'Corrupt.zip');
  const up4 = await api('POST', '/folders/root/unzip', fd4, true);
  check('corrupt zip rejected (400)', up4.status === 400, JSON.stringify(up4.data)?.slice(0, 120));

  // ── 9. Zip-slip: traversal entry must not create rogue folders ──
  execFileSync('mkdir', ['-p', join(tmp, 'evil')]);
  writeFileSync(join(tmp, 'evil', 'pwned.txt'), 'zip slip probe');
  // Build evil.zip with a ../ traversal entry via python (zip CLI refuses).
  execFileSync('python3', ['-c', `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    z.writestr('../escaped.txt', 'should never land')
    z.writestr('normal.txt', 'fine')
`, join(tmp, 'evil.zip')]);
  const evilBuf = execFileSync('cat', [join(tmp, 'evil.zip')]);
  const fd5 = new FormData();
  fd5.append('file', new Blob([evilBuf], { type: 'application/zip' }), 'evil.zip');
  const up5 = await api('POST', '/folders/root/unzip', fd5, true);
  check('zip-slip archive extracted safely (201)', up5.status === 201, JSON.stringify(up5.data)?.slice(0, 120));
  check('traversal entry dropped (1 file, 1 folder)', up5.data?.documentsCreated === 1 && up5.data?.foldersCreated === 1,
    `docs=${up5.data?.documentsCreated} folders=${up5.data?.foldersCreated}`);
  const slipDocs = await api('GET', '/documents');
  const escaped = (slipDocs.data ?? []).find((d) => d.name === 'escaped.txt' || d.name === '..escaped.txt');
  check('no escaped.txt anywhere in documents', !escaped);
  if (up5.data?.folder?.id) ids.folders.push(up5.data.folder.id);
  const slipDoc = (slipDocs.data ?? []).find((d) => d.name === 'normal.txt');
  if (slipDoc) ids.docs.push(slipDoc.id);

} finally {
  // ── Cleanup: delete created docs + folders ──
  for (const id of ids.docs) {
    try { await api('DELETE', `/documents/${id}`); } catch { /* best effort */ }
  }
  for (const id of ids.folders) {
    try { await api('DELETE', `/folders/${id}`); } catch { /* best effort */ }
  }
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
