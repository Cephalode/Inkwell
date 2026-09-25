/**
 * textbook-splitter — core chapter detection + PDF splitting.
 *
 * Ported from inkwell's src/services/chapterExtractor.ts (browser version),
 * adapted for Node: pdfjs-dist legacy build (no worker bundling), no DOM Blob.
 *
 * 3-tier detection strategy, in order:
 *   Tier 0 — PDF outline / bookmarks (most reliable, validated on 8 textbooks)
 *   Tier 1 — Table-of-Contents text parsing (first ~30 pages) + page-offset
 *            calibration via standalone printed page numbers
 *   Tier 2 — Font-size heuristic over the whole document
 */
import fs from 'node:fs';
import * as pdfLib from 'pdf-lib';

// Legacy build = no web worker, works in plain Node.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

// ── Patterns for chapter headings in body text (font-size fallback) ──
const BODY_CHAPTER_PATTERNS = [
  /^chapter\s+\d+/i,
  /^chap\.\s*\d+/i,
  /^\d+\.\s+[A-Z]/,
  /^part\s+[IVXLC\d]+/i,
  /^unit\s+\d+/i,
  /^section\s+\d+/i,
];

const PART_PATTERNS = [/^(part|book|volume|unit)\s/i, /^[IVXLC]+(\s|$)/i];

const TOC_TOP_LEVEL_PATTERNS = [
  /^chapter\s+\d+/i,
  /^\d+\.?\s+[A-Z]/,
  /^part\s+[IVXLC\d]+/i,
  /^unit\s+\d+/i,
];

function isSkippableOutlineItem(titleLower) {
  const skipList = [
    'preface', 'foreword', 'acknowledgment', 'acknowledgement', 'acknowledgments',
    'contents', 'table of contents', 'index', 'references',
    'bibliography', 'appendix', 'appendices', 'colophon', 'dedication',
    'glossary', 'afterword',
    'list of figures', 'list of tables', 'list of exercises',
    'copyright', 'title page', 'unofficial',
  ];
  if (skipList.some((s) => titleLower === s || titleLower.startsWith(s + ' '))) return true;
  // Pure roman-numeral front-matter entries (e.g. "ii", "iii", "iv")
  if (/^[ivxlc]+$/i.test(titleLower.trim())) return true;
  return false;
}

/** Resolve an outline item's dest to a 0-based page index, or null. */
async function resolvePageIdx(pdf, item) {
  if (!item.dest) return null;
  try {
    if (Array.isArray(item.dest)) return pdf.getPageIndex(item.dest[0]);
    const dest = await pdf.getDestination(item.dest);
    return dest ? pdf.getPageIndex(dest[0]) : null;
  } catch {
    return null;
  }
}

/** Tier 0 — PDF outline (bookmarks). */
async function detectChaptersFromOutline(pdf, totalPages) {
  const outline = await pdf.getOutline();
  if (!outline || outline.length === 0) return null;

  const chapters = [];

  for (const item of outline) {
    const titleLower = item.title.toLowerCase();
    if (isSkippableOutlineItem(titleLower)) continue;

    const isPartLike = PART_PATTERNS.some((p) => p.test(item.title));
    const hasChildren = item.items && item.items.length > 0;

    // Part/Book heading with children → drill into children as chapters
    if (isPartLike && hasChildren) {
      for (const child of item.items) {
        const childLower = child.title.toLowerCase();
        if (isSkippableOutlineItem(childLower)) continue;
        const pageIdx = await resolvePageIdx(pdf, child);
        if (pageIdx === null || pageIdx < 0 || pageIdx >= totalPages) continue;
        chapters.push({ title: child.title.trim(), page: pageIdx + 1 });
      }
      continue;
    }

    const pageIdx = await resolvePageIdx(pdf, item);
    if (pageIdx === null || pageIdx < 0 || pageIdx >= totalPages) continue;
    chapters.push({ title: item.title.trim(), page: pageIdx + 1 });
  }

  return chapters.length >= 2 ? chapters : null;
}

// ── TOC text parsing — Tier 1 ──

function extractTOCPageNumber(text) {
  const m = text.match(/(?:\.{2,}|\s{3,})\s*(\d+)\s*$/);
  if (m) return parseInt(m[1], 10);
  const nums = [...text.matchAll(/\b(\d+)\b/g)].map((mm) => parseInt(mm[1], 10));
  return nums.length > 0 ? nums[nums.length - 1] : null;
}

