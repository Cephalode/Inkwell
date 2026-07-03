import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import type { DocumentFile, Chapter } from '../types/document';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/** Extract a page range from a PDF blob, returning a new PDF blob. */
export async function splitPDF(
  sourceBlob: Blob,
  startPage: number,
  endPage: number,
): Promise<Blob> {
  const srcBytes = new Uint8Array(await sourceBlob.arrayBuffer());
  const srcDoc = await PDFDocument.load(srcBytes);
  const newDoc = await PDFDocument.create();
  const indices = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage - 1 + i);
  const pages = await newDoc.copyPages(srcDoc, indices);
  pages.forEach((p) => newDoc.addPage(p));
  const pdfBytes = await newDoc.save();
  // Cast needed: TS 5.7+ types Uint8Array as Uint8Array<ArrayBufferLike>, which
  // is not assignable to BlobPart (expects ArrayBuffer-backed view).
  return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
}

// Patterns for chapter headings in body text (font-size fallback)
const BODY_CHAPTER_PATTERNS = [
  /^chapter\s+\d+/i,
  /^chap\.\s*\d+/i,
  /^\d+\.\s+[A-Z]/,
  /^part\s+[IVXLC\d]+/i,
  /^unit\s+\d+/i,
  /^section\s+\d+/i,
];

// ── PDF outline (bookmarks) — Method 0: fastest, most reliable ──

interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineItem[];
}

const PART_PATTERNS = [/^(part|book|volume|unit)\s/i, /^[IVXLC]+(\s|$)/i];

async function resolvePageIdx(pdf: pdfjsLib.PDFDocumentProxy, item: OutlineItem): Promise<number | null> {
  if (!item.dest) return null;
  try {
    if (Array.isArray(item.dest)) return pdf.getPageIndex(item.dest[0] as pdfjsLib.RefProxy);
    const dest = await pdf.getDestination(item.dest);
    return dest ? pdf.getPageIndex(dest[0] as pdfjsLib.RefProxy) : null;
  } catch {
    return null;
  }
}

async function detectChaptersFromOutline(
  pdf: pdfjsLib.PDFDocumentProxy,
  totalPages: number,
): Promise<Chapter[] | null> {
  const outline = await pdf.getOutline();
  if (!outline || outline.length === 0) return null;

  const chapters: Chapter[] = [];

  for (const item of outline) {
    const titleLower = item.title.toLowerCase();
    if (isSkippableOutlineItem(titleLower)) continue;

    const isPartLike = PART_PATTERNS.some(p => p.test(item.title));
    const hasChildren = item.items && item.items.length > 0;

    // If this looks like a Part/Book heading with children, drill into children
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

    // Regular chapter entry
    const pageIdx = await resolvePageIdx(pdf, item);
    if (pageIdx === null || pageIdx < 0 || pageIdx >= totalPages) continue;

    chapters.push({ title: item.title.trim(), page: pageIdx + 1 });
  }

  return chapters.length >= 2 ? chapters : null;
}

function isSkippableOutlineItem(titleLower: string): boolean {
  const skipList = [
    'preface', 'foreword', 'acknowledgment', 'acknowledgement', 'acknowledgments',
    'contents', 'table of contents', 'index', 'references',
    'bibliography', 'appendix', 'colophon', 'dedication',
    'glossary', 'afterword',
    'list of figures', 'list of tables', 'list of exercises',
    'copyright', 'title page', 'unofficial',
  ];
  if (skipList.some(s => titleLower === s || titleLower.startsWith(s + ' '))) return true;

  // Skip pure roman-numeral front matter entries (e.g., "ii", "iii", "iv")
  if (/^[ivxlc]+$/i.test(titleLower.trim())) return true;

  return false;
}

// ── TOC text parsing — Method 1 ──

const TOC_TOP_LEVEL_PATTERNS = [
  /^chapter\s+\d+/i,
  /^\d+\.?\s+[A-Z]/,
  /^part\s+[IVXLC\d]+/i,
  /^unit\s+\d+/i,
];

function extractTOCPageNumber(text: string): number | null {
  const m = text.match(/(?:\.{2,}|\s{3,})\s*(\d+)\s*$/);
  if (m) return parseInt(m[1], 10);
  const nums = [...text.matchAll(/\b(\d+)\b/g)].map(m => parseInt(m[1], 10));
  return nums.length > 0 ? nums[nums.length - 1] : null;
}

function cleanTitle(text: string): string {
  return text.replace(/\.{2,}/g, ' ').replace(/\s+\d+\s*$/, '').trim();
}

interface PageLine { text: string; fontSize: number }

