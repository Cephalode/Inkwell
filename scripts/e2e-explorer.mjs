// E2E: Documents-page file explorer — folders CRUD, uploads into folders,
// move (legal + illegal), rename, delete-promotes-children, download.
// Run: node scripts/e2e-explorer.mjs  (requires backend on :3002)
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';

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

// ── Setup: test PDF (real enough for the server to accept; it stores bytes) ──
const pdfBytes = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF',
  'utf8',
);
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0300050001ff9ba769c30000000049454e44ae426082',
  'hex',
);

const stamp = Date.now();
const ids = { folders: [], docs: [] };

try {
  // ── 1. Folder tree: create nested folders ──
  const root = await api('POST', '/folders', { name: `e2e-root-${stamp}` });
  check('create root folder', root.status === 201 && root.data?.id);
  ids.folders.push(root.data.id);

  const child = await api('POST', '/folders', { name: `e2e-child-${stamp}`, parentId: root.data.id });
  check('create nested folder', child.status === 201 && child.data?.parentId === root.data.id);
  ids.folders.push(child.data.id);

  const grandchild = await api('POST', '/folders', { name: `e2e-grandchild-${stamp}`, parentId: child.data.id });
  check('create grandchild folder', grandchild.status === 201);
  ids.folders.push(grandchild.data.id);

  const badParent = await api('POST', '/folders', { name: 'orphan', parentId: 'nonexistent-id' });
  check('create with unknown parent rejected (400)', badParent.status === 400);

  // ── 2. Tree shape ──
  const tree = await api('GET', '/folders/tree');
  const rootT = tree.data?.find((f) => f.id === root.data.id);
  const childT = tree.data?.find((f) => f.id === child.data.id);
  check('tree lists folders', Boolean(rootT && childT));
  check('tree hasChildren flag', rootT?.hasChildren === true);
  check('tree ancestry (child isDescendantOf root)', childT?.isDescendantOf?.[root.data.id] === true);

  // ── 3. Upload file into child folder ──
  const fd = new FormData();
  fd.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `e2e-doc-${stamp}.pdf`);
  fd.append('folderId', child.data.id);
  const up = await api('POST', '/documents', fd, true);
  check('upload into folder', up.status === 201 && up.data?.folderId === child.data.id, `type=${up.data?.type}`);
  ids.docs.push(up.data.id);

  // PNG upload → type image
  const fdImg = new FormData();
  fdImg.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), `e2e-img-${stamp}.png`);
  fdImg.append('folderId', root.data.id);
  const upImg = await api('POST', '/documents', fdImg, true);
  check('image upload typed image', upImg.status === 201 && upImg.data?.type === 'image');
  ids.docs.push(upImg.data.id);

  // Upload into unknown folder rejected
  const fdBad = new FormData();
  fdBad.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'bad.pdf');
  fdBad.append('folderId', 'nonexistent-folder');
  const upBad = await api('POST', '/documents', fdBad, true);
  check('upload to unknown folder rejected (400)', upBad.status === 400);

  // ── 4. Tree doc counts ──
  const tree2 = await api('GET', '/folders/tree');
  const childT2 = tree2.data?.find((f) => f.id === child.data.id);
  const rootT2 = tree2.data?.find((f) => f.id === root.data.id);
  check('doc counts (child=1, root=1)', childT2?.docCount === 1 && rootT2?.docCount === 1, `child=${childT2?.docCount} root=${rootT2?.docCount}`);

  // ── 5. Rename folder + doc ──
  const ren = await api('PATCH', `/folders/${child.data.id}`, { name: `e2e-child-renamed-${stamp}` });
  check('rename folder', ren.status === 200 && ren.data?.name === `e2e-child-renamed-${stamp}`);

  const renDoc = await api('PATCH', `/documents/${up.data.id}`, { name: `e2e-doc-renamed-${stamp}.pdf` });
  check('rename document', renDoc.status === 200 && renDoc.data?.name === `e2e-doc-renamed-${stamp}.pdf`);

  // ── 6. Moves ──
  const mv = await api('PATCH', `/documents/${upImg.data.id}`, { folderId: grandchild.data.id });
  check('move doc into grandchild', mv.status === 200 && mv.data?.folderId === grandchild.data.id);

  const mvOut = await api('PATCH', `/documents/${upImg.data.id}`, { folderId: null });
  check('move doc out to root', mvOut.status === 200 && (mvOut.data?.folderId ?? null) === null);

  const moveChild = await api('PATCH', `/folders/${child.data.id}`, { parentId: grandchild.data.id });
  check('folder→own-subtree move rejected (400)', moveChild.status === 400);
  const moveSelf = await api('PATCH', `/folders/${root.data.id}`, { parentId: root.data.id });
  check('folder→self move rejected (400)', moveSelf.status === 400);

  const moveBranch = await api('PATCH', `/folders/${child.data.id}`, { parentId: null });
  check('move folder branch to root', moveBranch.status === 200 && (moveBranch.data?.parentId ?? null) === null);

  // ── 7. Download ──
  const dl = await fetch(`${BASE}/documents/${up.data.id}/download`);
  const buf = Buffer.from(await dl.arrayBuffer());
  check('download streams file inline', dl.status === 200 && buf.length > 100 && (dl.headers.get('content-disposition') ?? '').includes('inline'));

  // ── 8. Delete folder → children promoted ──
  const del = await api('DELETE', `/folders/${child.data.id}`);
  check('delete folder', del.status === 200);
  ids.folders = ids.folders.filter((f) => f !== child.data.id);

  const tree3 = await api('GET', '/folders/tree');
  const gcT = tree3.data?.find((f) => f.id === grandchild.data.id);
  check('subfolder promoted to root after delete', gcT && (gcT.parentId ?? null) === null);

  const docsAfter = await api('GET', '/documents');
  const docAfter = docsAfter.data?.find((d) => d.id === up.data.id);
  check('doc promoted to root after folder delete', docAfter && (docAfter.folderId ?? null) === null);
} catch (err) {
  check('unexpected error', false, String(err));
} finally {
  // ── Cleanup ──
  for (const id of ids.docs) await api('DELETE', `/documents/${id}`);
  for (const id of ids.folders) await api('DELETE', `/folders/${id}`);
}

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
