import { PDFDocument } from 'pdf-lib';
import { chatCompletion } from './ai/client';
import type { DocumentFile, ChapterDocument, Chapter } from '../types/document';
import { extractPageRange, getPDFPageCount } from './parsers/pdfParser';

/**
 * Ask the LLM to detect chapter titles and starting page numbers from
 * the first few pages of the document. Returns sorted Chapter[].
 */
export async function detectChapters(doc: DocumentFile): Promise<Chapter[]> {
  if (!doc.rawBlob) return [];

  const pageCount = await getPDFPageCount(doc.rawBlob);
  const sampleEnd = Math.min(5, pageCount);
  const sampleText = await extractPageRange(doc.rawBlob, 1, sampleEnd);
  const truncated = sampleText.length > 3000
    ? sampleText.slice(0, 3000) + '\n\n[... text truncated ...]'
    : sampleText;

  const prompt = [
    {
      role: 'system',
      content: `Analyze the text extracted from a PDF (pages 1–${sampleEnd} of ${pageCount} total). Identify every chapter or major section heading and its starting page number.

Look for patterns like "Chapter 1", "CHAPTER ONE", "Part I", "Section 1", etc.

Return ONLY a JSON array: [{"title": "Chapter Title", "page": 1}, ...]
If none found, return []. No other text.`,
    },
    { role: 'user', content: truncated },
  ];

  const response = await chatCompletion(prompt);

  let raw = response.trim();
  const fence = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fence) raw = fence[1].trim();

  let chapters: Chapter[];
  try {
    chapters = JSON.parse(raw);
  } catch {
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    if (s !== -1 && e !== -1) {
      try { chapters = JSON.parse(raw.slice(s, e + 1)); } catch { return []; }
    } else return [];
  }

  if (!Array.isArray(chapters)) return [];
  return chapters
    .filter((c: any) => typeof c.title === 'string' && typeof c.page === 'number')
    .map((c: any) => ({ title: String(c.title).trim(), page: Math.round(Number(c.page)) }))
    .sort((a, b) => a.page - b.page);
}

/**
 * Split a PDF into chapter PDFs using pdf-lib (native page copying — fast).
 * Detects chapters via LLM, then copies each page range into a standalone PDF.
 */
export async function splitPDFIntoChapters(doc: DocumentFile): Promise<ChapterDocument[]> {
  if (!doc.rawBlob) return [];

  const chapters = await detectChapters(doc);
  if (chapters.length === 0) return [];

  const totalPages = await getPDFPageCount(doc.rawBlob);
  const srcBytes = new Uint8Array(await doc.rawBlob.arrayBuffer());
  const srcPdf = await PDFDocument.load(srcBytes);
  const now = Date.now();

  const results: ChapterDocument[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const startPage = Math.max(1, chapters[i].page);
    const endPage = i + 1 < chapters.length
      ? Math.min(chapters[i + 1].page - 1, totalPages)
      : totalPages;
    if (startPage > endPage) continue;

    const newPdf = await PDFDocument.create();
    const indices = Array.from({ length: endPage - startPage + 1 }, (_, k) => startPage - 1 + k);
    const copiedPages = await newPdf.copyPages(srcPdf, indices);
    copiedPages.forEach(p => newPdf.addPage(p));
    const pdfBytes = await newPdf.save();
    const rawBlob = new Blob([pdfBytes], { type: 'application/pdf' });

    const parsedText = await extractPageRange(doc.rawBlob, startPage, endPage);

    results.push({
      id: `${doc.id}_ch${i}`,
      parentId: doc.id,
      chapterTitle: chapters[i].title,
      chapterIndex: i,
      startPage,
      endPage,
      rawBlob,
      parsedText,
      tags: [...doc.tags],
      createdAt: now,
      updatedAt: now,
    });
  }

  return results;
}
