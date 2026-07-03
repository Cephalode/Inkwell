import { readFileSync } from 'fs';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';

// ── Configure pdfjs-dist worker for Node.js (legacy build has no DOMMatrix dep) ──
const nodeRequire = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

// ── Types ───────────────────────────────────────────────────────────────────
export interface TextItem {
  text: string;
  fontSize: number;
  x: number;
  y: number;
}

export interface Line {
  /** Joined text of all items on this line, in left-to-right order. */
  text: string;
  /** Representative (max) font size among the items on the line. */
  fontSize: number;
  /** X position of the left-most item. */
  x: number;
  /** Y baseline of the line (PDF user-space units, origin bottom-left). */
  y: number;
  /** Raw text items that compose this line. */
  items: TextItem[];
}

export interface PageContent {
  pageNumber: number;
  items: TextItem[];
  lines: Line[];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract text items (with font metadata) for a page range of a PDF file.
 * Items are also grouped into visual lines by y-position proximity.
 *
 * @param filePath  Absolute path to the PDF on disk.
 * @param startPage 1-indexed inclusive start page.
 * @param endPage   1-indexed inclusive end page.
 */
export async function extractTextWithFonts(
  filePath: string,
  startPage: number,
  endPage: number,
): Promise<PageContent[]> {
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await getDocument({ data }).promise;

  const totalPages = pdf.numPages;
  const safeStart = Math.max(1, Math.min(startPage, totalPages));
  const safeEnd = Math.max(safeStart, Math.min(endPage, totalPages));

  const pages: PageContent[] = [];
  try {
    for (let p = safeStart; p <= safeEnd; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();

      const items: TextItem[] = [];
      for (const raw of content.items) {
        // Only genuine text items have a `str`; skip marked-content markers.
        if (typeof (raw as { str?: unknown }).str !== 'string') continue;
        const ti = raw as { str: string; transform: number[] };
        if (ti.str.length === 0) continue; // empty runs are position markers

        const t = ti.transform;
        // Font size ≈ vertical scale of the text matrix.
        const fontSize = Math.sqrt(t[2] * t[2] + t[3] * t[3]);
        items.push({ text: ti.str, fontSize, x: t[4], y: t[5] });
      }

      pages.push({
        pageNumber: p,
        items,
        lines: groupIntoLines(items),
      });
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}

/** Concatenate the line text of every page into a single chapter string. */
export function pagesToText(pages: PageContent[]): string {
  return pages
    .map((p) => p.lines.map((l) => l.text).join('\n'))
    .join('\n\n');
}

// ── Internals ───────────────────────────────────────────────────────────────

/**
 * Group raw text items into visual lines by clustering on the y baseline.
 * Items on the same line are ordered left-to-right by x and concatenated.
 */
function groupIntoLines(items: TextItem[], tolerance = 3): Line[] {
  const buckets: Line[] = [];

  for (const item of items) {
    const existing = buckets.find((b) => Math.abs(b.y - item.y) <= tolerance);
    if (existing) {
      existing.items.push(item);
      if (item.fontSize > existing.fontSize) existing.fontSize = item.fontSize;
    } else {
      buckets.push({
        text: item.text,
        fontSize: item.fontSize,
        x: item.x,
        y: item.y,
        items: [item],
      });
    }
  }

  // Order items within each line by x, rebuild text, then sort lines top→bottom.
  for (const line of buckets) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.text).join('').trim();
    line.x = line.items[0]?.x ?? 0;
  }

  return buckets
    .filter((l) => l.text.length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);
}