async function getPageLines(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<PageLine[]> {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();
  const lineMap = new Map<number, { parts: string[]; maxFont: number }>();

  for (const item of content.items) {
    if (!('str' in item) || !('transform' in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    if (!lineMap.has(y)) lineMap.set(y, { parts: [], maxFont: 0 });
    const line = lineMap.get(y)!;
    line.parts.push(str);
    const fs = Math.abs(item.transform[3]);
    if (fs > line.maxFont) line.maxFont = fs;
  }

  const lines: PageLine[] = [];
  for (const [, data] of lineMap) {
    const text = data.parts.join(' ').trim();
    if (text.length < 3) continue;
    lines.push({ text, fontSize: data.maxFont });
  }
  return lines;
}

async function findStandalonePageNumber(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<number | null> {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();
  const lineMap = new Map<number, string[]>();

  for (const item of content.items) {
    if (!('str' in item) || !('transform' in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y)!.push(str);
  }

  for (const [, strs] of lineMap) {
    if (strs.length === 1 && /^\d{1,4}$/.test(strs[0])) {
      return parseInt(strs[0], 10);
    }
  }
  return null;
}

async function detectChaptersFromTOC(
  pdf: pdfjsLib.PDFDocumentProxy,
  totalPages: number,
): Promise<Chapter[] | null> {
  // Method A: look for a "Contents" / "Table of Contents" heading
  let tocPage: number | null = null;
  outer:
  for (let batch = 0; batch < 3; batch++) {
    const start = batch * 10 + 1;
    const end = Math.min(start + 9, totalPages);
    for (let p = start; p <= end; p++) {
      const lines = await getPageLines(pdf, p);
      for (const line of lines) {
        const lower = line.text.toLowerCase();
        if (lower.startsWith('contents') || lower.startsWith('table of contents')) {
          tocPage = p;
          break outer;
        }
      }
    }
  }

  // Method B: find the page with the most TOC-style entries
  if (tocPage === null) {
    let bestPage = -1;
    let bestCount = 0;
    for (let p = 1; p <= Math.min(15, totalPages); p++) {
      const lines = await getPageLines(pdf, p);
      let count = 0;
      for (const line of lines) {
        if (TOC_TOP_LEVEL_PATTERNS.some(pat => pat.test(line.text))) {
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
  const entries: Array<{ title: string; printedPage: number }> = [];

  for (let p = tocPage; p <= tocEnd; p++) {
    const lines = await getPageLines(pdf, p);
    for (const line of lines) {
      if (!TOC_TOP_LEVEL_PATTERNS.some(pat => pat.test(line.text))) continue;
      const printedPage = extractTOCPageNumber(line.text);
      if (printedPage === null || printedPage <= 0) continue;
      entries.push({ title: cleanTitle(line.text), printedPage });
    }
  }

  if (entries.length === 0) return null;

  let offset = 0;
  const scanEnd = Math.min(tocEnd + 50, totalPages);
  for (let p = tocEnd + 1; p <= scanEnd; p++) {
    const footerNum = await findStandalonePageNumber(pdf, p);
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
    .map(e => ({ title: e.title, page: e.printedPage - offset }))
    .filter(c => c.page >= 1 && c.page <= totalPages);
}

// ── Font-size heuristic fallback — Method 2 ──

async function detectChaptersByFontSize(
  pdf: pdfjsLib.PDFDocumentProxy,
  totalPages: number,
): Promise<Chapter[]> {
  const chapters: Array<{ page: number; text: string }> = [];

  for (let p = 1; p <= totalPages; p++) {
    const lines = await getPageLines(pdf, p);
    if (lines.length === 0) continue;

    const uniqueFonts = [...new Set(lines.map(l => l.fontSize))].sort((a, b) => b - a);
    const topFonts = new Set(uniqueFonts.slice(0, Math.min(3, uniqueFonts.length)));

    for (const line of lines) {
      if (!topFonts.has(line.fontSize)) continue;
      if (!BODY_CHAPTER_PATTERNS.some(pat => pat.test(line.text))) continue;
      chapters.push({ page: p, text: line.text });
    }
  }

  if (chapters.length === 0) return [];

  const deduped: Chapter[] = [];
  for (const ch of chapters) {
    if (deduped.length === 0 || ch.page !== deduped[deduped.length - 1].page) {
      deduped.push({ title: cleanTitle(ch.text), page: ch.page });
    }
  }

  return deduped;
}

// ── Main entry point ──

/**
 * Detect chapters using a 3-tier strategy:
 * 0. PDF outlines/bookmarks (instant, structured metadata)
 * 1. Table of Contents text parsing (scans first ~30 pages)
 * 2. Font-size heuristic fallback (scans entire document)
 */
export async function detectChapters(doc: DocumentFile): Promise<Chapter[]> {
  if (!doc.rawBlob) throw new Error('No PDF data available');

  const arrayBuffer = await doc.rawBlob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  // Tier 0: PDF outlines (bookmarks) — instant, most reliable
  const outlineResult = await detectChaptersFromOutline(pdf, totalPages);
  if (outlineResult && outlineResult.length > 0) return outlineResult;

  // Tier 1: TOC text parsing
  const tocResult = await detectChaptersFromTOC(pdf, totalPages);
  if (tocResult && tocResult.length > 0) return tocResult;

  // Tier 2: font-size heuristic
  return detectChaptersByFontSize(pdf, totalPages);
}