function cleanTitle(text) {
  return text.replace(/\.{2,}/g, ' ').replace(/\s+\d+\s*$/, '').trim();
}

function getPageLines(content) {
  const lineMap = new Map();
  for (const item of content.items) {
    if (!('str' in item) || !('transform' in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    if (!lineMap.has(y)) lineMap.set(y, { parts: [], maxFont: 0 });
    const line = lineMap.get(y);
    line.parts.push(str);
    const fs = Math.abs(item.transform[3]);
    if (fs > line.maxFont) line.maxFont = fs;
  }
  const lines = [];
  for (const [, data] of lineMap) {
    const text = data.parts.join(' ').trim();
    if (text.length < 3) continue;
    lines.push({ text, fontSize: data.maxFont });
  }
  return lines;
}

/** Find a standalone printed page number (its own line) on a page. */
function findStandalonePageNumber(content) {
  const lineMap = new Map();
  for (const item of content.items) {
    if (!('str' in item) || !('transform' in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push(str);
  }
  for (const [, strs] of lineMap) {
    if (strs.length === 1 && /^\d{1,4}$/.test(strs[0])) {
      return parseInt(strs[0], 10);
    }
  }
  return null;
}

/** Tier 1 — TOC text parsing with printed→PDF page offset calibration. */
async function detectChaptersFromTOC(pdf, totalPages) {
  // Method A: a "Contents" / "Table of Contents" heading in the first ~30 pages
  let tocPage = null;
  outer:
  for (let batch = 0; batch < 3; batch++) {
    const start = batch * 10 + 1;
    const end = Math.min(start + 9, totalPages);
    for (let p = start; p <= end; p++) {
      const page = await pdf.getPage(p);
      const lines = getPageLines(await page.getTextContent());
      for (const line of lines) {
        const lower = line.text.toLowerCase();
        if (lower.startsWith('contents') || lower.startsWith('table of contents')) {
          tocPage = p;
          break outer;
        }
      }
    }
  }

  // Method B: page with the most TOC-style entries
  if (tocPage === null) {
    let bestPage = -1;
    let bestCount = 0;
    for (let p = 1; p <= Math.min(15, totalPages); p++) {
      const page = await pdf.getPage(p);
      const lines = getPageLines(await page.getTextContent());
      let count = 0;
      for (const line of lines) {
        if (TOC_TOP_LEVEL_PATTERNS.some((pat) => pat.test(line.text))) {
          if (extractTOCPageNumber(line.text) !== null) count++;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestPage = p;
      }
    }
    if (bestCount >= 3) tocPage = bestPage;
  }

  if (tocPage === null) return null;

  const tocEnd = Math.min(tocPage + 9, totalPages);
  const entries = [];

  for (let p = tocPage; p <= tocEnd; p++) {
    const page = await pdf.getPage(p);
    const lines = getPageLines(await page.getTextContent());
    for (const line of lines) {
      if (!TOC_TOP_LEVEL_PATTERNS.some((pat) => pat.test(line.text))) continue;
      const printedPage = extractTOCPageNumber(line.text);
      if (printedPage === null || printedPage <= 0) continue;
      entries.push({ title: cleanTitle(line.text), printedPage });
    }
  }

  if (entries.length === 0) return null;

  // Calibrate printed→PDF offset using standalone page numbers after the TOC
  let offset = 0;
  const scanEnd = Math.min(tocEnd + 50, totalPages);
  for (let p = tocEnd + 1; p <= scanEnd; p++) {
    const page = await pdf.getPage(p);
    const footerNum = findStandalonePageNumber(await page.getTextContent());
    if (footerNum !== null && footerNum > 0) {
      const candidate = footerNum - p;
      const firstPdfPage = entries[0].printedPage - candidate;
      if (firstPdfPage > tocEnd && firstPdfPage <= totalPages) {
        offset = candidate;
        break;
      }
    }
  }

  return entries
    .map((e) => ({ title: e.title, page: e.printedPage - offset }))
    .filter((c) => c.page >= 1 && c.page <= totalPages);
}

/** Tier 2 — font-size heuristic over the whole document. */
async function detectChaptersByFontSize(pdf, totalPages, onProgress) {
  const found = [];

  for (let p = 1; p <= totalPages; p++) {
    if (onProgress && p % 50 === 0) onProgress(p, totalPages);
    const page = await pdf.getPage(p);
    const lines = getPageLines(await page.getTextContent());
    if (lines.length === 0) continue;

    const uniqueFonts = [...new Set(lines.map((l) => l.fontSize))].sort((a, b) => b - a);
    const topFonts = new Set(uniqueFonts.slice(0, Math.min(3, uniqueFonts.length)));

    for (const line of lines) {
      if (!topFonts.has(line.fontSize)) continue;
      if (!BODY_CHAPTER_PATTERNS.some((pat) => pat.test(line.text))) continue;
      found.push({ page: p, text: line.text });
    }
  }

  if (found.length === 0) return [];

  const deduped = [];
  for (const ch of found) {
    if (deduped.length === 0 || ch.page !== deduped[deduped.length - 1].page) {
      deduped.push({ title: cleanTitle(ch.text), page: ch.page });
    }
  }
  return deduped;
}

/**
 * Load a PDF from a file path.
 * @returns {{ pdf: PDFDocumentProxy, totalPages: number, data: Uint8Array }}
 */
export async function loadPdf(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  // Pass pdf.js a COPY: it may transfer (detach) the buffer it is given,
  // which would leave `data` empty for later splitRange() calls.
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data), useWorkerFetch: false, isEvalSupported: false }).promise;
  return { pdf, totalPages: pdf.numPages, data };
}

/**
 * Detect chapters using the 3-tier strategy.
 * @param {PDFDocumentProxy} pdf
 * @param {number} totalPages
 * @param {{ onProgress?: (p: number, total: number) => void, method?: 'auto'|'outline'|'toc'|'font' }} [opts]
 * @returns {Promise<{ chapters: Array<{title: string, page: number}>, method: string }>}
 */
export async function detectChapters(pdf, totalPages, opts = {}) {
  const { onProgress, method = 'auto' } = opts;

  if (method === 'auto' || method === 'outline') {
    const outlineResult = await detectChaptersFromOutline(pdf, totalPages);
    if (outlineResult && outlineResult.length > 0) {
      return { chapters: outlineResult, method: 'outline' };
    }
    if (method === 'outline') {
      throw new Error('No usable PDF outline found (try --method auto)');
    }
  }

  if (method === 'auto' || method === 'toc') {
    const tocResult = await detectChaptersFromTOC(pdf, totalPages);
    if (tocResult && tocResult.length > 0) {
      return { chapters: tocResult, method: 'toc' };
    }
    if (method === 'toc') {
      throw new Error('No table of contents found (try --method auto or --method font)');
    }
  }

  const chapters = await detectChaptersByFontSize(pdf, totalPages, onProgress);
  return { chapters, method: 'font' };
}

/**
 * Extract one chapter [startPage, endPage] into a standalone PDF buffer.
 * Pages are 1-based and inclusive.
 */
export async function splitRange(data, startPage, endPage) {
  const srcDoc = await pdfLib.PDFDocument.load(data, { ignoreEncryption: true });
  const newDoc = await pdfLib.PDFDocument.create();
  const indices = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage - 1 + i);
  const pages = await newDoc.copyPages(srcDoc, indices);
  pages.forEach((p) => newDoc.addPage(p));
  return newDoc.save();
}

/** Compute end pages for chapters (each chapter runs until the next starts; last runs to totalPages). */
export function computeEndPages(chapters, totalPages) {
  return chapters.map((ch, i) => ({
    ...ch,
    endPage: i + 1 < chapters.length ? chapters[i + 1].page - 1 : totalPages,
  }));
}

/** Filesystem-safe name: "Chapter 1: Foo/Bar" → "Chapter 1 - Foo_Bar" */
export function sanitizeTitle(title, index) {
  const clean = (title || `Chapter ${index + 1}`)
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_. ]+|[-_. ]+$/g, '')
    .slice(0, 120)
    .trim();
  return clean || `Chapter ${index + 1}`;
}

/** Output filename: "textbook - 01 - Chapter Title.pdf" */
export function chapterFileName(baseName, index, title) {
  const num = String(index + 1).padStart(2, '0');
  return `${baseName} - ${num} - ${sanitizeTitle(title, index)}.pdf`;
}
